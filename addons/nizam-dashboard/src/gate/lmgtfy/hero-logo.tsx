import * as React from "react"
import { Slot } from "./slot"

/**
 * Logo area. Height = viewport − 560px, clamped 92–290px; logo sits on the bottom edge.
 * Logo slot is 272×92.
 */
export function HeroLogo({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex h-[calc(100%-560px)] max-h-[290px] min-h-[92px] shrink-0 flex-col items-center justify-end px-[96px] max-sm:px-4">
      <Slot width={272} height={92} label="logo">{children}</Slot>
    </div>
  )
}
