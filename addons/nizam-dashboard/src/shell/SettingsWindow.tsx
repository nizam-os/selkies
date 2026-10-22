/**
 * The Settings app's window, after macOS System Settings: a sidebar of
 * sections on the left, in clusters, the chosen section's page on the right,
 * Lock at the foot of the sidebar.
 *
 * The window drags by its title bar and closes on Escape or its close button.
 * Every page is a stack of `form.tsx` groups, which the content column spaces
 * and caps at a readable width. On narrow screens the window fills the screen
 * and the sidebar becomes a scrolling row of tabs. Breakpoints hide with
 * `max-sm:hidden`, never a bare `hidden`: the core injects
 * `.hidden { display: none !important }`, which no `sm:` display utility
 * overrides.
 * @module
 */
import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { Lock, LoaderCircle, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { t } from "@/i18n";
import { lock } from "@/gate/gate";
import { chord } from "./form";

/** One entry of the sidebar. */
export interface SettingsSection {
  /** Stable key. */
  id: string;
  /** Sidebar and header label. */
  label: string;
  /** Sidebar icon. */
  icon: LucideIcon;
  /** Sidebar cluster; a change of cluster puts space between entries. */
  cluster: number;
  /** The section's page. */
  render: () => React.ReactNode;
}

interface SettingsWindowProps {
  /** The window is shown. */
  open: boolean;
  /** Closes the window. */
  onClose: () => void;
  /** Sections in sidebar order. */
  sections: SettingsSection[];
  /** ID of the shown section. */
  active: string;
  /** Picks a section. */
  onSelect: (id: string) => void;
}

/** The lock chord: a Mac's symbols run together, names elsewhere join with `+`. */
const LOCK_KEYS = chord("Ctrl", "Shift", "L");

/** Locks the session from the sidebar's foot. */
function LockRow(): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const handle = async () => {
    setBusy(true);
    try {
      await lock();
    } catch {
      toast.error(t("gate.lockFailed"));
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] text-foreground/85 outline-none hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-60"
    >
      {busy ? <LoaderCircle className="size-4 animate-spin text-muted-foreground" /> : <Lock className="size-4 text-muted-foreground" />}
      <span className="flex-1 text-left">{t("gate.lock")}</span>
      <kbd className="font-sans text-xs tracking-wider text-muted-foreground">{LOCK_KEYS.join(LOCK_KEYS[0] === "Ctrl" ? "+" : "")}</kbd>
    </button>
  );
}

/** The draggable Settings window. */
export function SettingsWindow({ open, onClose, sections, active, onSelect }: SettingsWindowProps): React.ReactElement {
  const drag = useDragControls();
  const bounds = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const current = sections.find((section) => section.id === active) ?? sections[0];

  useEffect(() => {
    if (open) windowRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [current?.id]);

  return (
    <div ref={bounds} className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center sm:p-6">
      <AnimatePresence>
        {open && current && (
          <motion.div
            ref={windowRef}
            role="dialog"
            aria-label={t("topMenu.settings")}
            tabIndex={-1}
            drag
            dragControls={drag}
            dragListener={false}
            dragMomentum={false}
            dragConstraints={bounds}
            dragElastic={0}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                onClose();
              }
            }}
            className="pointer-events-auto flex h-full max-h-[640px] w-full max-w-[880px] flex-col overflow-hidden bg-background text-foreground shadow-[0_24px_64px_-12px_rgb(0_0_0/0.35)] outline-none sm:flex-row sm:rounded-xl sm:border sm:border-border dark:shadow-[0_24px_64px_-12px_rgb(0_0_0/0.7)]"
          >
            <aside className="flex shrink-0 flex-col border-b border-border bg-foreground/[0.025] sm:w-52 sm:border-r sm:border-b-0">
              <div
                className="flex h-12 shrink-0 cursor-grab items-center gap-2 px-4 active:cursor-grabbing"
                onPointerDown={(event) => drag.start(event)}
              >
                <button
                  type="button"
                  aria-label={t("common.close")}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={onClose}
                  className="group flex size-3 items-center justify-center rounded-full bg-foreground/20 outline-none hover:bg-foreground/40 focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <X className="size-2 opacity-0 group-hover:opacity-100" strokeWidth={3.5} />
                </button>
                <span className="ml-1 text-[13px] font-semibold sm:hidden">{t("topMenu.settings")}</span>
              </div>
              <nav className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] sm:flex-1 sm:flex-col sm:gap-0.5 sm:overflow-y-auto sm:overflow-x-visible sm:pb-3">
                {sections.map((section, index) => {
                  const Icon = section.icon;
                  const selected = section.id === current.id;
                  const newCluster = index > 0 && sections[index - 1].cluster !== section.cluster;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => onSelect(section.id)}
                      aria-current={selected ? "page" : undefined}
                      className={cn(
                        "flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-[13px] whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                        newCluster && "sm:mt-3",
                        selected
                          ? "bg-foreground/[0.08] font-medium text-foreground"
                          : "text-foreground/80 hover:bg-foreground/[0.05] hover:text-foreground",
                      )}
                    >
                      <Icon className={cn("size-4", selected ? "text-foreground" : "text-muted-foreground")} />
                      {section.label}
                    </button>
                  );
                })}
              </nav>
              <div className="border-t border-border p-3 max-sm:hidden">
                <LockRow />
              </div>
            </aside>

            <section className="flex min-h-0 min-w-0 flex-1 flex-col">
              <header
                className="flex h-12 shrink-0 cursor-grab items-center px-8 active:cursor-grabbing max-sm:hidden"
                onPointerDown={(event) => drag.start(event)}
              >
                <h2 className="text-[15px] font-semibold">{current.label}</h2>
              </header>
              <div
                ref={contentRef}
                className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-8 [scrollbar-color:var(--border)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin] sm:px-8 sm:pt-1"
              >
                <div className="mx-auto grid max-w-[600px] gap-6">
                  {current.render()}
                </div>
              </div>
              <div className="border-t border-border p-2 sm:hidden">
                <LockRow />
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
