// ── Flatten transforms ────────────────────────────────────────────────────────
// Bakes transform attributes (on shapes and on the groups around them) into the
// path data, so the markup has no translate/rotate/matrix left to carry.
//
// Left alone, with their transform kept: text, images, <use>, anything with a
// clip-path, mask, filter or gradient/pattern paint, and stroked shapes under a
// stretch or skew (their stroke would change shape).

import {
  NOT_RENDERED, SHAPES, fmtMatrix, hasEffects, isUrl, outlineOf, ownMatrix, pathData, replaceWithPath, withLiveSvg,
  type Paper
} from "./paperKit"

const GROUPS = new Set(["g", "a"])

function isStroked(cs: CSSStyleDeclaration) {
  return isSetPaint(cs.stroke) && parseFloat(cs.strokeWidth) > 0
}
const isSetPaint = (v: string) => !!v && v !== "none"

/** Uniform scale + rotation (+ translation) only */
function isSimilarity(m: paper.Matrix) {
  const sx = m.a * m.a + m.b * m.b
  const sy = m.c * m.c + m.d * m.d
  return Math.abs(sx - sy) < 1e-6 * Math.max(sx, sy, 1) && Math.abs(m.a * m.c + m.b * m.d) < 1e-6 * Math.max(sx, 1)
}

/** Whether a group's transform can be pushed down into its children */
function groupMovable(el: Element) {
  const cs = getComputedStyle(el)
  return !hasEffects(el, cs)
}

function setTransform(el: Element, m: paper.Matrix, precision: number) {
  if (m.isIdentity()) el.removeAttribute("transform")
  else el.setAttribute("transform", fmtMatrix(m, precision))
}

function flattenIn(paper: Paper, parent: Element, m: paper.Matrix, precision: number): number {
  let changed = 0
  for (const el of [...parent.children]) {
    if (NOT_RENDERED.has(el.localName)) continue
    const had = el.hasAttribute("transform")
    const total = m.clone().append(ownMatrix(paper, el))

    if (GROUPS.has(el.localName)) {
      if (groupMovable(el)) {
        if (had) { el.removeAttribute("transform"); changed++ }
        changed += flattenIn(paper, el, total, precision)
      } else {
        if (!m.isIdentity()) { setTransform(el, total, precision); changed++ }
        changed += flattenIn(paper, el, new paper.Matrix(), precision)
      }
      continue
    }

    if (total.isIdentity()) {
      if (had) { el.removeAttribute("transform"); changed++ }
      continue
    }

    const cs = getComputedStyle(el)
    const stroked = isStroked(cs)
    const bakeable = SHAPES.has(el.localName) && !hasEffects(el, cs) && !isUrl(cs.fill) && !isUrl(cs.stroke) &&
      (!stroked || isSimilarity(total))
    const outline = bakeable ? outlineOf(paper, el) : null
    if (!outline) {
      // Can't bake it: give it the combined transform instead
      if (!m.isIdentity() || had) { setTransform(el, total, precision); changed++ }
      continue
    }
    const strokeW = parseFloat(cs.strokeWidth)
    outline.transform(total)
    const out = replaceWithPath(el, pathData(outline, precision), outline.fillRule === "evenodd")
    if (stroked) {
      const k = Math.sqrt(Math.abs(total.a * total.d - total.b * total.c))
      const w = String(Number((strokeW * k).toFixed(precision)))
      if (out.getAttribute("class") || out.getAttribute("style")) (out as SVGElement).style.strokeWidth = w
      else out.setAttribute("stroke-width", w)
    }
    changed++
  }
  return changed
}

export async function flattenTransforms(svg: string, precision: number) {
  if (!svg.includes("transform")) return svg
  return withLiveSvg(svg, (paper, root) => flattenIn(paper, root, new paper.Matrix(), Math.max(precision, 2)))
}
