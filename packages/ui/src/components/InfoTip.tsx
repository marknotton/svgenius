import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { portalRoot } from "../host"
import { IconInfo } from "../icons"

// ── Info tooltip ──────────────────────────────────────────────────────────────
// Hover to peek, click to pin it open. Esc or a click elsewhere closes it.

export function InfoTip({ children, label = "More info" }: { children: ReactNode, label?: string }) {
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number, top: number } | null>(null)
  const open = hover || pinned

  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const r = btn.current.getBoundingClientRect()
    const w = tip.current?.offsetWidth ?? 280
    const h = tip.current?.offsetHeight ?? 120
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))
    // Below by default, above when there's no room (e.g. in the footer)
    const below = r.bottom + 8
    const fitsBelow = below + h + 8 <= window.innerHeight
    const top = fitsBelow || r.top - h - 8 < 8 ? Math.min(below, window.innerHeight - h - 8) : r.top - h - 8
    setPos({ left, top: Math.max(8, top) })
  }, [open])

  useEffect(() => {
    if (!pinned) return
    const close = (e: Event) => {
      if (!btn.current?.contains(e.target as Node) && !tip.current?.contains(e.target as Node)) setPinned(false)
    }
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setPinned(false) }
    window.addEventListener("mousedown", close)
    window.addEventListener("keydown", key)
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", key) }
  }, [pinned])

  return (
    <>
      <button ref={btn} type="button" className={`infotip__btn${pinned ? " is-pinned" : ""}`} aria-label={label} aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPinned((p) => !p) }}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <IconInfo />
      </button>
      {open && createPortal(
        <div ref={tip} className="infotip" role="tooltip" style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}>
          {children}
        </div>,
        portalRoot()
      )}
    </>
  )
}
