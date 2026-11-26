import { createContext, memo, useContext, useMemo } from "react"
import { GUIDE_SHAPES, shapePath, type GuideShape, type ShapeFrame } from "@marknotton/svgenius-core/shapes"

// ── Shape guide ───────────────────────────────────────────────────────────────
// Drawn over a preview's canvas: the shape (circle, squircle and so on) fitted
// to the canvas's shorter side, with everything outside it tinted. Hidden
// unless an ancestor has .show-circle (the app-wide guide toggle) or the
// guide is forced on.

/** The shape every guide and clip uses. Hosts that don't provide one get a circle */
export const GuideShapeContext = createContext<GuideShape>("circle")
export const useGuideShape = () => useContext(GuideShapeContext)

/** With a frame (a design principle), the shape sits in its live area rather than filling the canvas */
export const ShapeGuide = memo(function ShapeGuide({ shape, forced, frame }: { shape?: GuideShape, forced?: boolean, frame?: ShapeFrame | null }) {
  const ctx = useGuideShape()
  const d = useMemo(() => shapePath(shape ?? ctx, frame?.box, frame?.fitHeight), [shape, ctx, frame])
  return (
    <svg className={`shape-guide${forced ? " is-forced" : ""}`} viewBox={frame ? `0 0 ${frame.w} ${frame.h}` : "0 0 100 100"} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path className="shape-guide__tint" fillRule="evenodd" d={`${tintRect(frame)}${d}`} />
      <path className="shape-guide__line" d={d} vectorEffect="non-scaling-stroke" />
    </svg>
  )
})

/**
 * The tint around the shape: a few canvases wide, never thousands. Huge
 * coordinates in a small viewBox (24 units) can stop WebKit drawing the path
 */
function tintRect(frame?: ShapeFrame | null) {
  const w = frame?.w ?? 100, h = frame?.h ?? 100
  return `M${-w * 20} ${-h * 20}H${w * 21}V${h * 21}H${-w * 20}Z`
}

/** A small icon of a shape, for buttons and menus */
export function ShapeIcon({ shape, size = 13, dashed }: { shape?: GuideShape, size?: number, dashed?: boolean }) {
  const ctx = useGuideShape()
  const d = useMemo(() => shapePath(shape ?? ctx, { x: 10, y: 10, w: 80, h: 80 }), [shape, ctx])
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth={11} strokeLinejoin="round" aria-hidden="true">
      <path d={d} strokeDasharray={dashed ? "16 12" : undefined} />
    </svg>
  )
}

/** Shape options for a <select> */
export function ShapeOptions() {
  return <>{GUIDE_SHAPES.map((s) => <option key={s.value} value={s.value} title={s.title}>{s.label}</option>)}</>
}
