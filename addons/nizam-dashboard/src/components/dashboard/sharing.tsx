/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useState, useEffect } from "react";
import { Check, Info } from "lucide-react";
import { toast } from "sonner";
import { computeRenderableSettings, getLastServerSettings } from "@/utils";
import { t } from "@/i18n";
import { Empty, Group, Row, RowButton } from "@/shell/form";

/**
 * The Sharing page of the Settings app: copyable links for the viewer (`#shared`) and the
 * controller slots (`#player2` to `#player4`), each gated by the matching
 * server setting from `serverSettings` messages.
 * @module
 */

/** Every shareable hash with its label and badge; the server settings filter it. */
const sharingLinks = [
	{
		id: "shared",
		label: t('sharing.viewerLabel'),
		badge: t('sharing.viewerBadge'),
		hash: "#shared",
	},
	{
		id: "player2",
		label: t('sharing.controllerLabel', { n: 2 }),
		badge: t('sharing.controllerBadge', { n: 2 }),
		hash: "#player2",
	},
	{
		id: "player3",
		label: t('sharing.controllerLabel', { n: 3 }),
		badge: t('sharing.controllerBadge', { n: 3 }),
		hash: "#player3",
	},
	{
		id: "player4",
		label: t('sharing.controllerLabel', { n: 4 }),
		badge: t('sharing.controllerBadge', { n: 4 }),
		hash: "#player4",
	},
];

interface SharingProps {
	show: boolean;
}

/**
 * Renders the link rows, a notice when the admin disabled sharing, or
 * nothing while `show` is false.
 */
export const Sharing = ({ show }: SharingProps) => {
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [renderableSettings, setRenderableSettings] = useState<any>(() => computeRenderableSettings(getLastServerSettings()));

	const baseUrl =
		typeof window !== "undefined" ? window.location.href.split("#")[0] : "";

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			if (
				event.origin === window.location.origin &&
				event.data?.type === "serverSettings"
			) {
				console.log("Sharing received server settings:", event.data.payload);
				setRenderableSettings(computeRenderableSettings(event.data.payload));
			}
		};
		window.addEventListener("message", handleMessage);
		return () => {
			window.removeEventListener("message", handleMessage);
		};
	}, []);

	/** Copies a link to the local clipboard and reports the outcome as a toast. */
	const handleCopyLink = async (fullUrl: string, id: string, label: string) => {
		if (!navigator.clipboard) {
			console.warn("Clipboard API not available.");
			return;
		}
		try {
			await navigator.clipboard.writeText(fullUrl);
			setCopiedId(id);
			setTimeout(() => setCopiedId(null), 2000);
			
			toast.success(t('notifications.copiedTitle', { label }), {
				description: t('notifications.copiedMessage', { textToCopy: fullUrl }),
				duration: 3000,
			});
		} catch (err) {
			console.error("Failed to copy link: ", err);

			toast.error(t('notifications.copyFailedTitle', { label }), {
				description: t('notifications.copyFailedError'),
				duration: 5000,
			});
		}
	};

	if (!show) return null;

	const filteredSharingLinks = sharingLinks.filter(link => {
		if (link.id === 'shared') return renderableSettings.enableShared ?? true;
		if (link.id === 'player2') return renderableSettings.enablePlayer2 ?? true;
		if (link.id === 'player3') return renderableSettings.enablePlayer3 ?? true;
		if (link.id === 'player4') return renderableSettings.enablePlayer4 ?? true;
		return false;
	});

	if (renderableSettings.enableSharing === false) {
		return (
			<Group plain>
				<Empty icon={<Info className="size-5" />}>{t('sharing.disabledByAdmin')}</Empty>
			</Group>
		);
	}

	return (
		<Group title={t('prefs.links')} footer={`${t('sharing.tooltipLine1')} ${t('sharing.tooltipLine2')}`}>
			{filteredSharingLinks.map((link) => {
				const fullUrl = `${baseUrl}${link.hash}`;
				return (
					<Row key={link.id} label={link.label} description={link.badge}>
						<RowButton
							onClick={() => handleCopyLink(fullUrl, link.id, link.label)}
							aria-label={t('sharing.copyAria', { label: link.label })}
							className="min-w-20"
						>
							{copiedId === link.id ? <><Check className="size-3.5" />{t('sharing.copied')}</> : t('prefs.copyLink')}
						</RowButton>
					</Row>
				);
			})}
			{filteredSharingLinks.length === 0 && <Empty>{t('sharing.noneAvailable')}</Empty>}
		</Group>
	);
};
