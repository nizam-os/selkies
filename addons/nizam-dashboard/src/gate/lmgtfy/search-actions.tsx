/**
 * The two buttons under the search box, after google.com's `.T14B5e input[type=submit]`:
 * an 88px block (18px top padding) centering two inline-block inputs, 36px
 * tall with `margin: 11px 4px`, separated by a real space as on the page.
 * Hover is a plain `:hover`, as Google's rule is, not Tailwind's `hover:`,
 * which only applies where the device reports a hovering pointer.
 */
export function SearchActions({
  primaryLabel = "Google Search",
  secondaryLabel = "I'm Feeling Lucky",
  onPrimary,
  onSecondary,
}: {
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
}) {
  const button =
    "mx-[4px] my-[11px] box-border inline-block h-9 min-w-[54px] cursor-pointer rounded-[8px] border border-solid border-secondary bg-secondary px-4 text-center align-baseline font-display text-sm leading-[normal] font-normal whitespace-pre text-secondary-foreground select-none [font-optical-sizing:none] [&:hover]:border-secondary-hover-border [&:hover]:bg-secondary [&:hover]:text-secondary-hover-foreground [&:hover]:shadow-secondary-hover focus:border-secondary-focus-border focus:outline-none";
  return (
    <div className="box-border h-[88px] pt-[18px]">
      <div className="text-center">
        <input
          type="button"
          role="button"
          aria-label={primaryLabel}
          className={button}
          value={primaryLabel}
          onClick={onPrimary}
        />{" "}
        <input
          type="button"
          aria-label={secondaryLabel}
          className={button}
          value={secondaryLabel}
          onClick={onSecondary}
        />
      </div>
    </div>
  );
}

/**
 * The "offered in" line, 20px under the buttons block: a 13px centered row
 * holding an inline-block with 28px lines, the links one space apart. Google
 * signs its language links per visitor (`setprefs?sig=`), and one without a
 * valid signature lands on the preferences page, so a link opens the home
 * page in its language instead, which is where Google's ends up.
 */
export function OfferedIn({
  label = "Google offered in:",
  languages = [{ label: "Français", href: "https://www.google.com/?hl=fr" }],
}: {
  label?: string;
  languages?: { label: string; href: string }[];
}) {
  return (
    <div className="mt-[20px] mb-[24px] text-center text-[13px]">
      <div className="inline-block leading-[28px] text-subtle-foreground">
        {label}
        {languages.map((l) => (
          <span key={l.label}>
            {" "}
            <a
              href={l.href}
              className="text-link no-underline [&:hover]:underline! active:underline!"
            >
              {l.label}
            </a>
          </span>
        ))}
      </div>
    </div>
  );
}
