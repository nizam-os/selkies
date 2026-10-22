import type { NavLink } from "./site-header"

/**
 * The footer: a region row (15px, padding 15px 30px, 1px divider) over a link
 * row (14px links, padding 15px), all on the font's normal line height, as
 * google.com's are, so the rows are as tall as there (about 48px and 46px with
 * a Mac's Arial) wherever the font's metrics differ. The links are
 * google.com's for Canada; Settings, a menu there, opens the menu's first
 * entry, Search settings.
 */
export function SiteFooter({
  region = "Canada",
  left = [
    { label: "Advertising", href: "https://www.google.com/intl/en_ca/ads/?subid=ww-ww-et-g-awa-a-g_hpafoot1_1!o2&utm_source=google.com&utm_medium=referral&utm_campaign=google_hpafooter&fg=1" },
    { label: "Business", href: "https://www.google.com/services/?subid=ww-ww-et-g-awa-a-g_hpbfoot1_1!o2&utm_source=google.com&utm_medium=referral&utm_campaign=google_hpbfooter&fg=1" },
    { label: "How Search works", href: "https://google.com/search/howsearchworks/?fg=1" },
  ],
  right = [
    { label: "Privacy", href: "https://policies.google.com/privacy?hl=en-CA&fg=1" },
    { label: "Terms", href: "https://policies.google.com/terms?hl=en-CA&fg=1" },
    { label: "Settings", href: "https://www.google.com/preferences?hl=en-CA&fg=1" },
  ],
}: {
  region?: string
  left?: NavLink[]
  right?: NavLink[]
}) {
  const group = (links: NavLink[]) => (
    <div className="flex flex-wrap justify-between">
      {links.map((l) => (
        <a key={l.label} href={l.href} className="block p-[15px] whitespace-nowrap text-foreground no-underline [&:hover]:underline!">
          {l.label}
        </a>
      ))}
    </div>
  )
  return (
    <footer className="mt-auto shrink-0 bg-background leading-[normal]">
      <div className="flex flex-wrap justify-between border-b px-[30px] py-[15px] text-[15px] text-foreground">
        {region}
      </div>
      <div className="flex flex-wrap justify-between px-5 max-[1200px]:justify-evenly">
        {group(left)}
        {group(right)}
      </div>
    </footer>
  )
}
