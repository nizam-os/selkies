/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useState } from "react";
import { computeRenderableSettings, getLastServerSettings, getPrefixedKey } from "@/utils";
import { t } from "@/i18n";
import { chord, Group, Keys, Row, SwitchRow } from "@/shell/form";

/**
 * The Shortcuts page of the Settings app: the switch that hands the core's
 * chords to the session instead, the chords themselves with the lock's
 * (`gate/shortcut.ts`), which stays on either way, and the citation notice.
 * @module
 */

const shortcuts = [
	{ label: t('sections.shortcuts.fullscreen'), keys: chord("Ctrl", "Shift", "F") },
	{ label: t('sections.shortcuts.gamingMode'), keys: chord("Ctrl", "Shift", "X") },
	{ label: t('prefs.openSettings'), keys: chord("Ctrl", "Shift", "M") },
	{ label: t('sections.shortcuts.toggleGamepad'), keys: chord("Ctrl", "Shift", "G") },
	{ label: t('sections.shortcuts.pointerLock'), keys: chord("Ctrl", "Shift", t('prefs.click')) },
	{ label: t('prefs.lockScreen'), keys: chord("Ctrl", "Shift", "L") },
];

/** Renders the switch and the shortcut list. */
export function ShortcutsMenu() {
	const renderableSettings: any = computeRenderableSettings(getLastServerSettings());
	const [enabled, setEnabled] = useState(() => {
		const server = getLastServerSettings()?.keyboard_shortcuts;
		if (server?.locked) return !!server.value;
		const saved = localStorage.getItem(getPrefixedKey("keyboard_shortcuts"));
		return saved !== null ? saved === 'true' : (server ? !!server.value : true);
	});
	const toggle = () => {
		const value = !enabled;
		setEnabled(value);
		localStorage.setItem(getPrefixedKey("keyboard_shortcuts"), String(value));
		window.postMessage({ type: 'settings', settings: { keyboard_shortcuts: value } },
			window.location.origin);
	};
	return (
		<>
			{(renderableSettings.keyboardShortcuts ?? true) && (
				<Group>
					<SwitchRow
						label={t('prefs.shortcutsActive')}
						description={t('prefs.shortcutsHint')}
						checked={enabled}
						onChange={toggle}
					/>
				</Group>
			)}
			<Group
				title={t('sections.shortcuts.title')}
				footer={
					<a
						className="underline-offset-2 hover:text-foreground hover:underline"
						target="_blank"
						rel="noopener noreferrer"
						href="https://docs.selkies.io/citation/"
					>
						{t('shortcuts.citeNotice')}{" ↗"}
					</a>
				}
			>
				{shortcuts.map((s) => (
					<Row key={s.label} label={s.label}>
						<Keys keys={s.keys} />
					</Row>
				))}
			</Group>
		</>
	);
};
