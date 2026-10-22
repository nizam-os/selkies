/**
 * Touch-screen helpers: the on-screen keyboard, trackpad mode, and the soft
 * modifier keys a touch keyboard lacks.
 *
 * The modifiers are synthetic `KeyboardEvent`s dispatched on `window`, where
 * the core's input handler takes them like real ones; while any is held the
 * core is in synthetic-key mode (`setSynth`), so the next key typed on the
 * touch keyboard carries them.
 * @module
 */
import React, { useState } from "react";
import { Keyboard, Touchpad } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/**
 * Pops the on-screen keyboard by focusing the core's keyboard-assist input,
 * releasing it again on the next touch of the interaction overlay.
 */
export function showVirtualKeyboard(): void {
  const assist = document.getElementById("keyboard-input-assist") as HTMLInputElement | null;
  const overlay = document.getElementById("overlayInput");
  if (!assist) return;
  assist.removeAttribute("aria-hidden");
  assist.value = "";
  assist.focus();
  overlay?.addEventListener("touchstart", () => {
    if (document.activeElement === assist) {
      assist.blur();
      assist.setAttribute("aria-hidden", "true");
    }
  }, { once: true, passive: true });
}

/**
 * Switches touch input between trackpad and direct-touch mode on the core.
 * @param enabled Trackpad mode on.
 */
export function setTrackpadMode(enabled: boolean): void {
  window.postMessage({ type: enabled ? "touchinput:trackpad" : "touchinput:touch" }, window.location.origin);
}

type Modifier = "Control" | "Alt" | "Meta";

/** Dispatches a synthetic key event on `window` for the core's input handler. */
function sendKey(type: "keydown" | "keyup", key: string, code: string, held: Record<Modifier, boolean>): void {
  window.dispatchEvent(new KeyboardEvent(type, {
    key,
    code,
    ctrlKey: held.Control,
    altKey: held.Alt,
    metaKey: held.Meta,
    bubbles: true,
    cancelable: true,
  }));
}

interface SoftKeysProps {
  /** Show the CTRL/ALT/WIN/TAB/ESC keys and the keyboard button. */
  showKeys: boolean;
  /** Show the trackpad-mode toggle. */
  showTrackpad: boolean;
  /** Trackpad mode is on. */
  trackpadActive: boolean;
  /** Flips trackpad mode. */
  onToggleTrackpad: () => void;
}

/** The soft-key bar in the bottom-left corner of a touch screen. */
export function SoftKeys({ showKeys, showTrackpad, trackpadActive, onToggleTrackpad }: SoftKeysProps): React.ReactElement {
  const [held, setHeld] = useState<Record<Modifier, boolean>>({ Control: false, Alt: false, Meta: false });

  const toggleHeld = (key: Modifier, code: string) => {
    const wasHeld = held[key];
    const heldCount = Object.values(held).filter(Boolean).length;
    if (!wasHeld && heldCount === 0) {
      window.postMessage({ type: "setSynth", value: true }, window.location.origin);
    } else if (wasHeld && heldCount === 1) {
      window.postMessage({ type: "setSynth", value: false }, window.location.origin);
    }
    const next = { ...held, [key]: !wasHeld };
    setHeld(next);
    sendKey(wasHeld ? "keyup" : "keydown", key, code, next);
  };

  const pressOnce = (key: string, code: string) => {
    sendKey("keydown", key, code, held);
    window.setTimeout(() => sendKey("keyup", key, code, held), 50);
  };

  const keep = (event: React.MouseEvent) => event.preventDefault();

  return (
    <motion.div
      className="fixed bottom-4 left-4 z-40 flex flex-wrap gap-2 rounded-xl border bg-background/70 p-2 shadow-lg backdrop-blur-xl"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {showKeys && (
        <>
          <Button variant={held.Control ? "default" : "secondary"} size="sm" onMouseDown={keep}
            onClick={() => toggleHeld("Control", "ControlLeft")}>CTRL</Button>
          <Button variant={held.Alt ? "default" : "secondary"} size="sm" onMouseDown={keep}
            onClick={() => toggleHeld("Alt", "AltLeft")}>ALT</Button>
          <Button variant={held.Meta ? "default" : "secondary"} size="sm" onMouseDown={keep}
            onClick={() => toggleHeld("Meta", "MetaLeft")}>WIN</Button>
          <Button variant="secondary" size="sm" onMouseDown={keep} onClick={() => pressOnce("Tab", "Tab")}>TAB</Button>
          <Button variant="secondary" size="sm" onMouseDown={keep} onClick={() => pressOnce("Escape", "Escape")}>ESC</Button>
          <Button variant="secondary" size="sm" onClick={showVirtualKeyboard} aria-label={t("topMenu.virtualKeyboard")}>
            <Keyboard className="h-4 w-4" />
          </Button>
        </>
      )}
      {showTrackpad && (
        <Button variant={trackpadActive ? "default" : "secondary"} size="sm" onClick={onToggleTrackpad}
          title={t("trackpadModeTitle")}>
          <Touchpad className="h-4 w-4" />
        </Button>
      )}
    </motion.div>
  );
}
