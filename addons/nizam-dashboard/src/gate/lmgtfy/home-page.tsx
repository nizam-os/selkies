import * as React from "react"
import { SiteHeader } from "./site-header"
import { HeroLogo } from "./hero-logo"
import { SearchBox, type SearchBoxIcons } from "./search-box"
import { SearchActions, OfferedIn } from "./search-actions"
import { SiteFooter } from "./site-footer"

/** Which control sent the query: Enter or Google Search, I'm Feeling Lucky, or the AI Mode pill. */
export type SearchMode = "search" | "lucky" | "ai"

export function HomePage({
  logo,
  icons,
  appsIcon,
  query,
  onQueryChange,
  inputRef,
  onSearch,
}: {
  logo?: React.ReactNode
  icons?: SearchBoxIcons
  appsIcon?: React.ReactNode
  /** The box's text, owned by the caller so it can clear it. */
  query: string
  onQueryChange: (q: string) => void
  inputRef?: React.Ref<HTMLTextAreaElement>
  onSearch?: (q: string, mode?: SearchMode) => void
}) {
  const q = query
  return (
    <div className="flex h-full min-h-[560px] flex-col">
      <SiteHeader appsIcon={appsIcon} />
      <HeroLogo>{logo}</HeroLogo>
      <form
        className="mt-[26px] px-[96px] max-sm:px-4"
        onSubmit={(e) => {
          e.preventDefault()
          onSearch?.(q)
        }}
      >
        <SearchBox
          value={q}
          onChange={onQueryChange}
          onSubmit={() => onSearch?.(q)}
          onPillClick={() => onSearch?.(q, "ai")}
          icons={icons}
          inputRef={inputRef}
          autoFocus
        />
        <SearchActions onPrimary={() => onSearch?.(q)} onSecondary={() => onSearch?.(q, "lucky")} />
      </form>
      <OfferedIn />
      <SiteFooter />
    </div>
  )
}
