/**
 * The Settings pages that are new rather than an existing panel restyled:
 * General (stream toggles, appearance, touch), the Screen group heading the
 * Display page, and the pages around the stats and gamepad panels.
 *
 * Each control posts the same message the old top menu did, through the
 * handlers `DashboardOverlay` owns, so the core's echoes keep every switch
 * honest. Rows come from `form.tsx`.
 * @module
 */
import React from "react";
import { useTheme } from "@/components/ui/theme-provider";
import { SystemMonitoring } from "@/components/dashboard/system-monitoring";
import { Gamepad } from "@/components/dashboard/gamepad";
import { t } from "@/i18n";
import { Group, Row, RowButton, Segmented, SwitchRow } from "./form";
import { showVirtualKeyboard } from "./touch";

/** Stream state and the handlers that flip it, owned by `DashboardOverlay`. */
export interface StreamControls {
  isVideoActive: boolean;
  isAudioActive: boolean;
  isMicrophoneActive: boolean;
  isWebcamActive: boolean;
  isGamepadEnabled: boolean;
  isTouchGamepadActive: boolean;
  onVideoToggle: () => void;
  onAudioToggle: () => void;
  onMicrophoneToggle: () => void;
  onWebcamToggle: () => void;
  onGamepadToggle: () => void;
  onToggleTouchGamepad: () => void;
}

interface GeneralSectionProps {
  /** Stream state and handlers. */
  stream: StreamControls;
  /** `computeRenderableSettings` output: what the server lets the UI show. */
  renderable: Record<string, boolean | undefined>;
  /** This page is a secondary display, which owns no stream controls. */
  secondary: boolean;
  /** The device has a touch screen. */
  touch: boolean;
  /** Trackpad mode is on. */
  trackpadActive: boolean;
  /** Flips trackpad mode. */
  onToggleTrackpad: () => void;
}

type Appearance = "light" | "dark" | "system";

/** Light, Dark, or Auto, which follows the device. */
function AppearanceRow(): React.ReactElement {
  const { theme, setTheme } = useTheme();
  return (
    <Row label={t("shell.appearance")}>
      <Segmented<Appearance>
        label={t("shell.appearance")}
        value={theme}
        onChange={setTheme}
        options={[
          { value: "light", label: t("shell.light") },
          { value: "dark", label: t("shell.dark") },
          { value: "system", label: t("shell.auto") },
        ]}
      />
    </Row>
  );
}

/** General: what streams, how the shell looks, and the touch aids. */
export function GeneralSection({
  stream, renderable, secondary, touch, trackpadActive, onToggleTrackpad,
}: GeneralSectionProps): React.ReactElement {
  const shows = (key: string) => renderable[key] ?? true;
  return (
    <>
      {!secondary && shows("coreButtons") && (
        <Group title={t("shell.stream")}>
          {shows("videoToggle") && (
            <SwitchRow label={t("shell.video")} description={t("shell.videoHint")}
              checked={stream.isVideoActive} onChange={stream.onVideoToggle} />
          )}
          {shows("audioToggle") && (
            <SwitchRow label={t("shell.audio")} description={t("shell.audioHint")}
              checked={stream.isAudioActive} onChange={stream.onAudioToggle} />
          )}
          {shows("microphoneToggle") && (
            <SwitchRow label={t("topMenu.microphone")} description={t("shell.microphoneHint")}
              checked={stream.isMicrophoneActive} onChange={stream.onMicrophoneToggle} />
          )}
          {shows("webcamToggle") && (
            <SwitchRow label={t("topMenu.webcam")} description={t("shell.webcamHint")}
              checked={stream.isWebcamActive} onChange={stream.onWebcamToggle} />
          )}
        </Group>
      )}

      <Group title={t("shell.look")}>
        <AppearanceRow />
      </Group>

      {touch && (
        <Group title={t("shell.touch")}>
          {!secondary && (
            <SwitchRow label={t("shell.touchGamepad")} checked={stream.isTouchGamepadActive}
              onChange={stream.onToggleTouchGamepad} />
          )}
          {shows("trackpad") && (
            <SwitchRow label={t("shell.trackpadMode")} checked={trackpadActive} onChange={onToggleTrackpad} />
          )}
          {shows("keyboardButton") && (
            <Row label={t("shell.virtualKeyboard")}>
              <RowButton onClick={showVirtualKeyboard}>{t("shell.show")}</RowButton>
            </Row>
          )}
        </Group>
      )}
    </>
  );
}

/** Leaves fullscreen, or asks the core for it, plain or with input locked for games. */
function toggleFullscreen(gaming: boolean): void {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => undefined);
  } else {
    window.postMessage({ type: gaming ? "requestGamingMode" : "requestFullscreen" }, window.location.origin);
  }
}

interface ScreenGroupProps {
  /** `computeRenderableSettings` output. */
  renderable: Record<string, boolean | undefined>;
  /** Offer a second display: the server backs one and this page is the primary. */
  canAddScreen: boolean;
  /** Opens a second display. */
  onAddScreen: () => void;
}

/** The Display page's first group: full screen, gaming mode, a second display. */
export function ScreenGroup({ renderable, canAddScreen, onAddScreen }: ScreenGroupProps): React.ReactElement | null {
  const shows = (key: string) => renderable[key] ?? true;
  if (!shows("fullscreen") && !shows("gamingMode") && !canAddScreen) return null;
  return (
    <Group title={t("shell.screen")}>
      {shows("fullscreen") && (
        <Row label={t("shell.fullScreen")} description={t("shell.fullScreenHint")}>
          <RowButton onClick={() => toggleFullscreen(false)}>
            {document.fullscreenElement ? t("shell.exit") : t("shell.enter")}
          </RowButton>
        </Row>
      )}
      {shows("gamingMode") && (
        <Row label={t("shell.gamingMode")} description={t("shell.gamingModeHint")}>
          <RowButton onClick={() => toggleFullscreen(true)}>{t("shell.enter")}</RowButton>
        </Row>
      )}
      {canAddScreen && (
        <Row label={t("shell.addScreen")} description={t("shell.addScreenHint")}>
          <RowButton onClick={onAddScreen}>{t("shell.add")}</RowButton>
        </Row>
      )}
    </Group>
  );
}

/** Performance: the live stats, and whether they stay over the desktop. */
export function PerformanceSection({ pinned, onTogglePinned }: {
  pinned: boolean; onTogglePinned: () => void;
}): React.ReactElement {
  return (
    <>
      <Group>
        <SwitchRow label={t("shell.keepOnScreen")} description={t("shell.keepOnScreenHint")} checked={pinned}
          onChange={onTogglePinned} />
      </Group>
      <Group title={t("shell.liveStats")} plain>
        <div className="p-3 [&>*]:w-full! [&>*]:cursor-auto! [&>*]:border-0! [&>*]:bg-transparent! [&>*]:p-0! [&>*]:shadow-none! [&>*]:backdrop-blur-none!">
          <SystemMonitoring detailed />
        </div>
      </Group>
    </>
  );
}

/** Gamepads: forwarding on or off, and the connected pads when on. */
export function GamepadsSection({ stream, showPads }: {
  stream: StreamControls; showPads: boolean;
}): React.ReactElement {
  return (
    <>
      <Group>
        <SwitchRow label={t("shell.gamepadInput")} description={t("shell.gamepadHint")}
          checked={stream.isGamepadEnabled} onChange={stream.onGamepadToggle} />
      </Group>
      {stream.isGamepadEnabled && showPads && (
        <Group title={t("shell.controllers")} plain>
          <div className="p-2">
            <Gamepad isTouchGamepadActive={stream.isTouchGamepadActive} />
          </div>
        </Group>
      )}
    </>
  );
}
