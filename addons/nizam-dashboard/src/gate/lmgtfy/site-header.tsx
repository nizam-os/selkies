import * as React from "react"
import { Slot } from "./slot"

/** A link as google.com writes it: its accessible name and target where Google gives one. */
export type NavLink = { label: string; href: string; aria?: string; target?: string }

/**
 * 60px top bar. Left: 14px nav links. Right: 13px links, 40px apps button, and
 * google.com's Sign in pill (`.gb_A`): 85×40 at least, 14px/500 on 18px lines
 * in Google's `Google Sans Text` stack, a face google.com never loads, so both
 * pages fall back alike (Helvetica on a Mac); an overlay of its text color
 * fades to 8% over 500ms on hover, under a two-layer shadow. The apps button
 * (`.gb_C`) is tinted on hover and carries a 300ms overlay of its icon color
 * (8% on hover, 12% on focus). Hover is a plain `:hover` throughout, as
 * Google's is. A phone gets no Gmail or Images link, as on Google's phone
 * page, so the bar fits 320px. Every link goes where google.com's goes, for a
 * visitor in Canada.
 */
export function SiteHeader({
  left = [
    { label: "About", href: "https://about.google/?fg=1&utm_source=google-CA&utm_medium=referral&utm_campaign=hp-header" },
    { label: "Store", href: "https://store.google.com/CA?utm_source=hp_header&utm_medium=google_ooo&utm_campaign=GS100042&hl=en-CA" },
  ],
  right = [
    { label: "Gmail", href: "https://mail.google.com/mail/&ogbl", aria: "Gmail ", target: "_top" },
    { label: "Images", href: "https://www.google.com/imghp?hl=en&ogbl", aria: "Search for Images ", target: "_top" },
  ],
  appsHref = "https://www.google.ca/intl/en/about/products",
  appsIcon,
  signInHref = "https://accounts.google.com/ServiceLogin?hl=en&passive=true&continue=https://www.google.com/&ec=futura_exp_og_so_72776762_e",
  signInLabel = "Sign in",
}: {
  left?: NavLink[]
  right?: NavLink[]
  appsHref?: string
  appsIcon?: React.ReactNode // 24×24
  signInHref?: string
  signInLabel?: string
}) {
  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between p-[6px]">
      <nav className="flex items-center">
        {left.map((l, i) => (
          <a
            key={l.label}
            href={l.href}
            aria-label={l.aria}
            target={l.target}
            className={`mx-[5px] inline-block p-[5px] leading-[normal] text-foreground no-underline [&:hover]:underline! ${i === 0 ? "ml-[15px]" : ""}`}
          >
            {l.label}
          </a>
        ))}
      </nav>

      <div className="mb-[4px] flex items-center pr-[4px]">
        {right.map((l, i) => (
          <a
            key={l.label}
            href={l.href}
            aria-label={l.aria}
            target={l.target}
            className={`text-[13px] leading-6 text-header-link no-underline max-sm:hidden [&:hover]:underline! ${i > 0 ? "ml-[15px]" : ""}`}
          >
            {l.label}
          </a>
        ))}
        <a
          href={appsHref}
          role="button"
          aria-label="Google apps"
          className="relative ml-[15px] flex size-10 cursor-pointer items-center justify-center rounded-[50%] border-0 bg-transparent p-2 text-header-icon outline-none before:absolute before:inset-0 before:rounded-[100px] before:bg-header-icon before:opacity-0 before:transition-opacity before:duration-300 before:ease-[ease-out] focus:before:opacity-[0.12] [&:hover]:bg-icon-button-hover [&:hover]:before:opacity-[0.08]"
        >
          <Slot width={24} label="apps icon">{appsIcon}</Slot>
        </a>
        <a
          href={signInHref}
          target="_top"
          aria-label={signInLabel}
          className="relative ml-2 min-h-10 min-w-[85px] rounded-[100px] bg-sign-in px-3 py-[10px] text-center font-text text-sm leading-[18px] font-medium text-sign-in-foreground no-underline outline-none before:absolute before:inset-0 before:rounded-[100px] before:bg-sign-in-foreground before:opacity-0 before:transition-opacity before:duration-500 before:ease-[ease-out] [&:hover]:shadow-sign-in-hover [&:hover]:before:opacity-[0.08]"
        >
          <span className="block">{signInLabel}</span>
        </a>
      </div>
    </header>
  )
}
