import type { TagRange } from "./markupMap"
import { tagWithAttrs } from "./markupEdit"
import { strokeOutline } from "./cutOuts"
import { loadPaper, outlineOf, pathData, SHAPES } from "./paperKit"
import { SHAPE_ATTRS } from "./pathData"

// ── Stroke to path ────────────────────────────────────────────────────────────
// Turns a shape's stroke into a filled outline, like "Outline stroke" in a
// design app. A shape that's also filled keeps its fill as it was, with the
// outline drawn over it.

const STROKE_ATTRS = ["stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "vector-effect"]
const FILL_ATTRS = ["fill", "fill-opacity", "fill-rule"]

/** Removes stroke (and optionally fill) declarations from a style attribute */
const cleanStyle = (style: string, drop: string[]) =>
  style.split(";").map((d) => d.trim()).filter((d) => d && !drop.includes(d.split(":")[0].trim().toLowerCase())).join(";")

export interface StrokeResult { markup: string, done: number, skipped: string[] }

export async function outlineStrokes(markup: string, ranges: TagRange[], indices: number[], precision = 3): Promise<StrokeResult> {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml")
  if (doc.documentElement.localName !== "svg" || doc.querySelector("parsererror")) return { markup, done: 0, skipped: ["The markup doesn't parse"] }
  const paper = await loadPaper()
  const host = document.createElement("div")
  host.style.cssText = "position:fixed;left:-99999px;top:0;width:0;height:0;overflow:hidden;visibility:hidden"
  const root = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement
  host.appendChild(root)
  document.body.appendChild(host)
  const all = [root, ...root.querySelectorAll("*")]
  const edits: { r: TagRange, text: string }[] = []
  const skipped: string[] = []
  try {
    for (const i of indices) {
      const el = all[i], r = ranges[i]
      if (!el || !r || !SHAPES.has(el.localName)) continue
      const cs = getComputedStyle(el)
      const width = parseFloat(cs.strokeWidth)
      if (cs.stroke === "none" || !(width > 0)) { skipped.push(`<${el.localName}> has no stroke`); continue }
      if (cs.strokeDasharray && cs.strokeDasharray !== "none") { skipped.push(`<${el.localName}> has a dashed stroke, which can't be outlined yet`); continue }
      const line = outlineOf(paper, el)
      const ring = line && strokeOutline(paper, line, width, cs)
      if (!ring) { skipped.push(`<${el.localName}> has nothing to outline`); continue }
      const d = pathData(ring, precision)
      const tag = markup.slice(r.start, r.tagEnd)
      const colour = el.getAttribute("stroke") ?? cs.stroke
      const opacity = el.getAttribute("stroke-opacity") ?? (Number(cs.strokeOpacity) < 1 ? cs.strokeOpacity : null)
      const styled = el.hasAttribute("class") || el.hasAttribute("style")

      // The outline: same attributes, minus geometry and stroke, filled with the stroke colour
      const drop: Record<string, null> = Object.fromEntries([...(SHAPE_ATTRS[el.localName] ?? []), "d", ...STROKE_ATTRS, ...FILL_ATTRS].map((a) => [a, null]))
      let outline = tagWithAttrs(tag.replace(new RegExp(`^<${el.tagName}`), "<path"), drop)
      const paint: Record<string, string | null> = { d }
      if (styled) {
        // Class or style rules could repaint it, so the paint goes inline where it wins
        const kept = cleanStyle(el.getAttribute("style") ?? "", [...STROKE_ATTRS, ...FILL_ATTRS])
        paint.style = [kept, `fill:${colour}`, opacity ? `fill-opacity:${opacity}` : "", "stroke:none"].filter(Boolean).join(";")
      } else {
        paint.fill = colour
        if (opacity) paint["fill-opacity"] = opacity
      }
      outline = tagWithAttrs(outline, paint)
      if (!outline.endsWith("/>")) outline = outline.replace(/>$/, "/>")

      const filled = cs.fill !== "none" && Number(cs.fillOpacity) > 0
      let text = outline
      if (filled) {
        // Keep the fill underneath, without its stroke, and give the outline its own id
        const strokeOff: Record<string, string | null> = Object.fromEntries(STROKE_ATTRS.map((a) => [a, null]))
        if (el.getAttribute("style")) strokeOff.style = cleanStyle(el.getAttribute("style") ?? "", STROKE_ATTRS) || null
        let base = tagWithAttrs(tag, strokeOff)
        if (getComputedStyle(el).stroke !== "none" && styled) base = tagWithAttrs(base, { stroke: "none" })
        else if (!el.hasAttribute("stroke")) base = tagWithAttrs(base, { stroke: "none" })
        const id = el.getAttribute("id")
        if (id) text = tagWithAttrs(outline, { id: `${id}-stroke` })
        const rest = markup.slice(r.tagEnd, r.end)
        text = `${base}${rest}${text}`
      }
      edits.push({ r, text })
    }
  } finally {
    host.remove()
    paper.project.clear()
  }
  let out = markup
  for (const { r, text } of edits.sort((a, b) => b.r.start - a.r.start)) out = out.slice(0, r.start) + text + out.slice(r.end)
  return { markup: out, done: edits.length, skipped }
}
