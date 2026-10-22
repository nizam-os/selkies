/**
 * The lock shortcut, Ctrl+Shift+L, beside the core's own Ctrl+Shift hotkeys
 * (`selkies-web-core/lib/input.js`: M, F, X, and G).
 *
 * The core forwards keys to the remote desktop from a capture-phase `keydown`
 * listener on `window` that it adds when it starts. Listeners on one target
 * and phase run in the order they were added, so this one, installed before
 * `selkiesCoreInitialize()`, sees the chord first and stops it: the L never
 * reaches the desktop. The Ctrl and Shift already sent are released by the
 * server when the lock drops the connection (`reset_keyboard` in
 * `src/selkies/websockets_mode.py`).
 * @module
 */
import { toast } from "sonner";
import { t } from "@/i18n";
import { lock } from "./gate";

/**
 * Whether `event` is Ctrl+Shift+L with no other modifier. The physical key is
 * matched, as the core matches its own hotkeys, so the chord sits in the same
 * place on every layout.
 * @param event Keyboard event.
 */
export function isLockChord(event: KeyboardEvent): boolean {
  return event.code === "KeyL" && event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey;
}

/** Installs the shortcut. Call once, before the core starts. */
export function installLockShortcut(): void {
  let locking = false;
  const swallow = (event: KeyboardEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  window.addEventListener("keydown", (event) => {
    if (!isLockChord(event)) return;
    swallow(event);
    if (locking) return;
    locking = true;
    lock().catch(() => {
      locking = false;
      toast.error(t("gate.lockFailed"));
    });
  }, true);
  window.addEventListener("keyup", (event) => {
    if (isLockChord(event)) swallow(event);
  }, true);
}
