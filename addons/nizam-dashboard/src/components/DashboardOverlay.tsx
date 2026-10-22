/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Shell } from '../shell/Shell';
import { VirtualKeyboardButton } from './dashboard/gamepad';
import PlayerGamepadButton from './dashboard/PlayerGamepadButton';
import { TooltipProvider } from './ui/tooltip';
import { isSecondaryDisplay, isViewerUrlMode, getLastServerSettings } from '../utils';
import '../styles/Overlay.css';

/**
 * The dashboard chrome portaled over the stream: the shell (dock and Settings
 * app), and the mobile virtual-keyboard button.
 *
 * Owns the pipeline, gamepad and touch-gamepad state the Settings controls and
 * the gamepad page share. State follows the core's echoes rather than local toggles: a
 * `pipelineControl` or `gamepadControl` request is posted to `window`, and
 * `pipelineStatusUpdate` / `sidebarButtonStatusUpdate` flip the state once
 * whichever core is active has applied the change. Also listens for
 * `clientRoleUpdate` (viewers get no control UI, only the floating
 * touch-gamepad toggle on a touch client), `serverSettings`
 * (`ui_show_sidebar` hides the whole chrome, `ui_sidebar_show_gamepads` the
 * gamepad page and that button alone), and the core-owned hotkey message
 * `toggleTouchGamepad`; the shell takes `toggleDashboard` itself. The touch overlay is driven with
 * `TOUCH_GAMEPAD_SETUP` and `TOUCH_GAMEPAD_VISIBILITY`.
 * @module
 */

interface DashboardOverlayProps {
  /** Element the chrome is portaled into; nothing renders while null. */
  container: Element | null;
}

const TOUCH_GAMEPAD_HOST_DIV_ID = 'touch-gamepad-host';

/**
 * Renders the shell and the virtual-keyboard button into `container`.
 *
 * Touch-gamepad state lives here alone, not in the shell, so the Settings
 * switch, the Ctrl+Shift+G hotkey and the gamepad page read one value and the
 * hotkey works even while the shell is unmounted (hidden UI, viewers). The
 * viewer flag is seeded from the URL so a shared or player viewer never sees
 * control UI in the gap before the server's `clientRoleUpdate` lands.
 */
function DashboardOverlay({ container }: DashboardOverlayProps): React.ReactElement | null {
  const [isGamepadEnabled, setIsGamepadEnabled] = useState<boolean>(true);
  const [isTouchGamepadActive, setIsTouchGamepadActive] = useState<boolean>(false);
  const [isTouchGamepadSetup, setIsTouchGamepadSetup] = useState<boolean>(false);
  const [isVideoActive, setIsVideoActive] = useState<boolean>(true);
  const [isAudioActive, setIsAudioActive] = useState<boolean>(true);
  const [isMicrophoneActive, setIsMicrophoneActive] = useState<boolean>(false);
  const [isWebcamActive, setIsWebcamActive] = useState<boolean>(false);
  const [isViewer, setIsViewer] = useState<boolean>(isViewerUrlMode);
  const [showSidebar, setShowSidebar] = useState<boolean>(
    () => (getLastServerSettings() as any)?.ui_show_sidebar?.value !== false
  );
  const [showGamepadCard, setShowGamepadCard] = useState<boolean>(
    () => (getLastServerSettings() as any)?.ui_sidebar_show_gamepads?.value !== false
  );

  /**
   * Hides the touch overlay (once set up) and clears the menu and card state
   * with it; a no-op while it is not showing.
   */
  const hideTouchGamepad = React.useCallback(() => {
    if (!isTouchGamepadActive) return;
    setIsTouchGamepadActive(false);
    if (isTouchGamepadSetup) {
      window.postMessage(
        {
          type: 'TOUCH_GAMEPAD_VISIBILITY',
          payload: { visible: false, targetDivId: TOUCH_GAMEPAD_HOST_DIV_ID },
        },
        window.location.origin
      );
    }
  }, [isTouchGamepadActive, isTouchGamepadSetup]);

  React.useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const message = event.data;
      if (typeof message === 'object' && message !== null) {
        if (message.type === 'pipelineStatusUpdate') {
          if (message.video !== undefined) setIsVideoActive(message.video);
          if (message.audio !== undefined) setIsAudioActive(message.audio);
          if (message.microphone !== undefined) setIsMicrophoneActive(message.microphone);
          if (message.webcam !== undefined) setIsWebcamActive(message.webcam);
        } else if (message.type === 'clientRoleUpdate') {
          setIsViewer(message.role === 'viewer');
        } else if (message.type === 'sidebarButtonStatusUpdate') {
          if (message.video !== undefined) setIsVideoActive(message.video);
          if (message.audio !== undefined) setIsAudioActive(message.audio);
          if (message.microphone !== undefined) setIsMicrophoneActive(message.microphone);
          if (message.webcam !== undefined) setIsWebcamActive(message.webcam);
          if (message.gamepad !== undefined) {
            setIsGamepadEnabled(message.gamepad);
            // Gamepad input off takes the touch overlay down with it: its
            // presses would go nowhere.
            if (message.gamepad === false) hideTouchGamepad();
          }
        } else if (message.type === 'serverSettings') {
          setShowSidebar(message.payload?.ui_show_sidebar?.value !== false);
          setShowGamepadCard(message.payload?.ui_sidebar_show_gamepads?.value !== false);
        }
      }
    };

    window.addEventListener('message', handleWindowMessage);
    return () => window.removeEventListener('message', handleWindowMessage);
  }, [hideTouchGamepad]);

  const handleVideoToggle = () => {
    window.postMessage({ type: 'pipelineControl', pipeline: 'video', enabled: !isVideoActive }, window.location.origin);
  };

  const handleAudioToggle = () => {
    window.postMessage({ type: 'pipelineControl', pipeline: 'audio', enabled: !isAudioActive }, window.location.origin);
  };

  const handleMicrophoneToggle = () => {
    window.postMessage({ type: 'pipelineControl', pipeline: 'microphone', enabled: !isMicrophoneActive }, window.location.origin);
  };

  const handleWebcamToggle = () => {
    window.postMessage({ type: 'pipelineControl', pipeline: 'webcam', enabled: !isWebcamActive }, window.location.origin);
  };

  const handleGamepadToggle = () => {
    const enabled = !isGamepadEnabled;
    window.postMessage({ type: 'gamepadControl', enabled }, window.location.origin);
    setIsGamepadEnabled(enabled);
    if (!enabled) hideTouchGamepad();
  };

  const handleToggleTouchGamepad = React.useCallback(() => {
    const newActiveState = !isTouchGamepadActive;
    setIsTouchGamepadActive(newActiveState);
    if (newActiveState && !isTouchGamepadSetup) {
      window.postMessage(
        {
          type: 'TOUCH_GAMEPAD_SETUP',
          payload: { targetDivId: TOUCH_GAMEPAD_HOST_DIV_ID, visible: true },
        },
        window.location.origin
      );
      setIsTouchGamepadSetup(true);
    } else if (isTouchGamepadSetup) {
      window.postMessage(
        {
          type: 'TOUCH_GAMEPAD_VISIBILITY',
          payload: { visible: newActiveState, targetDivId: TOUCH_GAMEPAD_HOST_DIV_ID },
        },
        window.location.origin
      );
    }
  }, [isTouchGamepadActive, isTouchGamepadSetup]);

  React.useEffect(() => {
    const handleHotkeyMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const message = event.data;
      if (!message || typeof message !== "object") return;
      if (message.type === "toggleTouchGamepad") {
        handleToggleTouchGamepad();
      }
    };

    window.addEventListener("message", handleHotkeyMessage);
    return () => window.removeEventListener("message", handleHotkeyMessage);
  }, [handleToggleTouchGamepad]);

  if (!container) {
    return null;
  }

  return ReactDOM.createPortal(
    <TooltipProvider>
      <div className="h-screen w-screen">
        {!isViewer && showSidebar && (
          <Shell
            stream={{
              isVideoActive,
              isAudioActive,
              isMicrophoneActive,
              isWebcamActive,
              isGamepadEnabled,
              isTouchGamepadActive,
              onVideoToggle: handleVideoToggle,
              onAudioToggle: handleAudioToggle,
              onMicrophoneToggle: handleMicrophoneToggle,
              onWebcamToggle: handleWebcamToggle,
              onGamepadToggle: handleGamepadToggle,
              onToggleTouchGamepad: handleToggleTouchGamepad,
            }}
          />
        )}

        {isViewer && (
          <PlayerGamepadButton touchOnly isActive={isTouchGamepadActive} onToggle={handleToggleTouchGamepad} />
        )}

        {/* Input is owned by the primary display, so the button follows the
            shell's chrome gates plus its own ui_sidebar_show_gamepads. */}
        {isGamepadEnabled && !isSecondaryDisplay && !isViewer && showSidebar && showGamepadCard && (
          <VirtualKeyboardButton />
        )}
      </div>
    </TooltipProvider>,
    container
  );
}

export default DashboardOverlay;

