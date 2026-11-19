import { useRef } from "react"

// ── Edge resizer ──────────────────────────────────────────────────────────────
// A thin grab strip on the left or top edge of a panel. Dragging away from the
// panel makes it bigger. Double-click puts it back to its default size.

interface Props {
  edge: "left" | "top"
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  onReset?: () => void
  label: string
}

export function Resizer({ edge, value, min, max, onChange, onReset, label }: Props) {
  const start = useRef<{ at: number, value: number } | null>(null)
  const clamp = (v: number) => Math.round(Math.max(min, Math.min(max, v)))
  const pos = (e: React.PointerEvent) => (edge === "left" ? e.clientX : e.clientY)
  return (
    <div
      className={`resizer resizer--${edge}`}
      role="separator"
      aria-orientation={edge === "left" ? "vertical" : "horizontal"}
      aria-label={label}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0 && e.pointerType === "mouse") return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { at: pos(e), value }
        document.body.classList.add(edge === "left" ? "is-resizing-x" : "is-resizing-y")
      }}
      onPointerMove={(e) => {
        if (!start.current) return
        onChange(clamp(start.current.value + start.current.at - pos(e)))
      }}
      onPointerUp={() => { start.current = null; document.body.classList.remove("is-resizing-x", "is-resizing-y") }}
      onPointerCancel={() => { start.current = null; document.body.classList.remove("is-resizing-x", "is-resizing-y") }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const grow = edge === "left" ? "ArrowLeft" : "ArrowUp"
        const shrink = edge === "left" ? "ArrowRight" : "ArrowDown"
        if (e.key === grow) { e.preventDefault(); e.stopPropagation(); onChange(clamp(value + 20)) }
        if (e.key === shrink) { e.preventDefault(); e.stopPropagation(); onChange(clamp(value - 20)) }
      }}
    />
  )
}
