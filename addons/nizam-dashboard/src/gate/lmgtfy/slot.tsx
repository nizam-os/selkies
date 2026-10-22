import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Fixed-size box for an icon / image. Pass your own SVG or <img> as children;
 * without children it renders a dashed placeholder at the exact measured size.
 */
export function Slot({
  width,
  height = width,
  label,
  round,
  className,
  children,
}: {
  width: number
  height?: number
  label?: string
  round?: boolean
  className?: string
  children?: React.ReactNode
}) {
  return (
    <span
      aria-hidden={!label}
      title={children ? undefined : `${label ?? "slot"} ${width}×${height}`}
      style={{ width, height }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden [&>*]:size-full",
        !children &&
          "border border-dashed border-current/40 bg-current/5 opacity-70",
        round ? "rounded-full" : !children && "rounded-[4px]",
        className
      )}
    >
      {children}
    </span>
  )
}
