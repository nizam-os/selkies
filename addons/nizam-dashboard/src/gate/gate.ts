/**
 * Client side of the gate (`docker/root/opt/nizam-gate/gate.py`): login, lock,
 * and the session check.
 *
 * The session token never reaches this page. The gate keeps it in an HttpOnly
 * cookie, which nginx hands to Selkies (`docker/root/defaults/nizam-gate.conf`),
 * so no URL the browser shows, records in its history, or sends ever holds it.
 * The core, finding no `?token=` in the page URL, connects as Selkies' legacy
 * client: the controller in slot 1, which is what the cookie's token grants.
 *
 * The cookie is shared by every tab, so a tab marks its own login in
 * `sessionStorage` and streams only with that mark (`main.jsx`): a new tab
 * opens on the locked page even while another tab streams. A login or a lock
 * is a full page load. A login pushes a history entry for the desktop onto
 * the same URL, so the locked page stays behind it and the address bar never
 * changes; a lock reloads the entry it is on.
 *
 * Selkies enforces the lock itself by dropping the revoked token's stream.
 * `watchSession` only brings this page back to the locked view when the lock
 * came from somewhere else (another device logging in, a lock in another tab):
 * the core gives up on a revoked token without telling the dashboard.
 *
 * Back or Forward locks the session; a reload keeps it. A page cannot tell
 * those apart as it goes (Chrome's `navigate` event marks a traversal only
 * between pages of one origin, and the page before the locked one is usually
 * another site), so the lock happens where the history lands instead. The
 * desktop and the locked page behind it share a URL, so Chrome steps between
 * them inside one document: Back from the desktop is a `popstate`, which
 * locks (`watchSession`), and Forward from the locked page changes nothing. A
 * tab that held the session and loads either entry by Back or Forward from
 * elsewhere locks it too (`dropHeldSession`), and a page the back/forward
 * cache restores counts as arriving there.
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
const HELD_SESSION_KEY = "nizam-session";

const gateUrl = (path: string): string => `${getRoutePrefix()}/auth/${path}`;

/** Calls the gate; network failures surface as a `GateError` with status 0. */
async function call(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(gateUrl(path), { cache: "no-store", credentials: "same-origin", ...init });
  } catch {
    throw new GateError(0);
  }
}

/** Whether this tab entered the session through its own login and has not left it. */
export function holdsSession(): boolean {
  try {
    return sessionStorage.getItem(HELD_SESSION_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Forgets this tab's hold on the session.
 * @returns Whether the tab held it.
 */
function releaseSession(): boolean {
  const held = holdsSession();
  try {
    sessionStorage.removeItem(HELD_SESSION_KEY);
  } catch {
    // Storage blocked: nothing was held.
  }
  return held;
}

/** Reloads the page on the entry it is on, which shows the locked page once the hold is gone. */
function showLockedPage(): void {
  window.location.reload();
}

/**
 * Asks the gate whether the cookie holds the live session.
 * @returns `"live"`, `"revoked"`, or `"unknown"` when the gate did not answer
 *     either way. Selkies still enforces the token in the unknown case.
 */
export async function checkSession(): Promise<"live" | "revoked" | "unknown"> {
  try {
    const response = await call("session");
    if (response.status === 204) return "live";
    if (response.status === 403) return "revoked";
  } catch {
    // An unreachable gate proves nothing about the session.
  }
  return "unknown";
}

/**
 * Logs in and, on success, loads the desktop on a new history entry, the
 * locked page staying behind it. Without storage to hold the session in, the
 * tab could never stream, so that counts as a gate failure.
 * @param password The gate password.
 * @returns false for a wrong password; on success the page reloads.
 * @throws {GateError} When the gate throttles, fails, or cannot be reached.
 */
export async function login(password: string): Promise<boolean> {
  const response = await call("login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (response.ok) {
    try {
      sessionStorage.setItem(HELD_SESSION_KEY, "1");
    } catch {
      throw new GateError(0);
    }
    window.history.pushState(null, "", window.location.href);
    window.location.reload();
    return true;
  }
  const retryAfter = Number(response.headers.get("Retry-After")) || 0;
  if (response.status === 403 && !retryAfter) return false;
  throw new GateError(response.status === 403 ? 429 : response.status, retryAfter);
}

/**
 * Locks the session and reloads the page into the locked view. A session the
 * gate no longer recognizes is already locked, so that counts as success.
 * @throws {GateError} When the gate could not lock.
 */
export async function lock(): Promise<void> {
  const response = await call("lock", { method: "POST" });
  if (response.status !== 204 && response.status !== 403) throw new GateError(response.status);
  releaseSession();
  showLockedPage();
}

/**
 * Locks the session without touching the page. A failure is ignored: the
 * caller shows the locked page either way.
 */
async function dropSession(): Promise<void> {
  try {
    await call("lock", { method: "POST" });
  } catch {
    // Unreachable: nothing more this page can do.
  }
}

/**
 * Locks the session if this tab held it, and forgets the hold. A tab that
 * never logged in leaves alone a session another tab streams with.
 */
export function dropHeldSession(): void {
  if (releaseSession()) void dropSession();
}

/** Whether the page was opened by Back or Forward, not loaded, reloaded, or logged into. */
export function arrivedThroughHistory(): boolean {
  const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  return entry?.type === "back_forward";
}

/**
 * Lists the desktop's applications.
 * @throws {GateError} When the gate refuses or cannot be reached.
 */
export async function fetchApps(): Promise<DesktopApp[]> {
  const response = await call("apps");
  if (!response.ok) throw new GateError(response.status);
  return (await response.json()).apps;
}

/**
 * Returns the page to the locked view once the gate stops recognizing the
 * session, checking every few seconds and whenever the tab becomes visible.
 * Locks it on Back to the locked page's entry, and should the back/forward
 * cache restore this page, whose stream is gone by then.
 */
export function watchSession(): void {
  let checking = false;
  const check = async () => {
    if (checking || document.visibilityState !== "visible") return;
    checking = true;
    try {
      if ((await checkSession()) === "revoked") {
        releaseSession();
        showLockedPage();
      }
    } finally {
      checking = false;
    }
  };
  window.setInterval(check, SESSION_CHECK_MS);
  document.addEventListener("visibilitychange", check);
  const leave = () => {
    releaseSession();
    void dropSession().then(showLockedPage);
  };
  window.addEventListener("popstate", leave);
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) leave();
  });
}
