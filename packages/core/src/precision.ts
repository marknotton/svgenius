import { optimiseSvg } from "./optimiser"
import { getAttr, parseLength, parseViewBox, rootTag, type ViewBox } from "./svgRoot"
import { renderPixels } from "./trim"
import type { PrecisionTolerance, RunSpec } from "./types"

// ── Auto precision ────────────────────────────────────────────────────────────
// One global precision is a blunt tool: plenty for one icon wrecks another.
// This tries each file at fewer and fewer decimal places, renders every
// attempt and compares it with the full-precision result. It keeps the
// lowest precision that still looks the same, so every file gets its own.

const LEVELS: Record<PrecisionTolerance, { px: number, diff: number, share: number }> = {
  // Render size, how far a pixel may drift (0–255) and how many may (fraction)
  strict: { px: 512, diff: 64, share: 0 },
  balanced: { px: 256, diff: 112, share: 0.0005 },
  loose: { px: 128, diff: 140, share: 0.002 }
}

function viewBoxOf(svg: string): ViewBox | null {
  const tag = rootTag(svg)
  if (!tag) return null
  const w = parseLength(getAttr(tag, "width")), h = parseLength(getAttr(tag, "height"))
  return parseViewBox(getAttr(tag, "viewBox")) ?? (w && h ? { x: 0, y: 0, w, h } : null)
}

/** Share of pixels that differ by more than `diff` in any channel */
function difference(a: Uint8ClampedArray, b: Uint8ClampedArray, diff: number) {
  let off = 0
  for (let i = 0; i < a.length; i += 4) {
    // Premultiplied, so colour changes under transparent pixels don't count
    const aa = a[i + 3], ba = b[i + 3]
    if (Math.abs(aa - ba) > diff
      || Math.abs(a[i] * aa - b[i] * ba) / 255 > diff
      || Math.abs(a[i + 1] * aa - b[i + 1] * ba) / 255 > diff
      || Math.abs(a[i + 2] * aa - b[i + 2] * ba) / 255 > diff) off++
  }
  return off / (a.length / 4)
}

/**
 * Optimises at the spec's precision, then steps down while the render still
 * matches. Returns SVGO's output at the chosen precision.
 */
export async function optimiseAutoPrecision(source: string, spec: RunSpec) {
  const max = spec.svgo.floatPrecision
  const level = LEVELS[spec.svgo.autoTolerance]
  const at = (p: number) => optimiseSvg(source, { ...spec, svgo: { ...spec.svgo, floatPrecision: p } })

  const best = await at(max)
  let chosen = { ...best, precision: max }
  const vb = viewBoxOf(best.data)
  if (!vb || max === 0) return chosen
  const reference = await renderPixels(best.data, vb, level.px)

  for (let p = max - 1; p >= 0; p--) {
    const attempt = await at(p)
    if (attempt.data === chosen.data) { chosen = { ...attempt, precision: p }; continue }
    const shot = await renderPixels(attempt.data, vb, level.px).catch(() => null)
    if (!shot || shot.data.length !== reference.data.length) break
    if (difference(reference.data, shot.data, level.diff) > level.share) break
    // Only worth keeping if it's actually smaller
    if (attempt.data.length <= chosen.data.length) chosen = { ...attempt, precision: p }
  }
  return chosen
}
