/**
 * Client side of the gate (`docker/root/opt/nizam-gate/gate.py`): login, lock,
 * and the session check.
 *
 * The session token travels in the page URL as `?token=`, which is where the
 * Selkies 2.0 core reads it (`selkies-web-core/lib/session-token.js`). A login
 * or a lock is therefore a full page load: the core mirrors the token into its
 * API cookie while it loads, so a token swapped into a running page would
 * leave that cookie stale. A lock replaces the desktop's history entry; a
 * login adds one, so the locked page stays behind the desktop.
 *
 * Selkies enforces the lock itself by dropping the revoked token's stream.
 * `watchSession` only brings this page back to the locked view when the lock
 * came from somewhere else (another device logging in, a lock in another tab):
 * the core gives up on a revoked token without telling the dashboard.
 *
 * Back or Forward locks the session; a reload keeps it. A page cannot tell
 * those apart as it goes (Chrome's `navigate` event marks a traversal only
 * between pages of one origin, and the page before the locked one is usually
 * another site), so the lock happens where the history lands instead. Back
 * from the desktop lands on the locked page kept behind it, which locks the
 * session the tab last held (`holdSession`, `dropHeldSession`); Forward, or
 * Back to a desktop left any other way, lands on a tokened entry, which is
 * locked rather than resumed (`main.jsx`). A page the back/forward cache
 * restores counts as landing there too.
 *
 * The gate never answers 401, which the core's auth guard would turn into a
 * page reload.
 * @module
 */
import { getRoutePrefix } from "../utils";

/** An application the desktop offers, as the gate lists it for the dock. */
export interface DesktopApp {
  /** Desktop ID, e.g. `chromium.desktop`. */
  id: string;
  /** Display name. */
  name: string;
  /** One-line description, possibly empty. */
  comment: string;
  /** Icon as a data URI, or null when it has none a browser can draw. */
  icon: string | null;
  /** Shell command that launches it on the desktop. */
  command: string;
  /** Best guess at whether it is running. */
  running: boolean;
}

/** A gate answer that is neither success nor a wrong password. */
export class GateError extends Error {
  /** HTTP status, or 0 when the gate could not be reached. */
  status: number;
  /** Seconds the caller should wait, from `Retry-After`. */
  retryAfter: number;

  constructor(status: number, retryAfter = 0) {
    super(`gate answered ${status}`);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const SESSION_CHECK_MS = 5000;

const gateUrl = (path: string): string => `${getRoutePrefix()}/auth/${path}`;

/** The session token the page was opened with, or "". */
export function pageToken(): string {
  return new URLSearchParams(window.location.search).get("token") || "";
}

/**
 * Takes the token out of the address bar without a reload.
 */
export function forgetPageToken(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("token");
  window.history.replaceState(window.history.state, "", url.href);
}

/**
 * Loads the page again with `token` in its URL, or with none. Entering a
 * session adds a history entry and leaving one replaces it (module docblock).
 * @param token The new session token, or null for the locked page.
 */
function reloadWithToken(token: string | null): void {
  const url = new URL(window.location.href);
  if (token) {
    url.searchParams.set("token", token);
    window.location.assign(url.href);
  } else {
    url.searchParams.delete("token");
    window.location.replace(url.href);
  }
}

/** Calls the gate; network failures surface as a `GateError` with status 0. */
async function call(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(gateUrl(path), { cache: "no-store", credentials: "same-origin", ...init });
  } catch {
    throw new GateError(0);
  }
}

const bearer = (token: string): HeadersInit => ({ Authorization: `Bearer ${token}` });

/**
 * Asks the gate whether `token` is the live session.
 * @param token Session token.
 * @returns `"live"`, `"revoked"`, or `"unknown"` when the gate did not answer
 *     either way. Selkies still enforces the token in the unknown case.
 */
export async function checkSession(token: string): Promise<"live" | "revoked" | "unknown"> {
  try {
    const response = await call("session", { headers: bearer(token) });
    if (response.status === 204) return "live";
    if (response.status === 403) return "revoked";
  } catch {
    // An unreachable gate proves nothing about the token.
  }
  return "unknown";
}

/**
 * Logs in and, on success, reloads the page into the session.
 * @param password The gate password.
 * @returns false for a wrong password; on success the page navigates away.
 * @throws {GateError} When the gate throttles, fails, or cannot be reached.
 */
export async function login(password: string): Promise<boolean> {
  const response = await call("login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (response.ok) {
    const { token } = await response.json();
    reloadWithToken(token);
    return true;
  }
  const retryAfter = Number(response.headers.get("Retry-After")) || 0;
  if (response.status === 403 && !retryAfter) return false;
  throw new GateError(response.status === 403 ? 429 : response.status, retryAfter);
}

/**
 * Locks the session and reloads the page into the locked view. A token the
 * gate no longer recognizes is already locked, so that counts as success.
 * @throws {GateError} When the gate could not lock.
 */
export async function lock(): Promise<void> {
  const response = await call("lock", { method: "POST", headers: bearer(pageToken()) });
  if (response.status !== 204 && response.status !== 403) throw new GateError(response.status);
  reloadWithToken(null);
}

/**
 * Locks the session `token` belongs to, if it is still the live one, without
 * touching the page. A failure is ignored: the caller shows the locked page
 * either way, and the gate refuses a stale token rather than ending a newer
 * session with it.
 * @param token Session token.
 */
export async function dropSession(token: string): Promise<void> {
  try {
    await call("lock", { method: "POST", headers: bearer(token) });
  } catch {
    // Unreachable: nothing more this page can do.
  }
}

/** Whether the page was opened by Back or Forward, not loaded, reloaded, or logged into. */
export function arrivedThroughHistory(): boolean {
  const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  return entry?.type === "back_forward";
}

const HELD_SESSION_KEY = "nizam-session";

/**
 * Remembers `token` as the session this tab streams with, for the locked page
 * to drop when Back returns to it, and locks it should the back/forward cache
 * restore this page, whose stream is gone by then.
 * @param token The token this page streams with.
 */
export function holdSession(token: string): void {
  try {
    sessionStorage.setItem(HELD_SESSION_KEY, token);
  } catch {
    // Storage blocked: Forward still lands on a tokened entry and locks there.
  }
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) void dropSession(token).then(() => reloadWithToken(null));
  });
}

/** Locks and forgets the session this tab last held, if any. */
export function dropHeldSession(): void {
  let token: string | null = null;
  try {
    token = sessionStorage.getItem(HELD_SESSION_KEY);
    sessionStorage.removeItem(HELD_SESSION_KEY);
  } catch {
    // Storage blocked: nothing was held.
  }
  if (token) void dropSession(token);
}

/**
 * Lists the desktop's applications.
 * @throws {GateError} When the gate refuses or cannot be reached.
 */
export async function fetchApps(): Promise<DesktopApp[]> {
  const response = await call("apps", { headers: bearer(pageToken()) });
  if (!response.ok) throw new GateError(response.status);
  return (await response.json()).apps;
}

/**
 * Returns the page to the locked view once the gate stops recognizing
 * `token`, checking every few seconds and whenever the tab becomes visible.
 * @param token The token this page streams with.
 */
export function watchSession(token: string): void {
  let checking = false;
  const check = async () => {
    if (checking || document.visibilityState !== "visible") return;
    checking = true;
    try {
      if ((await checkSession(token)) === "revoked") reloadWithToken(null);
    } finally {
      checking = false;
    }
  };
  window.setInterval(check, SESSION_CHECK_MS);
  document.addEventListener("visibilitychange", check);
}
