// ── Shared paper.js plumbing for the geometry (Beta) features ─────────────────

export type Paper = typeof import("paper/dist/paper-core")

let paperReady: Promise<Paper> | null = null
export function loadPaper() {
  paperReady ??= import("paper/dist/paper-core").then((m) => {
    // CommonJS build: Vite hands it over as the default export
    const paper = ((m as unknown as { default?: Paper }).default ?? m) as Paper
    paper.setup(new paper.Size(1, 1))
    return paper
  })
  return paperReady
}

export const SVG_NS = "http://www.w3.org/2000/svg"
export const SHAPES = new Set(["path", "rect", "circle", "ellipse", "polygon", "polyline", "line"])
/** Attributes that describe a shape's outline, dropped when it's rewritten as a path */
export const GEOMETRY = ["d", "x", "y", "width", "height", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "points", "transform", "pathLength"]
const PAINT = ["fill", "fill-opacity", "opacity", "fill-rule", "stroke", "class", "style", "transform"]
/** Containers whose children aren't painted where they sit */
export const NOT_RENDERED = new Set([
  "defs", "clipPath", "mask", "pattern", "symbol", "marker", "linearGradient", "radialGradient",
  "filter", "style", "title", "desc", "metadata", "script", "foreignObject"
])

export const isUrl = (v: string | undefined) => !!v && v.startsWith("url(")
/** WebKit reports shorthands like mask as "" rather than "none", so check loosely */
export const isSet = (v: string | undefined) => !!v && v !== "none" && v !== "normal"

export function hasEffects(el: Element, cs: CSSStyleDeclaration) {
  if (el.getAttribute("filter") || el.getAttribute("mask") || el.getAttribute("clip-path")) return true
  return isSet(cs.filter) || isSet(cs.maskImage) || isSet(cs.getPropertyValue("-webkit-mask-image")) || isSet(cs.clipPath)
}

/** The element's own transform attribute as a paper matrix */
export function ownMatrix(paper: Paper, el: Element) {
  const list = (el as SVGGraphicsElement).transform?.baseVal
  const m = list && list.numberOfItems ? list.consolidate()?.matrix : null
  return m ? new paper.Matrix(m.a, m.b, m.c, m.d, m.e, m.f) : new paper.Matrix()
}

export function fmtMatrix(m: paper.Matrix, precision: number) {
  const f = (n: number) => String(Number(n.toFixed(precision)))
  return `matrix(${[m.a, m.b, m.c, m.d, m.tx, m.ty].map(f).join(" ")})`
}

/** A shape's outline in its own coordinates (its transform attribute ignored) */
export function outlineOf(paper: Paper, el: Element, closeAll = false) {
  const clone = el.cloneNode(true) as Element
  for (const a of PAINT) clone.removeAttribute(a)
  // A lone rx or ry rounds both ways, which paper.js doesn't know
  if (el.localName === "rect") {
    const rx = clone.getAttribute("rx"), ry = clone.getAttribute("ry")
    if (rx && !ry) clone.setAttribute("ry", rx)
    if (ry && !rx) clone.setAttribute("rx", ry)
  }
  const wrapper = `<svg xmlns="${SVG_NS}">${new XMLSerializer().serializeToString(clone)}</svg>`
  let imported: paper.Item
  try {
    imported = paper.project.importSVG(wrapper, { insert: false, expandShapes: true }) as paper.Item
  } catch {
    return null
  }
  const found = imported.getItems({ class: paper.PathItem }) as paper.PathItem[]
  const path = found.find((p) => !p.parent || !(p.parent instanceof paper.CompoundPath))
  if (!path) return null
  const clean = path.clone({ insert: false }) as paper.PathItem
  if (closeAll) {
    const parts = clean instanceof paper.CompoundPath ? (clean.children as paper.Path[]) : [clean as paper.Path]
    for (const p of parts) p.closed = true
  }
  if (getComputedStyle(el).fillRule === "evenodd") clean.fillRule = "evenodd"
  return clean
}

/** Resolves overlaps and even-odd holes into a clean region */
export function solid(item: paper.PathItem) {
  return item.unite(item, { insert: false }) as paper.PathItem
}

export function pathData(item: paper.PathItem, precision: number) {
  const out = (item as paper.PathItem & { exportSVG: (o: object) => SVGElement }).exportSVG({ asString: false, precision }) as SVGElement
  return out.getAttribute("d") ?? ""
}

/** Swaps an element for a <path>, keeping its paint and other attributes */
export function replaceWithPath(el: Element, d: string, evenOdd = false) {
  const out = document.createElementNS(SVG_NS, "path")
  for (const attr of [...el.attributes]) {
    if (!GEOMETRY.includes(attr.name)) out.setAttribute(attr.name, attr.value)
  }
  out.setAttribute("d", d)
  if (evenOdd) out.setAttribute("fill-rule", "evenodd")
  el.replaceWith(out)
  return out
}

/** Runs fn on the SVG while it's in a live document, so computed styles and bboxes work */
export async function withLiveSvg(svg: string, fn: (paper: Paper, root: SVGSVGElement) => number) {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml")
  if (doc.documentElement.localName !== "svg" || doc.querySelector("parsererror")) return svg
  const paper = await loadPaper()
  const host = document.createElement("div")
  host.style.cssText = "position:fixed;left:-99999px;top:0;width:0;height:0;overflow:hidden;visibility:hidden"
  const root = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement
  host.appendChild(root)
  document.body.appendChild(host)
  try {
    const changed = fn(paper, root)
    return changed ? new XMLSerializer().serializeToString(root) : svg
  } finally {
    host.remove()
    paper.project.clear()
  }
}
