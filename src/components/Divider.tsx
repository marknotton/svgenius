import { useRef, type PointerEvent } from "react"
import { SIDEBAR } from "../lib/settings"

// ── Draggable sidebar divider ─────────────────────────────────────────────────

const MIN_MAIN = 600

export function clampSidebar(w: number) {
  const max = Math.min(SIDEBAR.max, window.innerWidth - MIN_MAIN)
  return Math.round(Math.max(SIDEBAR.min, Math.min(max, w)))
}

interface Props {
  width: number
  onResize: (w: number) => void
  onReset: () => void
}

export function Divider({ width, onResize, onReset }: Props) {
  const start = useRef<{ x: number, w: number } | null>(null)

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, w: width }
    document.body.classList.add("is-resizing")
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    onResize(clampSidebar(start.current.w + (start.current.x - e.clientX)))
  }
  const up = () => {
    start.current = null
    document.body.classList.remove("is-resizing")
  }

  return (
    <div
      className="divider"
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR.min}
      aria-valuemax={SIDEBAR.max}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") onResize(clampSidebar(width + 20))
        if (e.key === "ArrowRight") onResize(clampSidebar(width - 20))
      }}
    />
  )
}
