import { useRef, type PointerEvent } from "react"
import { SIDEBAR } from "@svgenius/core/settings"

// ── Draggable sidebar divider ─────────────────────────────────────────────────

const MIN_MAIN = 600

export function clampSidebar(w: number) {
  const max = Math.min(SIDEBAR.max, window.innerWidth - MIN_MAIN)
  return Math.round(Math.max(SIDEBAR.min, Math.min(max, w)))
}

/** Phone-sized: the sidebar is a drawer along the bottom */
export const DRAWER = { min: 52, default: 0.38 }
export function clampDrawer(h: number) {
  return Math.round(Math.max(DRAWER.min, Math.min(window.innerHeight - 140, h)))
}

interface Props {
  width: number
  onResize: (w: number) => void
  onReset: () => void
  /** Drawer mode: drag up and down, the size is a height */
  horizontal?: boolean
}

export function Divider({ width, onResize, onReset, horizontal }: Props) {
  const start = useRef<{ x: number, w: number } | null>(null)

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: horizontal ? e.clientY : e.clientX, w: width }
    document.body.classList.add("is-resizing")
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    if (horizontal) onResize(clampDrawer(start.current.w + (start.current.x - e.clientY)))
    else onResize(clampSidebar(start.current.w + (start.current.x - e.clientX)))
  }
  const up = () => {
    start.current = null
    document.body.classList.remove("is-resizing")
  }

  return (
    <div
      className={`divider${horizontal ? " divider--drawer" : ""}`}
      role="separator"
      aria-orientation={horizontal ? "horizontal" : "vertical"}
      aria-valuenow={width}
      aria-valuemin={horizontal ? DRAWER.min : SIDEBAR.min}
      aria-valuemax={horizontal ? undefined : SIDEBAR.max}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (horizontal) {
          if (e.key === "ArrowUp") onResize(clampDrawer(width + 20))
          if (e.key === "ArrowDown") onResize(clampDrawer(width - 20))
          return
        }
        if (e.key === "ArrowLeft") onResize(clampSidebar(width + 20))
        if (e.key === "ArrowRight") onResize(clampSidebar(width - 20))
      }}
    >{horizontal && <span className="divider__grip" />}</div>
  )
}
