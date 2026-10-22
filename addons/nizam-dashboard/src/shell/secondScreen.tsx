/**
 * Adding a second display: a new window on `#display2-<side>`, which the
 * server streams as a monitor attached to that side of this one.
 *
 * With the Window Management API and a single screen beside this one, the
 * window opens there directly; otherwise placement arrows ask which side.
 * Asking beats guessing: the API answers nothing without its permission, and a
 * display silently opened to the right of a monitor that sits above this one
 * is what the arrows exist to avoid. A refused popup falls back to the arrows
 * too, so the action is never seen to do nothing.
 * @module
 */
import React, { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

type Side = "up" | "down" | "left" | "right";
/** Sides on offer, each with the screen to fill there, or null to let the browser place it. */
export type Placements = Partial<Record<Side, any>>;

const ANY_SIDE: Placements = { up: null, down: null, left: null, right: null };

/**
 * Opens the secondary display window, sized to `screen` when there is one.
 * @returns Whether the window opened.
 */
function openDisplay(side: Side, screen: any): boolean {
  const url = `${window.location.href.split("#")[0]}#display2-${side}`;
  // Not `noopener` in the features: that makes window.open return null even
  // when it opened, leaving a refusal indistinguishable from success.
  let features = "resizable=yes,scrollbars=yes";
  if (screen) {
    features += `,left=${screen.availLeft},top=${screen.availTop},width=${screen.availWidth},height=${screen.availHeight}`;
  }
  const opened = window.open(url, "_blank", features);
  if (!opened) return false;
  try { opened.opener = null; } catch { /* already navigated away */ }
  return true;
}

/** State and actions for adding a second display. */
export function useSecondScreen() {
  const [placements, setPlacements] = useState<Placements | null>(null);

  const launch = useCallback((side: Side, screen: any) => {
    if (openDisplay(side, screen)) setPlacements(null);
  }, []);

  const addScreen = useCallback(async () => {
    if (!("getScreenDetails" in window)) {
      setPlacements(ANY_SIDE);
      return;
    }
    try {
      const details = await (window as any).getScreenDetails();
      const current = details.currentScreen;
      const found: Placements = {};
      for (const s of details.screens.filter((s: any) => s !== current)) {
        if (!found.right && s.left >= current.left + current.width) found.right = s;
        if (!found.left && s.left + s.width <= current.left) found.left = s;
        if (!found.down && s.top >= current.top + current.height) found.down = s;
        if (!found.up && s.top + s.height <= current.top) found.up = s;
      }
      const sides = Object.keys(found) as Side[];
      if (sides.length === 1) {
        if (!openDisplay(sides[0], found[sides[0]])) setPlacements(found);
      } else {
        setPlacements(sides.length ? found : ANY_SIDE);
      }
    } catch {
      // A refused permission is ordinary: the arrows still ask.
      setPlacements(ANY_SIDE);
    }
  }, []);

  return { placements, addScreen, launch, dismiss: () => setPlacements(null) };
}

const ARROWS: Record<Side, { glyph: string; className: string }> = {
  up: { glyph: "▲", className: "top-10 left-1/2 -translate-x-1/2" },
  down: { glyph: "▼", className: "bottom-10 left-1/2 -translate-x-1/2" },
  left: { glyph: "◄", className: "left-10 top-1/2 -translate-y-1/2" },
  right: { glyph: "►", className: "right-10 top-1/2 -translate-y-1/2" },
};

interface PlacementOverlayProps {
  /** Sides on offer. */
  placements: Placements;
  /** Opens the display on a side. */
  onPick: (side: Side, screen: any) => void;
  /** Closes the overlay. */
  onDismiss: () => void;
}

/** Full-screen arrows asking which side the new display attaches to. */
export function PlacementOverlay({ placements, onPick, onDismiss }: PlacementOverlayProps): React.ReactElement {
  return (
    <div className="fixed inset-0 z-[70] bg-background/40 backdrop-blur-sm" onClick={onDismiss}>
      {(Object.keys(ARROWS) as Side[]).filter((side) => side in placements).map((side) => (
        <Button
          key={side}
          className={`absolute h-24 w-24 text-4xl ${ARROWS[side].className}`}
          onClick={(event) => {
            event.stopPropagation();
            onPick(side, placements[side]);
          }}
        >
          {ARROWS[side].glyph}
        </Button>
      ))}
    </div>
  );
}
