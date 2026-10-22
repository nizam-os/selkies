import * as React from "react"
import { motion, useMotionTemplate, useSpring } from "framer-motion"
import { cn } from "@/lib/utils"
import { Slot } from "./slot"

export type SearchBoxIcons = {
  plus?: React.ReactNode // 24×24 inside a 36px round button
  voice?: React.ReactNode // 24×24
  image?: React.ReactNode // 24×24
  pill?: React.ReactNode // 20×20, inside the right pill
}

/** 688×52 pill search box (1px border + 50px inner). */
export function SearchBox({
  value,
  onChange,
  onSubmit,
  icons = {},
  pillLabel = "AI Mode",
  onPillClick,
  autoFocus,
  inputRef,
  className,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit?: () => void
  icons?: SearchBoxIcons
  pillLabel?: string
  onPillClick?: () => void
  autoFocus?: boolean
  inputRef?: React.Ref<HTMLTextAreaElement>
  className?: string
}) {
  return (
    <div className={cn("relative mx-auto max-w-[688px] min-w-[295px] max-sm:min-w-0", className)}>
      <div className="relative z-[3] mx-auto flex min-h-[50px] rounded-search border border-search-border bg-search shadow-search">
        <div className="flex min-w-0 flex-1 rounded-[inherit] bg-inherit pr-2">
          {/* + button */}
          <div className="flex items-center pl-[6px]">
            <button
              type="button"
              aria-label="Add files and tools"
              className="flex size-9 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-foreground hover:bg-muted"
            >
              <Slot width={24} label="plus">{icons.plus}</Slot>
            </button>
          </div>

          {/* input */}
          {/* Holds the lock password: nothing the browser could keep or send off */}
          <textarea
            ref={inputRef}
            aria-label="Search"
            rows={1}
            value={value}
            autoFocus={autoFocus}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-gramm="false"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                onSubmit?.()
              }
            }}
            className="ml-[6px] h-[50px] min-w-0 flex-1 resize-none overflow-hidden border-0 bg-transparent p-0 pt-[14px] font-display text-base leading-[22px] text-foreground outline-none"
          />

          {/* right actions */}
          <div className="flex h-[50px] shrink-0 items-center rounded-[inherit] bg-inherit">
            <button type="button" aria-label="Search by voice" className="flex h-6 w-10 cursor-pointer items-center border-0 bg-transparent px-2 text-foreground">
              <Slot width={24} label="voice">{icons.voice}</Slot>
            </button>
            <button type="button" aria-label="Search by image" className="flex h-6 w-10 cursor-pointer items-center border-0 bg-transparent px-2 text-foreground">
              <Slot width={24} label="image">{icons.image}</Slot>
            </button>
            <PillButton icon={icons.pill} label={pillLabel} onClick={onPillClick} />
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 36px AI Mode pill (right side of the search box), after google.com: a flat
 * pill at rest; on hover the glow (`.lmgtfy-glow*` in theme.css) fades in
 * behind it over 350ms and leans toward the pointer. Its masks aim at the
 * pointer's bearing from the pill's center plus 103°, and the color wheel eases
 * after them 20° further round, both unwrapped so they turn the short way.
 * Offsets and easing are fitted to samples of the live page.
 */
function PillButton({
  icon,
  label,
  onClick,
}: {
  icon?: React.ReactNode
  label: string
  onClick?: () => void
}) {
  const [hover, setHover] = React.useState(false)
  const aim = useSpring(200, { stiffness: 300, damping: 30 })
  const spin = useSpring(225, { stiffness: 80, damping: 20 })
  const glowStyle = {
    "--glow-aim": useMotionTemplate`${aim}deg`,
    "--glow-spin": useMotionTemplate`${spin}deg`,
  } as React.ComponentProps<typeof motion.span>["style"]

  const follow = (e: React.PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const bearing =
      (Math.atan2(e.clientX - (r.left + r.width / 2), r.top + r.height / 2 - e.clientY) * 180) / Math.PI
    const from = aim.get()
    const to = from + ((((bearing + 103 - from) % 360) + 540) % 360) - 180
    aim.set(to)
    spin.set(to + 20)
  }

  const layer = (fine: boolean) => (
    <span className={cn("lmgtfy-glow-layer", fine && "fine")}>
      <span className="lmgtfy-glow-mask">
        <span className="lmgtfy-glow-colors" />
      </span>
    </span>
  )

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={(e) => {
        setHover(true)
        follow(e)
      }}
      onPointerMove={follow}
      onPointerLeave={() => setHover(false)}
      className="group relative ml-2 flex h-9 shrink-0 cursor-pointer items-center self-center rounded-full border-0 bg-inherit px-2 font-display text-sm leading-5 font-normal text-foreground outline-none [font-optical-sizing:none]"
    >
      <motion.span aria-hidden className="lmgtfy-glow" style={glowStyle}>
        <span className="lmgtfy-glow-fade" data-on={hover ? "" : undefined}>
          <span className="absolute inset-0 rounded-[inherit]">
            {layer(false)}
            {layer(true)}
          </span>
        </span>
      </motion.span>
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-pill outline-offset-2 outline-ring group-focus-visible:outline-2"
      />
      <span className="relative z-[1] flex items-center">
        <Slot width={20} label="pill icon">{icon}</Slot>
        <span className="px-1">{label}</span>
      </span>
    </button>
  )
}
