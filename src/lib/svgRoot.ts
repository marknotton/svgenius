// ── Root <svg> tag helpers ────────────────────────────────────────────────────
// String-level, so SVGO's output formatting is left exactly as it is.

const ROOT = /<svg\b[^>]*>/i

export function rootTag(svg: string) {
  return svg.match(ROOT)?.[0] ?? null
}

export function getAttr(tag: string, name: string) {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"))
  return m ? (m[2] ?? m[3] ?? "") : null
}

export function setAttr(tag: string, name: string, value: string) {
  const re = new RegExp(`(\\s${name}\\s*=\\s*)("[^"]*"|'[^']*')`, "i")
  if (re.test(tag)) return tag.replace(re, `$1"${value}"`)
  return tag.replace(/^<svg\b/i, `<svg ${name}="${value}"`)
}

export function replaceRoot(svg: string, tag: string) {
  return svg.replace(ROOT, tag)
}

/** Plain numbers or px only, anything relative (%, em) returns null */
export function parseLength(v: string | null) {
  if (v === null) return null
  const m = v.trim().match(/^(-?[\d.]+(?:e-?\d+)?)(px)?$/i)
  return m ? Number(m[1]) : null
}

export interface ViewBox { x: number, y: number, w: number, h: number }

export function parseViewBox(v: string | null): ViewBox | null {
  if (!v) return null
  const n = v.trim().split(/[\s,]+/).map(Number)
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x)) || n[2] <= 0 || n[3] <= 0) return null
  return { x: n[0], y: n[1], w: n[2], h: n[3] }
}

/** Display size: width/height if set, otherwise the viewBox */
export function svgSize(svg: string | undefined) {
  if (!svg) return null
  const tag = rootTag(svg)
  if (!tag) return null
  const vb = parseViewBox(getAttr(tag, "viewBox"))
  let w = parseLength(getAttr(tag, "width"))
  let h = parseLength(getAttr(tag, "height"))
  if (vb) {
    if (w === null && h === null) { w = vb.w; h = vb.h }
    else if (w === null && h !== null) w = (h * vb.w) / vb.h
    else if (h === null && w !== null) h = (w * vb.h) / vb.w
  }
  return w !== null && h !== null ? { w, h } : null
}

export const fmtNum = (n: number, precision = 3) => {
  const s = n.toFixed(precision)
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s
}
