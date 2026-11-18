// ── Merge overlapping paths ───────────────────────────────────────────────────
// Shapes with the same fill and opacity are joined into one path with a real
// boolean union (paper.js), so translucent overlaps no longer darken and the
// markup gets smaller. Styles are read with getComputedStyle, so fills and
// opacities set by classes in a <style> block count too.
//
// Paint order is kept: a shape only joins an earlier one when nothing painted
// between them overlaps it.

type Paper = typeof import("paper/dist/paper-core")

let paperReady: Promise<Paper> | null = null
function loadPaper() {
  paperReady ??= import("paper/dist/paper-core").then((m) => {
    // CommonJS build: Vite hands it over as the default export
    const paper = ((m as unknown as { default?: Paper }).default ?? m) as Paper
    paper.setup(new paper.Size(1, 1))
    return paper
  })
  return paperReady
}

const SVG_NS = "http://www.w3.org/2000/svg"
const SHAPES = new Set(["path", "rect", "circle", "ellipse", "polygon", "polyline"])
const GEOMETRY = ["d", "x", "y", "width", "height", "cx", "cy", "r", "rx", "ry", "points", "transform", "pathLength"]
const PAINT = ["fill", "fill-opacity", "opacity", "fill-rule", "stroke", "class", "style"]

interface Shape {
  el: Element
  key: string | null
  item: paper.PathItem | null
}

/** What decides whether two shapes can become one, or null if this one can't merge */
function mergeKey(el: Element, cs: CSSStyleDeclaration) {
  if (!SHAPES.has(el.localName)) return null
  const stroke = cs.stroke
  const strokeW = parseFloat(cs.strokeWidth)
  if (stroke && stroke !== "none" && strokeW > 0 && Number(cs.strokeOpacity) > 0) return null
  if (cs.fill === "none" || cs.fill.startsWith("url(")) return null
  if (el.getAttribute("filter") || el.getAttribute("mask") || el.getAttribute("clip-path") || el.id) return null
  if (cs.filter !== "none" || cs.mask !== "none" || cs.clipPath !== "none") return null
  return `${cs.fill}|${cs.fillOpacity}|${cs.opacity}`
}

function toItem(paper: Paper, el: Element) {
  const clone = el.cloneNode(true) as Element
  for (const a of PAINT) clone.removeAttribute(a)
  const wrapper = `<svg xmlns="${SVG_NS}">${new XMLSerializer().serializeToString(clone)}</svg>`
  const imported = paper.project.importSVG(wrapper, { insert: false, expandShapes: true }) as paper.Item
  const found = imported.getItems({ class: paper.PathItem }) as paper.PathItem[]
  const path = found.find((p) => !p.parent || !(p.parent instanceof paper.CompoundPath))
  if (!path) return null
  const clean = path.clone({ insert: false }) as paper.PathItem
  if (el.getAttribute("fill-rule") === "evenodd" || getComputedStyle(el).fillRule === "evenodd") clean.fillRule = "evenodd"
  // Resolve even-odd holes so the union treats them correctly
  return clean.fillRule === "evenodd" ? (clean.unite(clean, { insert: false }) as paper.PathItem) : clean
}

function mergeIn(paper: Paper, parent: Element, precision: number): number {
  let merged = 0
  const kids = [...parent.children]
  const shapes: Shape[] = kids.map((el) => {
    const key = mergeKey(el, getComputedStyle(el))
    return { el, key, item: null }
  })
  // Recurse into groups first
  for (const s of shapes) if (!s.key && s.el.children.length) merged += mergeIn(paper, s.el, precision)

  const used = new Set<number>()
  for (let i = 0; i < shapes.length; i++) {
    const a = shapes[i]
    if (!a.key || used.has(i)) continue
    a.item ??= toItem(paper, a.el)
    if (!a.item) continue
    const run = [i]
    let union = a.item
    for (let j = i + 1; j < shapes.length; j++) {
      const b = shapes[j]
      if (used.has(j) || b.key !== a.key) continue
      b.item ??= toItem(paper, b.el)
      if (!b.item) continue
      // Anything painted between the two that overlaps b would end up under it
      const blocked = shapes.slice(i + 1, j).some((m, k) => {
        if (run.includes(i + 1 + k) || used.has(i + 1 + k)) return false
        const box = boundsOf(m.el)
        return !box || box.intersects(b.item!.bounds.expand(0.5))
      })
      if (blocked) continue
      union = union.unite(b.item, { insert: false }) as paper.PathItem
      run.push(j)
    }
    if (run.length < 2) continue
    run.forEach((k) => used.add(k))

    const out = document.createElementNS(SVG_NS, "path")
    for (const attr of [...a.el.attributes]) {
      if (!GEOMETRY.includes(attr.name)) out.setAttribute(attr.name, attr.value)
    }
    const d = (union as paper.PathItem & { exportSVG: (o: object) => SVGElement })
      .exportSVG({ asString: false, precision }) as SVGElement
    out.setAttribute("d", d.getAttribute("d") ?? "")
    if (union.fillRule === "evenodd") out.setAttribute("fill-rule", "evenodd")
    parent.insertBefore(out, a.el)
    for (const k of run) shapes[k].el.remove()
    merged += run.length - 1
  }
  return merged

  function boundsOf(el: Element) {
    try {
      const b = (el as SVGGraphicsElement).getBBox()
      // Stroke and transforms make getBBox approximate, so pad it generously
      const pad = 2 + parseFloat(getComputedStyle(el).strokeWidth || "0")
      return new paper.Rectangle(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2)
    } catch {
      return null
    }
  }
}

export async function mergeOverlappingPaths(svg: string, precision: number) {
  if (!/<(path|rect|circle|ellipse|polygon|polyline)\b/.test(svg)) return svg
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml")
  if (doc.documentElement.localName !== "svg" || doc.querySelector("parsererror")) return svg
  const paper = await loadPaper()

  // Computed styles and getBBox need the SVG in a live document
  const host = document.createElement("div")
  host.style.cssText = "position:fixed;left:-99999px;top:0;width:0;height:0;overflow:hidden;visibility:hidden"
  const root = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement
  host.appendChild(root)
  document.body.appendChild(host)
  try {
    const n = mergeIn(paper, root, Math.max(precision, 2))
    if (n === 0) return svg
    return new XMLSerializer().serializeToString(root)
  } finally {
    host.remove()
    paper.project.clear()
  }
}
