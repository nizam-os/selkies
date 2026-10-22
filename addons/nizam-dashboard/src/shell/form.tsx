/**
 * The building blocks of every Settings page, after macOS System Settings: a
 * page is a stack of groups (the window spaces them), a group is one rounded
 * card of rows under a small title, and a row is a label, with an optional
 * line of description, on the left and one compact control on the right.
 *
 * Values never go in a label: a slider shows its value beside the track, a
 * select shows its choice, so a label reads the same whatever is chosen. A
 * group is a size container, and a slider row stacks its track under the label
 * when the group is too narrow for both on one line, so the window works from
 * phone width up without a control ever being squeezed.
 * @module
 */
import React, { useId } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { isMacDesktop } from "../../../selkies-web-core/lib/util.js";

interface GroupProps {
  /** Small title above the card. */
  title?: string;
  /** Note under the card. */
  footer?: React.ReactNode;
  /** Laid out bare inside the card, for content that is not rows. */
  plain?: boolean;
  children: React.ReactNode;
}

/** A titled card of rows. */
export function Group({ title, footer, plain, children }: GroupProps): React.ReactElement {
  return (
    <section>
      {title && <h3 className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">{title}</h3>}
      <div
        className={cn(
          "@container overflow-hidden rounded-[10px] border border-border/80 bg-card",
          !plain && "divide-y divide-border/70",
        )}
      >
        {children}
      </div>
      {footer && <p className="mt-1.5 px-1 text-xs leading-relaxed text-muted-foreground">{footer}</p>}
    </section>
  );
}

interface RowProps {
  /** The setting's name. */
  label: React.ReactNode;
  /** One line on what it does. */
  description?: React.ReactNode;
  /** ID of the control the label names, which clicking the label then activates. */
  htmlFor?: string;
  /** Tooltip over the label. */
  title?: string;
  /** Leading artwork, such as an app icon. */
  icon?: React.ReactNode;
  /** The control, right-aligned. */
  children?: React.ReactNode;
}

/** A label, an optional description, and a control. */
export function Row({ label, description, htmlFor, title, icon, children }: RowProps): React.ReactElement {
  const Label = htmlFor ? "label" : "div";
  return (
    <div className="flex min-h-11 items-center gap-3 px-3.5 py-2">
      {icon}
      <div className="min-w-0 flex-1" title={title}>
        <Label htmlFor={htmlFor} className="block text-[13px] leading-5 text-foreground">{label}</Label>
        {description && <p className="text-xs leading-4 text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

interface SwitchRowProps {
  label: string;
  description?: React.ReactNode;
  title?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

/** A row whose control is a switch, toggled by its label too. */
export function SwitchRow({ label, description, title, checked, onChange, disabled }: SwitchRowProps): React.ReactElement {
  const id = useId();
  return (
    <Row label={label} description={description} title={title} htmlFor={id}>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </Row>
  );
}

/** One choice of a `Select`. */
export interface Option<T> {
  value: T;
  label: string;
  disabled?: boolean;
  /** Muted text after the label, such as why it is disabled. */
  note?: string;
}

interface SelectProps<T> {
  /** Accessible name. */
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  /** Shown when `value` matches no option. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** A compact pop-up button listing its choices, the chosen one checked. */
export function Select<T extends string | number>({
  label, value, options, onChange, placeholder, disabled, className,
}: SelectProps<T>): React.ReactElement {
  const current = options.find((option) => option.value === value);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex h-7 max-w-56 min-w-32 items-center justify-between gap-2 rounded-md border border-border bg-background pr-1.5 pl-2.5 text-[13px] text-foreground shadow-xs outline-none hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 aria-expanded:bg-muted/70 dark:bg-input/20",
            className,
          )}
        >
          <span className="truncate">{current?.label ?? placeholder}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto max-w-80 min-w-(--radix-dropdown-menu-trigger-width)">
        {options.map((option) => (
          <DropdownMenuItem
            key={String(option.value)}
            disabled={option.disabled}
            onSelect={() => onChange(option.value)}
            className="gap-2 pl-1.5 text-[13px]"
          >
            <Check className={cn("size-3.5", option.value === value ? "opacity-100" : "opacity-0")} />
            <span className="flex-1 truncate">{option.label}</span>
            {option.note && <span className="pl-3 text-xs text-muted-foreground">{option.note}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A row whose control is a `Select`. */
export function SelectRow<T extends string | number>({ description, title, ...select }: SelectProps<T> & {
  description?: React.ReactNode; title?: string;
}): React.ReactElement {
  return (
    <Row label={select.label} description={description} title={title}>
      <Select {...select} />
    </Row>
  );
}

interface SliderRowProps {
  label: string;
  description?: React.ReactNode;
  /** The current value as shown beside the track, such as `60 fps`. */
  valueText: string;
  /** Track position. */
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/** A row with a slider and its value; the track drops under the label in a narrow group. */
export function SliderRow({
  label, description, valueText, value, min, max, step = 1, onChange, disabled,
}: SliderRowProps): React.ReactElement {
  return (
    <div className="grid min-h-11 items-center gap-x-6 gap-y-2 px-3.5 py-2.5 @md:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="text-[13px] leading-5">{label}</div>
        {description && <p className="text-xs leading-4 text-muted-foreground">{description}</p>}
      </div>
      <div className="flex items-center gap-3 @md:w-64">
        <Slider
          min={min}
          max={max}
          step={step}
          value={[value]}
          onValueChange={([next]) => onChange(next)}
          disabled={disabled}
          aria-label={label}
          className="flex-1"
        />
        <span className="w-16 shrink-0 text-right text-[13px] text-muted-foreground tabular-nums">{valueText}</span>
      </div>
    </div>
  );
}

/** A compact button for a row. */
export function RowButton({ className, ...props }: React.ComponentProps<typeof Button>): React.ReactElement {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn("h-7 rounded-md px-3 text-[13px] font-normal", className)}
      {...props}
    />
  );
}

interface SegmentedProps<T> {
  /** Accessible name. */
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}

/** A row of mutually exclusive choices, all in view. */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>): React.ReactElement {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-7 items-center rounded-md bg-muted p-0.5">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-6 rounded-[5px] px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              selected
                ? "bg-background text-foreground shadow-sm dark:bg-accent"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

const MAC_MODIFIERS: Record<string, string> = { Ctrl: "⌃", Shift: "⇧", Alt: "⌥" };

/**
 * A chord's keys as this device's keyboard labels them: macOS's modifier
 * symbols on a Mac, the names elsewhere. The chords are Control chords on
 * every platform, so a Mac shows ⌃, never ⌘.
 * @param keys Key names, modifiers as `Ctrl`, `Shift`, and `Alt`.
 */
export function chord(...keys: string[]): string[] {
  return isMacDesktop() ? keys.map((key) => MAC_MODIFIERS[key] ?? key) : keys;
}

/** Keys of a shortcut, each in its own cap. */
export function Keys({ keys }: { keys: string[] }): React.ReactElement {
  return (
    <span className="flex items-center gap-1">
      {keys.map((key) => (
        <kbd
          key={key}
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-[5px] border border-border bg-background px-1.5 font-sans text-xs text-muted-foreground shadow-[0_1px_0_var(--border)]"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

/** A centered message filling a card with nothing else to show. */
export function Empty({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-[13px] text-muted-foreground">
      {icon}
      {children}
    </div>
  );
}
