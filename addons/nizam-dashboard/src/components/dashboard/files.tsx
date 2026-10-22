/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { computeRenderableSettings, getLastServerSettings } from "@/utils";
import { t } from "@/i18n";
import { Group, Row, RowButton } from "@/shell/form";
import { withSessionToken } from "../../../../selkies-web-core/lib/session-token.js";

/**
 * The Files page of the Settings app (upload, and the download browser) and
 * the Download Files dialog.
 *
 * The dialog is not rendered by the panel: the shell hosts `FilesDialog` beside
 * the Settings window, as it does the Apps modal, so the dialog outlives the
 * page it was opened from, and only the request to open it comes from the
 * panel. Uploads are requested with the `requestFileUpload` window
 * event; `serverSettings` messages gate which buttons show.
 * @module
 */

interface FilesProps {
    /** Opens the Download Files dialog hosted by the shell. */
    onOpenDownloads?: () => void;
}

/**
 * Renders the upload and download buttons the server settings allow, or
 * nothing when both are disabled.
 */
export function Files({ onOpenDownloads }: FilesProps) {
    const [renderableSettings, setRenderableSettings] = useState<any>(() => computeRenderableSettings(getLastServerSettings()));

    const handleUploadClick = () => {
        window.dispatchEvent(new CustomEvent('requestFileUpload'));
    };

    useEffect(() => {
        const handleWindowMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            const message = event.data;

            if (typeof message !== 'object' || message === null) return;

            if (message.type === 'serverSettings') {
                setRenderableSettings(computeRenderableSettings(message.payload));
            }
        };

        window.addEventListener('message', handleWindowMessage);
        return () => window.removeEventListener('message', handleWindowMessage);
    }, []);

    const showUpload = renderableSettings.fileUpload ?? true;
    const showDownload = renderableSettings.fileDownload ?? true;

    if (!showUpload && !showDownload) return null;

    return (
        <Group>
            {showUpload && (
                <Row label={t('prefs.upload')} description={t('prefs.uploadHint')}>
                    <RowButton onClick={handleUploadClick}>{t('prefs.chooseFiles')}</RowButton>
                </Row>
            )}
            {showDownload && (
                <Row label={t('prefs.download')} description={t('prefs.downloadHint')}>
                    <RowButton onClick={onOpenDownloads}>{t('shell.browse')}</RowButton>
                </Row>
            )}
        </Group>
    );
}

interface FilesDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * The Download Files dialog: the server's file index in an iframe, whose
 * file links are attachments. Mounted by the shell, outside the Settings
 * window.
 */
/**
 * The download frame and the spinner standing in for it. Its own component so
 * each opening mounts it afresh, which is what brings the spinner back.
 */
function FilesFrame() {
    const [loading, setLoading] = useState(true);
    return (
        <div className="relative flex-1 overflow-hidden">
            {loading && (
                <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
                    <div className="flex flex-col items-center gap-4">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        <span className="text-muted-foreground">{t('filesModal.loading')}</span>
                    </div>
                </div>
            )}
            <iframe
                src={withSessionToken("api/files/")}
                title={t('filesModal.iframeTitle')}
                onLoad={() => setLoading(false)}
                style={{ opacity: loading ? 0 : 1 }}
                className="w-full h-[calc(90vh-4rem)] border-0 transition-opacity duration-200"
            />
        </div>
    );
}

export function FilesDialog({ open, onOpenChange }: FilesDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent showCloseButton={false} className="max-h-[90vh] gap-0 overflow-hidden p-0 sm:max-w-[min(80vw,960px)]">
                <DialogHeader className="flex-row items-center justify-between gap-4 border-b px-4 py-3">
                    <div className="grid gap-0.5">
                        <DialogTitle className="text-sm font-semibold">{t('sections.files.title')}</DialogTitle>
                        <DialogDescription className="text-xs">{t('files.subtitle')}</DialogDescription>
                    </div>
                    <Button variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)} aria-label={t('common.close')}>
                        <X className="size-4" />
                    </Button>
                </DialogHeader>

                {open && <FilesFrame />}
            </DialogContent>
        </Dialog>
    );
}
