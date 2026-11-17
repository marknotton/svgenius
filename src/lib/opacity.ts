// ── Merge overlapping transparency ────────────────────────────────────────────
// Shapes that each carry their own opacity darken where they overlap. Moving the
// opacity onto a shared <g> paints them as one layer, so overlaps disappear.
// Only neighbouring shapes with the same colour and opacity are grouped, so
// paint order never changes.

const SHAPES = new Set(["path", "rect", "circle", "ellipse", "polygon", "polyline", "line", "use", "text"])

function styleProps(el: Element) {
  const map = new Map<string, string>()
  for (const part of (el.getAttribute("style") ?? "").split(";")) {
    const i = part.indexOf(":")
    if (i > 0) map.set(part.slice(0, i).trim().toLowerCase(), part.slice(i + 1).trim())
  }
  return map
}

const prop = (el: Element, name: string, style: Map<string, string>) => style.get(name) ?? el.getAttribute(name)

function removeProp(el: Element, name: string) {
  el.removeAttribute(name)
  const style = el.getAttribute("style")
  if (!style) return
  const next = style.split(";").filter((p) => p.split(":")[0]?.trim().toLowerCase() !== name).join(";").replace(/^;+|;+$/g, "")
  if (next.trim()) el.setAttribute("style", next)
  else el.removeAttribute("style")
}

/** The group-able transparency of a shape, or null */
function transparency(el: Element) {
  if (!SHAPES.has(el.localName)) return null
  const style = styleProps(el)
  const op = Number(prop(el, "opacity", style) ?? 1)
  const fillOp = Number(prop(el, "fill-opacity", style) ?? 1)
  const stroke = prop(el, "stroke", style)
  const hasStroke = !!stroke && stroke !== "none"
  // fill-opacity on a stroked shape can't become a group opacity without fading the stroke
  const useFillOp = fillOp < 1 && !hasStroke
  const total = op * (useFillOp ? fillOp : 1)
  if (!(total < 1) || !Number.isFinite(total)) return null
  const fill = prop(el, "fill", style) ?? ""
  return { total, key: `${fill}|${stroke ?? ""}|${total}`, props: useFillOp ? ["opacity", "fill-opacity"] : ["opacity"] }
}

function mergeChildren(parent: Element, doc: Document): number {
  let groups = 0
  const kids = [...parent.children]
  let i = 0
  while (i < kids.length) {
    const t = transparency(kids[i])
    if (!t) {
      groups += mergeChildren(kids[i], doc)
      i++
      continue
    }
    let j = i + 1
    while (j < kids.length && transparency(kids[j])?.key === t.key) j++
    const run = kids.slice(i, j)
    // A lone shape can't overlap anything else; leave it alone
    if (run.length > 1) {
      const g = doc.createElementNS("http://www.w3.org/2000/svg", "g")
      g.setAttribute("opacity", String(+t.total.toFixed(4)))
      parent.insertBefore(g, run[0])
      for (const el of run) {
        for (const p of t.props) removeProp(el, p)
        g.appendChild(el)
      }
      groups++
    }
    i = j
  }
  return groups
}

export function mergeOpacity(svg: string) {
  if (!/opacity/i.test(svg)) return svg
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml")
  const root = doc.documentElement
  if (root.localName !== "svg" || doc.querySelector("parsererror")) return svg
  if (mergeChildren(root, doc) === 0) return svg
  return new XMLSerializer().serializeToString(root)
}
