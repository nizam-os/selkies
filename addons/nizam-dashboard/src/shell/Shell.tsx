/**
 * The desktop shell over the stream: the dock on the right edge, the Settings
 * app it opens, and what the old top menu kept on screen beside its panels
 * (the pinned performance HUD, the download dialog, the second-display arrows,
 * and the touch soft keys).
 *
 * Reads the `serverSettings` and `trackpadModeUpdate` messages the core posts
 * on `window`, seeding the first from the cached broadcast because the shell
 * mounts after the core connects; the server's UI customization decides which
 * sections and controls exist. Posts `sidebarVisibilityChanged` while Settings
 * or the HUD is up, so the core mirrors gamepad state for the gamepad page,
 * and takes the core's `toggleDashboard` hotkey (Ctrl+Shift+M) as open or
 * close Settings. Entering fullscreen closes Settings so the user lands in the
 * session.
 * @module
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Clipboard as ClipboardIcon,
  Film,
  Folder,
  Gamepad2,
  Gauge,
  Keyboard,
  LayoutGrid,
  Monitor,
  Printer,
  Share2,
  SlidersHorizontal,
  Volume2,
} from "lucide-react";
import { Clipboard } from "@/components/dashboard/clipboard";
import { Files, FilesDialog } from "@/components/dashboard/files";
import { Printing } from "@/components/dashboard/printing";
import { Apps } from "@/components/dashboard/apps";
import { Settings } from "@/components/dashboard/settings";
import { SystemMonitoring } from "@/components/dashboard/system-monitoring";
import { Sharing } from "@/components/dashboard/sharing";
import { ShortcutsMenu } from "@/components/dashboard/shortcuts-menu";
import {
  computeRenderableSettings,
  getLastServerSettings,
  getPrintJobs,
  isMobileClient,
  isSecondaryDisplay,
} from "@/utils";
import { t } from "@/i18n";
import { Dock } from "./Dock";
import { SettingsWindow, type SettingsSection } from "./SettingsWindow";
import {
  GamepadsSection,
  GeneralSection,
  PerformanceSection,
  ScreenGroup,
  type StreamControls,
} from "./sections";
import { PlacementOverlay, useSecondScreen } from "./secondScreen";
import { SoftKeys, setTrackpadMode } from "./touch";

const HUD_PINNED_KEY = "nizam-hud-pinned";

/** Reads a per-browser flag, false where storage is unavailable. */
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/** Stores a per-browser flag, silently where storage is unavailable. */
function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Private windows and blocked storage just forget it.
  }
}

/** The performance HUD, draggable anywhere on screen. */
function PinnedHud(): React.ReactElement {
  const bounds = useRef<HTMLDivElement>(null);
  return (
    <div ref={bounds} className="pointer-events-none fixed inset-0 z-30">
      <motion.div
        drag
        dragMomentum={false}
        dragConstraints={bounds}
        dragElastic={0}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="pointer-events-auto absolute top-4 left-4 cursor-grab active:cursor-grabbing"
      >
        <SystemMonitoring />
      </motion.div>
    </div>
  );
}

interface ShellProps {
  /** Stream state and the handlers that flip it, owned by `DashboardOverlay`. */
  stream: StreamControls;
}

/** The dock, the Settings app, and the overlays they open. */
export function Shell({ stream }: ShellProps): React.ReactElement {
  const [serverSettings, setServerSettings] = useState<any>(() => getLastServerSettings());
  const renderable = useMemo(() => computeRenderableSettings(serverSettings), [serverSettings]);
  const [touch, setTouch] = useState<boolean>(isMobileClient);
  const [trackpadActive, setTrackpadActive] = useState(false);
  const [printJobCount, setPrintJobCount] = useState(() => getPrintJobs().length);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("general");
  const [hudPinned, setHudPinned] = useState(() => readFlag(HUD_PINNED_KEY));
  const [showFilesModal, setShowFilesModal] = useState(false);
  const secondScreen = useSecondScreen();

  const shows = (key: string): boolean => renderable[key] ?? true;
  const primary = !isSecondaryDisplay;

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const message = event.data;
      if (message?.type === "serverSettings") {
        setServerSettings(message.payload);
      } else if (message?.type === "trackpadModeUpdate" && typeof message.enabled === "boolean") {
        setTrackpadActive(message.enabled);
      } else if (message?.type === "toggleDashboard") {
        setSettingsOpen((open) => !open);
      }
    };
    const countPrintJobs = () => setPrintJobCount(getPrintJobs().length);
    window.addEventListener("message", onMessage);
    window.addEventListener("printJobsChanged", countPrintJobs);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("printJobsChanged", countPrintJobs);
    };
  }, []);

  useEffect(() => {
    if (touch) return;
    const detect = () => setTouch(true);
    window.addEventListener("touchstart", detect, { passive: true, once: true });
    return () => window.removeEventListener("touchstart", detect);
  }, [touch]);

  useEffect(() => {
    const closeOnFullscreen = () => {
      if (document.fullscreenElement) setSettingsOpen(false);
    };
    document.addEventListener("fullscreenchange", closeOnFullscreen);
    return () => document.removeEventListener("fullscreenchange", closeOnFullscreen);
  }, []);

  const hudShown = hudPinned && primary && shows("stats");

  useEffect(() => {
    window.postMessage(
      { type: "sidebarVisibilityChanged", isOpen: settingsOpen || hudShown },
      window.location.origin,
    );
  }, [settingsOpen, hudShown]);

  const toggleTrackpad = () => {
    setTrackpadActive(!trackpadActive);
    setTrackpadMode(!trackpadActive);
  };

  const toggleHud = () => {
    writeFlag(HUD_PINNED_KEY, !hudPinned);
    setHudPinned(!hudPinned);
  };

  const canAddScreen = primary && !!serverSettings?.second_screen?.value;
  const showsScreenGroup = shows("fullscreen") || shows("gamingMode") || canAddScreen;
  const sections: SettingsSection[] = [
    {
      id: "general",
      label: t("shell.general"),
      icon: SlidersHorizontal,
      cluster: 0,
      render: () => (
        <GeneralSection
          stream={stream}
          renderable={renderable}
          secondary={!primary}
          touch={touch}
          trackpadActive={trackpadActive}
          onToggleTrackpad={toggleTrackpad}
        />
      ),
    },
  ];
  if (shows("screenSettings") || showsScreenGroup) {
    sections.push({
      id: "display",
      label: t("shell.display"),
      icon: Monitor,
      cluster: 0,
      render: () => (
        <>
          <ScreenGroup
            renderable={renderable}
            canAddScreen={canAddScreen}
            onAddScreen={() => {
              setSettingsOpen(false);
              secondScreen.addScreen();
            }}
          />
          <Settings page="display" />
        </>
      ),
    });
  }
  if (shows("videoSettings")) {
    sections.push({ id: "video", label: t("settingsTabs.video"), icon: Film, cluster: 0, render: () => <Settings page="video" /> });
  }
  if (shows("audioSettings")) {
    sections.push({ id: "audio", label: t("settingsTabs.audio"), icon: Volume2, cluster: 0, render: () => <Settings page="audio" /> });
  }
  if (primary && shows("clipboard")) {
    sections.push({ id: "clipboard", label: t("sections.clipboard.title"), icon: ClipboardIcon, cluster: 1, render: () => <Clipboard /> });
  }
  if (primary && shows("files")) {
    sections.push({
      id: "files",
      label: t("sections.files.title"),
      icon: Folder,
      cluster: 1,
      render: () => <Files onOpenDownloads={() => setShowFilesModal(true)} />,
    });
  }
  if (primary && printJobCount > 0) {
    sections.push({ id: "printing", label: t("sections.printing.title"), icon: Printer, cluster: 1, render: () => <Printing /> });
  }
  if (primary && shows("sharing")) {
    sections.push({ id: "sharing", label: t("sections.sharing.title"), icon: Share2, cluster: 1, render: () => <Sharing show /> });
  }
  if (primary && shows("gamepadToggle")) {
    sections.push({
      id: "gamepads",
      label: t("shell.gamepads"),
      icon: Gamepad2,
      cluster: 2,
      render: () => <GamepadsSection stream={stream} showPads={shows("gamepads")} />,
    });
  }
  if (shows("shortcuts")) {
    sections.push({ id: "shortcuts", label: t("sections.shortcuts.title"), icon: Keyboard, cluster: 2, render: () => <ShortcutsMenu /> });
  }
  if (primary && shows("stats")) {
    sections.push({
      id: "performance",
      label: t("shell.performance"),
      icon: Gauge,
      cluster: 2,
      render: () => <PerformanceSection pinned={hudPinned} onTogglePinned={toggleHud} />,
    });
  }
  if (primary && shows("apps")) {
    sections.push({ id: "apps", label: t("sections.apps.title"), icon: LayoutGrid, cluster: 3, render: () => <Apps /> });
  }

  return (
    <>
      <Dock
        canLaunch={primary && serverSettings?.command_enabled?.value !== false}
        onOpenSettings={() => setSettingsOpen(true)}
        settingsOpen={settingsOpen}
        touch={touch}
      />

      <SettingsWindow
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        sections={sections}
        active={activeSection}
        onSelect={setActiveSection}
      />

      <AnimatePresence>{hudShown && <PinnedHud />}</AnimatePresence>

      {touch && (shows("softButtons") || shows("trackpad")) && (
        <SoftKeys
          showKeys={shows("softButtons")}
          showTrackpad={shows("trackpad")}
          trackpadActive={trackpadActive}
          onToggleTrackpad={toggleTrackpad}
        />
      )}

      {secondScreen.placements && (
        <PlacementOverlay
          placements={secondScreen.placements}
          onPick={secondScreen.launch}
          onDismiss={secondScreen.dismiss}
        />
      )}

      {showFilesModal && <FilesDialog open onOpenChange={setShowFilesModal} />}
    </>
  );
}
