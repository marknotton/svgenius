import { memo } from "react"
import type { DesignPrinciple } from "@marknotton/svgenius-core/types"
import { alignmentPath, alignmentStyle, lineStyle } from "@marknotton/svgenius-core/designPrinciples"

// ── Design principle guides ───────────────────────────────────────────────────
// The grid, live area, keylines and centre lines, drawn over a canvas in the
// principle's own units and fitted like the SVG (centred, shorter side).

type Guides = Pick<DesignPrinciple, "width" | "height" | "padding" | "keylines" | "radius" | "alignmentKeylines">

/** A grid step that gives roughly 24 cells, rounded to 1, 2 or 5 × a power of ten */
export function gridStep(size: number) {
  if (size <= 64) return 1
  const raw = size / 24
  const p = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? raw
}

/** Alignment keylines are reference only, drawn fainter than the keylines (a list can hide them with CSS) */
export const GridGuides = memo(function GridGuides({ dp, grid = true, keylines = true, alignment = true }: { dp: Guides, grid?: boolean, keylines?: boolean, alignment?: boolean }) {
  const W = dp.width, H = dp.height, p = dp.padding
  const step = gridStep(Math.max(W, H))
  const lines: string[] = []
  if (grid) {
    for (let x = step; x < W - 1e-9; x += step) lines.push(`M${x} 0V${H}`)
    for (let y = step; y < H - 1e-9; y += step) lines.push(`M0 ${y}H${W}`)
  }
  return (
    <svg className="grid-guides" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {grid && <path className="grid-guides__grid" d={lines.join("")} vectorEffect="non-scaling-stroke" />}
      <rect className="grid-guides__canvas" x={0} y={0} width={W} height={H} vectorEffect="non-scaling-stroke" />
      {p > 0 && <rect className="grid-guides__live" x={p} y={p} width={Math.max(0, W - p * 2)} height={Math.max(0, H - p * 2)} vectorEffect="non-scaling-stroke" />}
      {alignment && (dp.alignmentKeylines ?? []).filter((a) => a.enabled).map((a) => (
        <path key={a.id} className="grid-guides__align" d={alignmentPath(a, dp)} style={alignmentStyle(a)} vectorEffect="non-scaling-stroke" />
      ))}
      {keylines && dp.keylines.map((k) => k.kind === "circle"
        ? <ellipse key={k.id} className="grid-guides__key" cx={W / 2} cy={H / 2} rx={k.w / 2} ry={k.h / 2} style={lineStyle(k, "keyline")} vectorEffect="non-scaling-stroke" />
        : <rect key={k.id} className="grid-guides__key" style={lineStyle(k, "keyline")} x={(W - k.w) / 2} y={(H - k.h) / 2} width={k.w} height={k.h}
          rx={Math.min(dp.radius, k.w / 2, k.h / 2)} vectorEffect="non-scaling-stroke" />)}
      <path className="grid-guides__centre" d={`M${W / 2} 0V${H}M0 ${H / 2}H${W}`} vectorEffect="non-scaling-stroke" />
    </svg>
  )
})
