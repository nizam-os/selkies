/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useState, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Group, RowButton, SwitchRow } from "@/shell/form";
import { computeRenderableSettings, getLastClipboardContent, getLastServerSettings, getPrefixedKey } from "@/utils";
import { t } from "@/i18n";

/**
 * The Clipboard page of the Settings app: which way the clipboard syncs, the
 * server clipboard's text, editable, and an image upload when the binary
 * clipboard is on.
 *
 * Reads `clipboardContentUpdate` and `serverSettings` messages from the core
 * and posts `clipboardUpdateFromUI` (text, on blur), `clipboardImageUpdate`
 * (an image blob) and `settings` (the `enable_binary_clipboard` toggle, which
 * the core persists). A rejected non-image file is reported through the
 * `fileUpload` warning channel core-emitted clipboard skips use.
 * @module
 */

/**
 * Renders the clipboard text area, the binary-clipboard switch and the image
 * upload controls.
 *
 * State is seeded from the cached `clipboardContentUpdate`: the panel mounts
 * when its submenu opens, usually long after the core last reported the
 * clipboard. Large server clipboards arrive as a bounded, truncated preview;
 * editing it would echo the cut-down text back over the real server
 * clipboard on blur, so truncated content renders read-only.
 */
/** Tallest the preview is shown, matching the max-h-32 the canvas carries. */
const PREVIEW_MAX_PX = 128;

export function Clipboard() {
	const [dashboardClipboardContent, setDashboardClipboardContent] = useState(
		() => getLastClipboardContent()?.text ?? '');
	const [clipboardTruncated, setClipboardTruncated] = useState(
		() => getLastClipboardContent()?.truncated ?? false);
	const [clipboardImage, setClipboardImage] = useState<File | null>(null);
	const previewRef = useRef<HTMLCanvasElement>(null);
	const [renderableSettings, setRenderableSettings] = useState<any>(() => computeRenderableSettings(getLastServerSettings()));
	const fileInputRef = useRef<HTMLInputElement>(null);
	const storedBool = (key: string, fallback: boolean) => {
		const saved = localStorage.getItem(getPrefixedKey(key));
		return saved !== null ? saved === 'true' : fallback;
	};
	/** A switch's starting state: a locked server value, else the stored
	 * preference, else the server's value. The panel mounts when its menu
	 * opens, after the server settings arrived. */
	const startingBool = (key: string) => {
		const server = getLastServerSettings()?.[key];
		if (server?.locked) return !!server.value;
		return storedBool(key, server ? !!server.value : true);
	};
	const [enableBinaryClipboard, setEnableBinaryClipboard] = useState(() => startingBool("enable_binary_clipboard"));
	const [clipboardUp, setClipboardUp] = useState(() => storedBool("clipboard_in_enabled", true));
	const [clipboardDown, setClipboardDown] = useState(() => storedBool("clipboard_out_enabled", true));
	const [clipboardSeamless, setClipboardSeamless] = useState(() => startingBool("clipboard_seamless"));

	/** One clipboard switch: optimistic, stored, then posted like any setting. */
	const toggleClientSetting = (key: string, value: boolean,
		setValue: (v: boolean) => void) => {
		setValue(value);
		localStorage.setItem(getPrefixedKey(key), String(value));
		window.postMessage({ type: 'settings', settings: { [key]: value } }, window.location.origin);
	};

	const handleBinaryClipboardToggle = () => {
		const newState = !enableBinaryClipboard;
		setEnableBinaryClipboard(newState);
		window.postMessage(
			{ type: 'settings', settings: { enable_binary_clipboard: newState } },
			window.location.origin
		);
	};

	useEffect(() => {
		const handleWindowMessage = (event: MessageEvent) => {
			if (event.origin !== window.location.origin) return;
			const message = event.data;

			if (typeof message !== 'object' || message === null) return;

			if (message.type === 'clipboardContentUpdate') {
				if (typeof message.text === 'string') {
					setDashboardClipboardContent(message.text);
					setClipboardTruncated(message.truncated === true);
				}
			}

			if (message.type === 'serverSettings') {
				const payload = message.payload;
				setRenderableSettings(computeRenderableSettings(payload));
				const s = payload?.enable_binary_clipboard;
				if (s) {
					const saved = localStorage.getItem(getPrefixedKey('enable_binary_clipboard'));
					const final = s.locked ? s.value : (saved !== null ? saved === 'true' : s.value);
					setEnableBinaryClipboard(final);
				}
				const seamless = payload?.clipboard_seamless;
				if (seamless) {
					setClipboardSeamless(seamless.locked ? seamless.value
						: storedBool('clipboard_seamless', seamless.value));
				}
			}
		};

		window.addEventListener('message', handleWindowMessage);
		return () => window.removeEventListener('message', handleWindowMessage);
	}, []);

	const handleClipboardChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
		setDashboardClipboardContent(event.target.value);
	};

	const handleClipboardBlur = (event: React.FocusEvent<HTMLTextAreaElement>) => {
		if (clipboardTruncated) return;
		window.postMessage({ type: 'clipboardUpdateFromUI', text: event.target.value }, window.location.origin);
	};

	const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		// Cleared so re-picking the same file fires a change event.
		event.target.value = '';
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			window.postMessage({
				type: 'fileUpload',
				payload: {
					status: 'warning',
					fileName: 'clipboard-image',
					message: t('notifications.clipboardImageRejected', {
						name: file.name,
						mime: file.type || 'unknown',
					}),
				},
			}, window.location.origin);
			return;
		}
		setClipboardImage(file);
		window.postMessage({
			type: 'clipboardImageUpdate',
			imageBlob: file,
		}, window.location.origin);
	};

	// The preview draws the picked image rather than pointing an <img> at a URL
	// for it: decoding the bytes that were picked is the whole of it, so there
	// is no URL to mint, hand to the DOM, scheme-check or revoke.
	useEffect(() => {
		const canvas = previewRef.current;
		if (!canvas || !clipboardImage) return;
		let canceled = false;
		createImageBitmap(clipboardImage).then(bitmap => {
			if (canceled) {
				bitmap.close();
				return;
			}
			// The panel shows it at most PREVIEW_MAX_PX tall; drawing it that
			// size keeps a multi-megapixel picture off the canvas as well.
			const scale = Math.min(1, PREVIEW_MAX_PX / bitmap.height);
			canvas.width = Math.max(1, Math.round(bitmap.width * scale));
			canvas.height = Math.max(1, Math.round(bitmap.height * scale));
			canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
			bitmap.close();
		}).catch(() => {});
		return () => { canceled = true; };
	}, [clipboardImage]);

	const handleImageButtonClick = () => {
		fileInputRef.current?.click();
	};

	const handleClearImage = () => {
		setClipboardImage(null);
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	const showBinary = renderableSettings.binaryClipboard ?? true;
	return (
		<>
			{((renderableSettings.clipboardUp ?? true) || (renderableSettings.clipboardDown ?? true)
				|| (renderableSettings.clipboardSeamless ?? true) || showBinary) && (
				<Group title={t('prefs.sync')}>
					{(renderableSettings.clipboardUp ?? true) && (
						<SwitchRow
							label={t('prefs.send')}
							description={t('prefs.sendHint')}
							checked={clipboardUp}
							onChange={() => toggleClientSetting("clipboard_in_enabled", !clipboardUp, setClipboardUp)}
						/>
					)}
					{(renderableSettings.clipboardDown ?? true) && (
						<SwitchRow
							label={t('prefs.receive')}
							description={t('prefs.receiveHint')}
							checked={clipboardDown}
							onChange={() => toggleClientSetting("clipboard_out_enabled", !clipboardDown, setClipboardDown)}
						/>
					)}
					{(renderableSettings.clipboardSeamless ?? true) && (
						<SwitchRow
							label={t('sections.clipboard.seamlessLabel')}
							description={t('prefs.seamlessHint')}
							checked={clipboardSeamless}
							onChange={() => toggleClientSetting("clipboard_seamless", !clipboardSeamless, setClipboardSeamless)}
						/>
					)}
					{showBinary && (
						<SwitchRow
							label={t('prefs.images')}
							description={t('prefs.imagesHint')}
							checked={enableBinaryClipboard}
							onChange={handleBinaryClipboardToggle}
						/>
					)}
				</Group>
			)}

			<Group title={t('prefs.contents')} plain>
				<Textarea
					id="dashboardClipboardTextarea"
					aria-label={t('sections.clipboard.title')}
					value={dashboardClipboardContent}
					onChange={handleClipboardChange}
					onBlur={handleClipboardBlur}
					readOnly={clipboardTruncated}
					rows={6}
					placeholder={t('clipboard.inputPlaceholder')}
					className="allow-native-input max-h-60 min-h-32 resize-none rounded-none border-0 bg-transparent px-3.5 py-3 text-[13px] shadow-none focus-visible:ring-0 md:text-[13px] dark:bg-transparent"
				/>
				{/* Image writes need the binary clipboard: the server drops them otherwise. */}
				{showBinary && enableBinaryClipboard && (
					<div className="flex items-center gap-3 border-t border-border/70 px-3.5 py-2.5">
						{clipboardImage ? (
							<canvas
								ref={previewRef}
								role="img"
								aria-label={t('clipboard.previewAlt')}
								className="max-h-16 max-w-32 rounded border border-border"
							/>
						) : (
							<span className="flex-1 text-xs text-muted-foreground">{t('prefs.imageHint')}</span>
						)}
						<div className="ml-auto flex gap-2">
							{clipboardImage && (
								<RowButton onClick={handleClearImage}>{t('prefs.clear')}</RowButton>
							)}
							<RowButton onClick={handleImageButtonClick}>{t('prefs.chooseImage')}</RowButton>
						</div>
						<input
							ref={fileInputRef}
							type="file"
							accept="image/*"
							onChange={handleImageUpload}
							className="hidden"
						/>
					</div>
				)}
			</Group>
		</>
	);
}
