/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { useState, useEffect } from "react";
import { Download, FileText, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPrefixedKey, getPrintJobs, isMobileClient, PrintJob } from "@/utils";
import { t } from "@/i18n";
import { Group, Row, SwitchRow } from "@/shell/form";

/**
 * The Printing page of the Settings app: the switch that prints each document as it arrives,
 * and the documents printed so far, each with a print and a save button.
 *
 * The documents are the core's `printDocument` messages, kept in utils so
 * none is missed while the panel is closed; the switch travels on the
 * `settings` message and a print on `printRequest`. A touch-first client
 * prints only from its own PDF viewer, so there each document has the save
 * button alone, and the notice each raises carries the link that opens it.
 * @module
 */

/** Renders the automatic-printing switch and the printed documents. */
export function Printing() {
    const [jobs, setJobs] = useState<PrintJob[]>(() => getPrintJobs());
    const [automatic, setAutomatic] = useState(() => {
        const saved = localStorage.getItem(getPrefixedKey("print_auto"));
        return saved !== null ? saved === 'true' : true;
    });

    useEffect(() => {
        const refresh = () => setJobs(getPrintJobs());
        window.addEventListener('printJobsChanged', refresh);
        return () => window.removeEventListener('printJobsChanged', refresh);
    }, []);

    const toggle = () => {
        const value = !automatic;
        setAutomatic(value);
        localStorage.setItem(getPrefixedKey("print_auto"), String(value));
        window.postMessage({ type: 'settings', settings: { print_auto: value } }, window.location.origin);
    };

    return (
        <>
            <Group>
                <SwitchRow
                    label={t('sections.printing.automaticLabel')}
                    description={t('prefs.printHint')}
                    checked={automatic}
                    onChange={toggle}
                />
            </Group>
            {jobs.length > 0 && (
                <Group title={t('prefs.documents')}>
                    {jobs.map((job) => (
                        <Row key={job.url} label={<span className="block truncate" title={job.name}>{job.name}</span>}
                            icon={<FileText className="size-4 shrink-0 text-muted-foreground" />}>
                            {!isMobileClient && (
                                <Button variant="ghost" size="icon-sm" title={t('sections.printing.printButton')}
                                    aria-label={t('sections.printing.printButton')}
                                    onClick={() => window.postMessage({ type: 'printRequest', url: job.url }, window.location.origin)}>
                                    <Printer className="size-4" />
                                </Button>
                            )}
                            <Button variant="ghost" size="icon-sm" asChild>
                                <a href={job.url} download={job.name} target={isMobileClient ? '_blank' : undefined}
                                    title={t('sections.printing.saveButton')} aria-label={t('sections.printing.saveButton')}>
                                    <Download className="size-4" />
                                </a>
                            </Button>
                        </Row>
                    ))}
                </Group>
            )}
        </>
    );
}
