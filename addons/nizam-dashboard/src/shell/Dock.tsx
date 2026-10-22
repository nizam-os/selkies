/**
 * The dock: the desktop's applications and the Settings app in a vertical
 * strip on the right edge of the screen, macOS-style.
 *
 * It slides in once the pointer has rested within `EDGE_PX` of the right edge
 * for `DWELL_MS` with no button held, so dragging Chromium's scrollbar or
 * passing the edge on the way elsewhere does not summon it, and slides out
 * once the pointer has been away from it for `HIDE_MS`. Pointer positions are
 * read in the capture phase on `window`, ahead of the core. Touch screens,
 * which have no hover, get a small grabber on the edge instead.
 *
 * Icons magnify with the pointer's distance, as the macOS dock's do, but by
 * transform alone: every icon keeps its slot, so the panel never changes
 * size, and its gaps and padding leave room for the largest icon beside its
 * magnified neighbors, launch bounce included, inside the panel's scroll
 * clip. Apps come from the gate (`fetchApps`), refreshed when the dock shows
 * and every few seconds while it is out, and launch through the core's
 * `command` message, which the server runs in the desktop session; a launch
 * bounces its icon. Without command support on the server only Settings is
 * offered.
 * @module
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  motion,
  useAnimate,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { Settings as SettingsIcon } from "lucide-react";
import { t } from "@/i18n";
import { fetchApps, type DesktopApp } from "@/gate/gate";

const EDGE_PX = 2;
const DWELL_MS = 150;
const HIDE_MS = 450;
const LEAVE_MARGIN = 24;
const REFRESH_MS = 4000;
const ICON = 48;
const ICON_MAX = 64;
const MAGNIFY_RANGE = 110;

/** The hovered icon, which the name label is drawn beside. */
interface Hover {
  label: string;
  y: number;
  left: number;
}

interface DockIconProps {
  /** Pointer Y over the dock, or Infinity when it is elsewhere. */
  pointerY: MotionValue<number>;
  /** Name shown beside the icon on hover. */
  label: string;
  /** Draws the running dot. */
  running?: boolean;
  /** Increments to bounce the icon once. */
  bounce?: number;
  /** Reports the hovered icon's label, vertical center, and left edge, or null on leave. */
  onHover: (hover: Hover | null) => void;
  /** Activates the icon. */
  onClick: () => void;
  /** The artwork. */
  children: React.ReactNode;
}

/** One magnifying dock icon. */
function DockIcon({ pointerY, label, running, bounce = 0, onHover, onClick, children }: DockIconProps): React.ReactElement {
  const ref = useRef<HTMLButtonElement>(null);
  const [scope, animate] = useAnimate();
  const distance = useTransform(pointerY, (y) => {
    const rect = ref.current?.getBoundingClientRect();
    return rect && Number.isFinite(y) ? y - (rect.top + rect.height / 2) : MAGNIFY_RANGE;
  });
  const scale = useSpring(
    useTransform(distance, [-MAGNIFY_RANGE, 0, MAGNIFY_RANGE], [1, ICON_MAX / ICON, 1]),
    { mass: 0.1, stiffness: 170, damping: 14 },
  );

  useEffect(() => {
    if (bounce) animate(scope.current, { x: [0, -6, 0, -3, 0] }, { duration: 0.7, ease: "easeOut" });
  }, [bounce, animate, scope]);

  const report = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) onHover({ label, y: rect.top + rect.height / 2, left: rect.left });
  };

  return (
    <motion.button
      ref={ref}
      type="button"
      aria-label={label}
      style={{ width: ICON, height: ICON }}
      className="relative shrink-0 rounded-[22%] outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onPointerEnter={report}
      onPointerMove={report}
      onPointerLeave={() => onHover(null)}
      onFocus={report}
      onBlur={() => onHover(null)}
      onClick={onClick}
    >
      <motion.span style={{ scale }} className="block size-full">
        <span ref={scope} className="block size-full drop-shadow-md">{children}</span>
      </motion.span>
      {running && (
        <span className="absolute top-1/2 -right-[7px] size-1 -translate-y-1/2 rounded-full bg-foreground/80" />
      )}
    </motion.button>
  );
}

/** A letter tile for an app without a drawable icon. */
function LetterTile({ name }: { name: string }): React.ReactElement {
  return (
    <svg viewBox="0 0 100 100" className="size-full" aria-hidden>
      <defs>
        <linearGradient id="dock-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#737373" />
          <stop offset="1" stopColor="#404040" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill="url(#dock-tile)" />
      <text x="50" y="52" textAnchor="middle" dominantBaseline="central" fontSize="46"
        fontWeight="600" fill="#f5f5f5" fontFamily="inherit">
        {name.trim().charAt(0).toUpperCase() || "?"}
      </text>
    </svg>
  );
}

/** The Settings app's gear tile. */
function SettingsTile(): React.ReactElement {
  return (
    <span className="flex size-full items-center justify-center rounded-[22%] bg-gradient-to-b from-neutral-300 to-neutral-500 text-neutral-800 dark:from-neutral-500 dark:to-neutral-700 dark:text-neutral-100">
      <SettingsIcon className="size-[62%]" strokeWidth={1.75} />
    </span>
  );
}

interface DockProps {
  /** The server runs launch commands (`command_enabled`). */
  canLaunch: boolean;
  /** Opens the Settings window. */
  onOpenSettings: () => void;
  /** The Settings window is open, which draws its running dot. */
  settingsOpen: boolean;
  /** The device has a touch screen, which gets the grabber. */
  touch: boolean;
}

/** The auto-hiding dock on the right edge. */
export function Dock({ canLaunch, onOpenSettings, settingsOpen, touch }: DockProps): React.ReactElement {
  const [shown, setShown] = useState(false);
  const shownRef = useRef(false);
  const [apps, setApps] = useState<DesktopApp[]>([]);
  const [bounces, setBounces] = useState<Record<string, number>>({});
  const [hover, setHover] = useState<Hover | null>(null);
  const [reload, setReload] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const pointerY = useMotionValue(Infinity);

  const show = useCallback((value: boolean) => {
    shownRef.current = value;
    setShown(value);
    if (!value) setHover(null);
  }, []);

  useEffect(() => {
    let dwell = 0;
    let hide = 0;
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      if (!shownRef.current) {
        const atEdge = event.clientX >= window.innerWidth - EDGE_PX && event.buttons === 0;
        if (atEdge && !dwell) {
          dwell = window.setTimeout(() => { dwell = 0; show(true); }, DWELL_MS);
        } else if (!atEdge && dwell) {
          window.clearTimeout(dwell);
          dwell = 0;
        }
        return;
      }
      const rect = panelRef.current?.getBoundingClientRect();
      const near = !!rect && event.clientX >= rect.left - LEAVE_MARGIN
        && event.clientY >= rect.top - LEAVE_MARGIN && event.clientY <= rect.bottom + LEAVE_MARGIN;
      if (near && hide) {
        window.clearTimeout(hide);
        hide = 0;
      } else if (!near && !hide) {
        hide = window.setTimeout(() => { hide = 0; show(false); }, HIDE_MS);
      }
    };
    const onTouchOutside = (event: PointerEvent) => {
      if (event.pointerType === "touch" && shownRef.current
          && !panelRef.current?.contains(event.target as Node)) show(false);
    };
    window.addEventListener("pointermove", onMove, { capture: true, passive: true });
    window.addEventListener("pointerdown", onTouchOutside, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerdown", onTouchOutside, { capture: true });
      window.clearTimeout(dwell);
      window.clearTimeout(hide);
    };
  }, [show]);

  // Loads on mount and on every show, then polls while the dock is out so the
  // running dots follow apps opened and closed elsewhere. A failed load keeps
  // the last list.
  useEffect(() => {
    if (!canLaunch) return;
    let live = true;
    const load = () => fetchApps().then((list) => { if (live) setApps(list); }, () => undefined);
    load();
    const id = shown ? window.setInterval(load, REFRESH_MS) : 0;
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [canLaunch, shown, reload]);

  const launch = (app: DesktopApp) => {
    window.postMessage({ type: "command", value: app.command }, window.location.origin);
    setBounces((prev) => ({ ...prev, [app.id]: (prev[app.id] ?? 0) + 1 }));
    window.setTimeout(() => setReload((n) => n + 1), 1500);
  };

  const openSettings = () => {
    onOpenSettings();
    if (touch) show(false);
  };

  return (
    <>
      {touch && !shown && (
        <button
          type="button"
          aria-label={t("shell.showDock")}
          className="fixed top-1/2 right-0 z-[60] flex h-20 w-5 -translate-y-1/2 items-center justify-end pr-1"
          onClick={() => show(true)}
        >
          <span className="h-12 w-1 rounded-full bg-foreground/35" />
        </button>
      )}

      <div className="pointer-events-none fixed inset-y-0 right-0 z-[60] flex items-center pr-1.5">
        <motion.div
          ref={panelRef}
          role="toolbar"
          aria-orientation="vertical"
          aria-label={t("shell.dock")}
          initial={false}
          animate={{ x: shown ? 0 : "140%", opacity: shown ? 1 : 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
          onPointerMove={(event) => pointerY.set(event.clientY)}
          onPointerLeave={() => pointerY.set(Infinity)}
          className={`flex max-h-[calc(100dvh-16px)] flex-col items-center gap-3 overflow-y-auto rounded-2xl border border-black/10 bg-white/55 p-3 shadow-2xl backdrop-blur-2xl [scrollbar-width:none] dark:border-white/10 dark:bg-background/60 ${shown ? "pointer-events-auto" : "pointer-events-none"}`}
        >
          {apps.map((app) => (
            <DockIcon
              key={app.id}
              pointerY={pointerY}
              label={app.name}
              running={app.running}
              bounce={bounces[app.id]}
              onHover={setHover}
              onClick={() => launch(app)}
            >
              {app.icon
                ? <img src={app.icon} alt="" draggable={false} className="size-full object-contain" />
                : <LetterTile name={app.name} />}
            </DockIcon>
          ))}
          {apps.length > 0 && <span className="h-px w-8 shrink-0 bg-foreground/15" aria-hidden />}
          <DockIcon
            pointerY={pointerY}
            label={t("topMenu.settings")}
            running={settingsOpen}
            onHover={setHover}
            onClick={openSettings}
          >
            <SettingsTile />
          </DockIcon>
        </motion.div>
      </div>

      {shown && hover && (
        <div
          className="pointer-events-none fixed z-[61] -translate-y-1/2 whitespace-nowrap rounded-md border border-black/10 bg-white/80 px-2.5 py-1 text-xs font-medium text-neutral-900 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-popover/90 dark:text-foreground"
          style={{ top: hover.y, right: window.innerWidth - hover.left + 18 }}
        >
          {hover.label}
        </div>
      )}
    </>
  );
}
