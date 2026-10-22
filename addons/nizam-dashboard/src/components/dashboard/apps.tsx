/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Ellipsis, Info, Loader2, Search, TriangleAlert } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Empty, Group, Row, RowButton } from "@/shell/form";
import * as yaml from "js-yaml";
import { t } from "@/i18n";
import { getLastServerSettings } from "@/utils";
import {
    APP_COMMAND_STATE_EVENT,
    INSTALLED_APPS_ROLLBACK_EVENT,
    INSTALLED_APPS_SERVER_EVENT,
    applyServerInstalledApps,
    pendingAppAction,
    postAppCommand,
    readInstalledApps,
    writeInstalledApps,
} from "../../../../selkies-web-core/lib/app-commands.js";

/**
 * The Apps page of the Settings app: the proot-apps catalog, fetched from its
 * GitHub metadata, searchable, with the installed apps above the rest; an
 * installed app opens, updates, or is removed, any other installs.
 *
 * Actions go through the apps command contract both dashboards share
 * (`selkies-web-core/lib/app-commands.js`): it posts the selkies-proot wrapper
 * commands to the core and tracks them for rollback. Which apps are installed
 * comes from the server (`apps_installed` in the settings payload, and an
 * `appsInstalled` message when a command changes it), with localStorage holding
 * the last answer. Commands run server-side only while the `command_enabled`
 * server setting is on; without it the core suppresses every `cmd,` send, so
 * the page says why instead of pretending the install happened. Listens for
 * `serverSettings` and `appsInstalled` messages and the rollback event the
 * contract dispatches on a failed command.
 * @module
 */

const REPO_BASE_URL = 'https://raw.githubusercontent.com/linuxserver/proot-apps/master/metadata/';
const METADATA_URL = `${REPO_BASE_URL}metadata.yml`;
const IMAGE_BASE_URL = `${REPO_BASE_URL}img/`;
const METADATA_FETCH_TIMEOUT_MS = 10000;

/** One catalog entry of the proot-apps metadata. */
interface App {
    /** Package name, the argument of every command. */
    name: string;
    /** Display name. */
    full_name: string;
    description: string;
    /** Icon file name under the catalog's image directory. */
    icon: string;
    /** Listed but not installable. */
    disabled?: boolean;
}

/**
 * Session cache of the fetched catalog: the page mounts afresh each time it is
 * shown; a hit here skips the network.
 */
let cachedAppData: { include: App[] } | null = null;

/**
 * Renders the search box and the installed and available app lists.
 *
 * The catalog is fetched once per mount, plus explicit Retry presses; a
 * failure settles into the error view rather than refetching. The fetch is
 * aborted after a timeout and on unmount.
 */
export function Apps() {
    const [appData, setAppData] = useState<{ include: App[] } | null>(() => cachedAppData);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fetchAttempt, setFetchAttempt] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [installedApps, setInstalledApps] = useState<string[]>(readInstalledApps);
    const [commandTick, setCommandTick] = useState(0);

    useEffect(() => {
        writeInstalledApps(installedApps);
    }, [installedApps]);

    // The running set lives in app-commands.js; this only re-reads it.
    useEffect(() => {
        const onCommandState = () => setCommandTick((tick) => tick + 1);
        window.addEventListener(APP_COMMAND_STATE_EVENT, onCommandState);
        return () => window.removeEventListener(APP_COMMAND_STATE_EVENT, onCommandState);
    }, []);

    // A failed command already rolled the stored list back; mirror it here so
    // the badge flips without a remount.
    useEffect(() => {
        const onRollback = (event: Event) => {
            const { app, action } = (event as CustomEvent).detail || {};
            if (action === 'install')
                setInstalledApps(prev => prev.filter(name => name !== app));
            else if (action === 'remove')
                setInstalledApps(prev => prev.includes(app) ? prev : [...prev, app]);
        };
        window.addEventListener(INSTALLED_APPS_ROLLBACK_EVENT, onRollback);
        return () => window.removeEventListener(INSTALLED_APPS_ROLLBACK_EVENT, onRollback);
    }, []);

    const [serverSettings, setServerSettings] = useState<any>(() => getLastServerSettings());
    useEffect(() => {
        const handleWindowMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            const message = event.data;
            if (typeof message !== 'object' || message === null) return;
            if (message.type === 'serverSettings') setServerSettings(message.payload);
        };
        window.addEventListener('message', handleWindowMessage);
        return () => window.removeEventListener('message', handleWindowMessage);
    }, []);
    const commandsKnown = serverSettings != null;
    const commandsAvailable = serverSettings?.command_enabled?.value === true;

    // The runner's answer replaces what this browser remembered, which a private
    // window or cleared site data leaves empty while the session has apps.
    const installedFromServer = serverSettings?.apps_installed?.value;
    useEffect(() => {
        const adopt = (apps: string[] | undefined) => {
            if (applyServerInstalledApps(apps)) setInstalledApps(readInstalledApps());
        };
        adopt(installedFromServer);
        const onServerList = (event: Event) =>
            setInstalledApps((event as CustomEvent).detail?.apps || []);
        const onWindowMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            const message = event.data;
            if (typeof message !== 'object' || message === null) return;
            if (message.type === 'appsInstalled') adopt(message.apps);
        };
        window.addEventListener(INSTALLED_APPS_SERVER_EVENT, onServerList);
        window.addEventListener('message', onWindowMessage);
        return () => {
            window.removeEventListener(INSTALLED_APPS_SERVER_EVENT, onServerList);
            window.removeEventListener('message', onWindowMessage);
        };
    }, [installedFromServer]);

    useEffect(() => {
        if (appData) return;
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), METADATA_FETCH_TIMEOUT_MS);
        // Suppresses any setState landing after cleanup.
        let active = true;
        // Not derivable during render: this is the transition into a fetch,
        // and a Retry has to re-enter it.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsLoading(true);
        setError(null);
        (async () => {
            try {
                const response = await fetch(METADATA_URL, { signal: controller.signal });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const yamlText = await response.text();
                const parsedData = yaml.load(yamlText) as { include: App[] };
                if (!active) return;
                cachedAppData = parsedData;
                setAppData(parsedData);
            } catch (e) {
                if (!active) return;
                console.error("Failed to fetch or parse app data:", e);
                setError(t('appsModal.errorLoading'));
            } finally {
                clearTimeout(timeoutId);
                if (active) setIsLoading(false);
            }
        })();
        return () => {
            active = false;
            clearTimeout(timeoutId);
            controller.abort();
        };
    }, [appData, fetchAttempt]);

    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(event.target.value.toLowerCase());
    };

    const handleInstall = (appName: string) => {
        if (!commandsAvailable) return;
        postAppCommand('install', appName);
        setInstalledApps(prev => prev.includes(appName) ? prev : [...prev, appName]);
    };

    const handleRemove = (appName: string) => {
        if (!commandsAvailable) return;
        postAppCommand('remove', appName);
        setInstalledApps(prev => prev.filter(name => name !== appName));
    };

    const handleUpdate = (appName: string) => {
        if (!commandsAvailable) return;
        postAppCommand('update', appName);
    };

    const handleLaunch = (appName: string) => {
        if (!commandsAvailable) return;
        postAppCommand('launch', appName);
    };

    const filteredApps = appData?.include?.filter(app =>
        !app.disabled &&
        (app.full_name?.toLowerCase().includes(searchTerm) ||
         app.name?.toLowerCase().includes(searchTerm) ||
         app.description?.toLowerCase().includes(searchTerm))
    ) || [];

    const isAppInstalled = (appName: string) => installedApps.includes(appName);
    const installed = filteredApps.filter(app => isAppInstalled(app.name));
    const available = filteredApps.filter(app => !isAppInstalled(app.name));

    /** Install, or Open with Update and Remove behind a menu, spinning while one runs. */
    const actions = (app: App) => {
        const running = commandTick >= 0 && pendingAppAction(app.name);
        const held = !commandsAvailable || !!running;
        const spinner = <Loader2 className="size-3.5 animate-spin" />;
        if (!isAppInstalled(app.name)) {
            return (
                <RowButton onClick={() => handleInstall(app.name)} disabled={held} className="min-w-[4.5rem] rounded-full">
                    {running === 'install' ? spinner : t('appsModal.installButton')}
                </RowButton>
            );
        }
        return (
            <>
                <RowButton onClick={() => handleLaunch(app.name)} disabled={held} className="min-w-[4.5rem] rounded-full">
                    {running === 'launch' ? spinner : t('prefs.open')}
                </RowButton>
                <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild disabled={held}>
                        <Button variant="ghost" size="icon-sm" className="size-7" aria-label={t('prefs.moreActions', { name: app.full_name })}>
                            {running === 'update' || running === 'remove' ? spinner : <Ellipsis className="size-4" />}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-auto min-w-36">
                        <DropdownMenuItem className="text-[13px]" onSelect={() => handleUpdate(app.name)}>
                            {t('appsModal.updateButton')}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-[13px]" variant="destructive" onSelect={() => handleRemove(app.name)}>
                            {t('appsModal.removeButton')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </>
        );
    };

    const appRow = (app: App) => (
        <Row
            key={app.name}
            label={app.full_name}
            description={<span className="line-clamp-1" title={app.description}>{app.description}</span>}
            icon={
                <img
                    src={`${IMAGE_BASE_URL}${app.icon}`}
                    alt=""
                    loading="lazy"
                    className="size-8 shrink-0 object-contain"
                    onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                />
            }
        >
            {actions(app)}
        </Row>
    );

    return (
        <>
            <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                    type="search"
                    aria-label={t('appsModal.searchPlaceholder')}
                    placeholder={t('appsModal.searchPlaceholder')}
                    value={searchTerm}
                    onChange={handleSearchChange}
                    className="allow-native-input h-8 bg-card pl-8 text-[13px] md:text-[13px] dark:bg-card"
                />
            </div>
            {commandsKnown && !commandsAvailable && (
                <Group>
                    <Row label={t('prefs.installUnavailable')} description={t('appsModal.commandsDisabled')}
                        icon={<Info className="size-4 shrink-0 text-muted-foreground" />} />
                </Group>
            )}
            {isLoading && (
                <Group plain>
                    <Empty icon={<Loader2 className="size-5 animate-spin" />}>{t('appsModal.loading')}</Empty>
                </Group>
            )}
            {error && (
                <Group plain>
                    <Empty icon={<TriangleAlert className="size-5" />}>
                        <p>{error}</p>
                        <RowButton onClick={() => setFetchAttempt(n => n + 1)}>{t('appsModal.retryButton')}</RowButton>
                    </Empty>
                </Group>
            )}
            {!isLoading && !error && appData && (
                <>
                    {installed.length > 0 && <Group title={t('prefs.installed')}>{installed.map(appRow)}</Group>}
                    <Group title={t('prefs.available')} footer={t('prefs.catalogSource')}>
                        {available.length > 0 ? available.map(appRow) : <Empty>{t('appsModal.noAppsFound')}</Empty>}
                    </Group>
                </>
            )}
        </>
    );
}
