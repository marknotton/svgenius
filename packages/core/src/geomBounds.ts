// ── Exact artwork bounds ──────────────────────────────────────────────────────
// Measures shapes from their real curves (paper.js), so round caps and curved
// edges are never shaved off by pixel rounding. Returns null when the artwork
// has anything that can't be measured this way (text, images, masks, filters),
// and trim falls back to scanning a render.

import { NOT_RENDERED, SHAPES, hasEffects, outlineOf, ownMatrix, withLiveSvg, type Paper } from "./paperKit"
import type { ViewBox } from "./svgRoot"

const GROUPS = new Set(["g", "a", "switch"])

export async function geometryBounds(svg: string): Promise<ViewBox | null> {
  let box: paper.Rectangle | null = null
  let unsupported = false
  await withLiveSvg(svg, (paper: Paper, root) => {
    const add = (r: paper.Rectangle) => { box = box ? box.unite(r) : r }
    const visit = (parent: Element, m: paper.Matrix) => {
      for (const el of [...parent.children]) {
        if (unsupported) return
        if (NOT_RENDERED.has(el.localName)) continue
        const cs = getComputedStyle(el)
        if (cs.display === "none") continue
        if (hasEffects(el, cs)) { unsupported = true; return }
        const total = m.clone().append(ownMatrix(paper, el))
        if (GROUPS.has(el.localName)) {
          if (Number(cs.opacity) > 0) visit(el, total)
          continue
        }
        if (!SHAPES.has(el.localName)) { unsupported = true; return }
        // (visibility is skipped: the measuring host itself is hidden)
        if (Number(cs.opacity) === 0) continue
        const fill = cs.fill !== "none" && Number(cs.fillOpacity) > 0 && el.localName !== "line"
        const stroke = cs.stroke !== "none" && parseFloat(cs.strokeWidth) > 0 && Number(cs.strokeOpacity) > 0
        if (!fill && !stroke) continue
        const shape = outlineOf(paper, el)
        if (!shape) { unsupported = true; return }
        if (stroke) {
          // paper.js works out caps, joins and miters for us
          shape.strokeColor = new paper.Color("black")
          shape.strokeWidth = parseFloat(cs.strokeWidth)
          shape.strokeCap = cs.strokeLinecap as "butt"
          shape.strokeJoin = cs.strokeLinejoin as "miter"
          shape.miterLimit = parseFloat(cs.strokeMiterlimit) || 4
          shape.strokeScaling = true
          // Keep the matrix on the item so the stroke is transformed with it
          shape.applyMatrix = false
          shape.transform(total)
          add(shape.strokeBounds)
        } else {
          shape.transform(total)
          add(shape.bounds)
        }
      }
    }
    visit(root, new paper.Matrix())
    return 0
  })
  if (unsupported || !box) return null
  const b = box as paper.Rectangle
  const ok = [b.x, b.y, b.width, b.height].every(Number.isFinite) && b.width > 0 && b.height > 0
  return ok ? { x: b.x, y: b.y, w: b.width, h: b.height } : null
}
