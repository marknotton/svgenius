import { createContext, memo, useContext, useMemo } from "react"
import { GUIDE_SHAPES, shapePath, type GuideShape } from "@marknotton/svgenius-core/shapes"

// ── Shape guide ───────────────────────────────────────────────────────────────
// Drawn over a preview's canvas: the shape (circle, squircle and so on) fitted
// to the canvas's shorter side, with everything outside it tinted. Hidden
// unless an ancestor has .show-circle (the app-wide guide toggle) or the
// guide is forced on.

/** The shape every guide and clip uses. Hosts that don't provide one get a circle */
export const GuideShapeContext = createContext<GuideShape>("circle")
export const useGuideShape = () => useContext(GuideShapeContext)

export const ShapeGuide = memo(function ShapeGuide({ shape, forced }: { shape?: GuideShape, forced?: boolean }) {
  const ctx = useGuideShape()
  const d = useMemo(() => shapePath(shape ?? ctx), [shape, ctx])
  return (
    <svg className={`shape-guide${forced ? " is-forced" : ""}`} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path className="shape-guide__tint" fillRule="evenodd" d={`M-10000 -10000H10100V10100H-10000Z${d}`} />
      <path className="shape-guide__line" d={d} vectorEffect="non-scaling-stroke" />
    </svg>
  )
})

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
