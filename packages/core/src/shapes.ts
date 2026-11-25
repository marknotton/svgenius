// ── Guide shapes ──────────────────────────────────────────────────────────────
// The outlines used by the shape guide, the preview clip and the design
// principle overlays. Every path is drawn in a 100 × 100 box, centred, filling
// the box's shorter side, so it scales to any canvas.

export type GuideShape = "circle" | "squircle" | "roundedSquare" | "roundedTriangle" | "roundedHexagon"

export const GUIDE_SHAPES: Array<{ value: GuideShape, label: string, title: string }> = [
  { value: "circle", label: "Circle", title: "Avatars and round badges" },
  { value: "squircle", label: "Squircle", title: "A superellipse, like app icons on iOS and Android" },
  { value: "roundedSquare", label: "Rounded square", title: "A square with rounded corners" },
  { value: "roundedTriangle", label: "Rounded triangle", title: "An upward triangle with rounded corners" },
  { value: "roundedHexagon", label: "Rounded hexagon", title: "A pointy-topped hexagon with rounded corners" }
]

export const isGuideShape = (v: unknown): v is GuideShape => GUIDE_SHAPES.some((s) => s.value === v)

const f = (n: number) => String(Math.round(n * 1000) / 1000)

type Pt = [number, number]

/** Where each corner's arc sits: its centre and radius (clamped so corners never overlap) */
function corners(points: Pt[], r: number) {
  const n = points.length
  return points.map((p, i) => {
    const prev = points[(i - 1 + n) % n], next = points[(i + 1) % n]
    const v1: Pt = [prev[0] - p[0], prev[1] - p[1]], v2: Pt = [next[0] - p[0], next[1] - p[1]]
    const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2)
    const angle = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2))))
    // How far along each edge the curve starts, never past half the edge
    const t = Math.min(r / Math.tan(angle / 2), l1 / 2, l2 / 2)
    const rr = t * Math.tan(angle / 2)
    const a: Pt = [p[0] + (v1[0] / l1) * t, p[1] + (v1[1] / l1) * t]
    const b: Pt = [p[0] + (v2[0] / l2) * t, p[1] + (v2[1] / l2) * t]
    // The arc's centre lies along the bisector, rr / sin(angle / 2) in from the corner
    const bx = v1[0] / l1 + v2[0] / l2, by = v1[1] / l1 + v2[1] / l2, bl = Math.hypot(bx, by) || 1
    const k = rr / Math.sin(angle / 2)
    const c: Pt = [p[0] + (bx / bl) * k, p[1] + (by / bl) * k]
    const sweep = v1[0] * v2[1] - v1[1] * v2[0] < 0 ? 1 : 0
    return { a, b, c, rr, sweep }
  })
}

/** A polygon with every corner rounded to radius r */
export function roundedPolygon(points: Pt[], r: number) {
  return corners(points, r).map(({ a, b, rr, sweep }, i) =>
    `${i === 0 ? "M" : "L"}${f(a[0])} ${f(a[1])}A${f(rr)} ${f(rr)} 0 0 ${sweep} ${f(b[0])} ${f(b[1])}`).join("") + "Z"
}

/**
 * A rounded polygon scaled and centred so its real outline (after rounding,
 * which pulls sharp corners in) fills a square of side s around (cx, cy).
 * Without this a rounded triangle sits visibly low
 */
function fittedRoundedPolygon(points: Pt[], r: number, cx: number, cy: number, s: number) {
  const cs = corners(points, r)
  // Each corner's extreme is its arc centre ± its radius; straight edges never go further out
  const x0 = Math.min(...cs.map((c) => c.c[0] - c.rr)), x1 = Math.max(...cs.map((c) => c.c[0] + c.rr))
  const y0 = Math.min(...cs.map((c) => c.c[1] - c.rr)), y1 = Math.max(...cs.map((c) => c.c[1] + c.rr))
  const k = Math.min(s / (x1 - x0), s / (y1 - y0))
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2
  return roundedPolygon(points.map(([x, y]) => [cx + (x - mx) * k, cy + (y - my) * k]), r * k)
}

/** |x|^n + |y|^n = 1, sampled finely enough to look smooth at any size */
function superellipse(cx: number, cy: number, r: number, n = 5, steps = 96) {
  let d = ""
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2
    const c = Math.cos(t), s = Math.sin(t)
    const x = cx + r * Math.sign(c) * Math.abs(c) ** (2 / n)
    const y = cy + r * Math.sign(s) * Math.abs(s) ** (2 / n)
    d += `${i === 0 ? "M" : "L"}${f(x)} ${f(y)}`
  }
  return `${d}Z`
}

/** Path data for a shape in a box (default 0 0 100 100), centred and fitted to its shorter side */
export function shapePath(shape: GuideShape, box = { x: 0, y: 0, w: 100, h: 100 }) {
  const s = Math.min(box.w, box.h)
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2
  const r = s / 2
  switch (shape) {
    case "squircle": return superellipse(cx, cy, r)
    case "roundedSquare": {
      const x = cx - r, y = cy - r, k = s * 0.2
      return `M${f(x + k)} ${f(y)}H${f(x + s - k)}A${f(k)} ${f(k)} 0 0 1 ${f(x + s)} ${f(y + k)}V${f(y + s - k)}A${f(k)} ${f(k)} 0 0 1 ${f(x + s - k)} ${f(y + s)}H${f(x + k)}A${f(k)} ${f(k)} 0 0 1 ${f(x)} ${f(y + s - k)}V${f(y + k)}A${f(k)} ${f(k)} 0 0 1 ${f(x + k)} ${f(y)}Z`
    }
    case "roundedTriangle": {
      // Equilateral, as wide as the box, centred on its bounding box
      const h = (s * Math.sqrt(3)) / 2
      return fittedRoundedPolygon([[cx, cy - h / 2], [cx + r, cy + h / 2], [cx - r, cy + h / 2]], s * 0.1, cx, cy, s)
    }
    case "roundedHexagon": {
      const pts: Pt[] = Array.from({ length: 6 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 3
        return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
      })
      return fittedRoundedPolygon(pts, s * 0.08, cx, cy, s)
    }
    default:
      return `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}Z`
  }
}

/** A black-on-transparent SVG of the shape, as a data URL, for CSS masks */
export function shapeMaskUrl(shape: GuideShape) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${shapePath(shape)}"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
