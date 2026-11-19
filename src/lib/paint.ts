import { elementRanges, type TagRange } from "./markupMap"
import { setAttrs } from "./markupEdit"

// ── Fill, stroke and gradients for the editor's style tools ───────────────────
// Reads what an element has (attribute or inline style) and writes changes as
// attributes, taking the same property out of any style="" so it can't
// override them. Gradients go in <defs> and are reused when edited again.

export type Cap = "butt" | "round" | "square"
export type Join = "miter" | "round" | "bevel"

export interface Gradient {
  type: "linear" | "radial"
  stops: [string, string]
  /** Linear only, degrees: 0 runs left to right, 90 top to bottom */
  angle: number
}

export interface Paint {
  fill: string | null
  stroke: string | null
  strokeWidth: string | null
  cap: string | null
  join: string | null
  /** The fill's gradient, when it's one we can edit */
  gradient: Gradient | null
  gradientId: string | null
}

const PROPS = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"] as const

/** A property from style="" or the attribute (style wins, as in the browser) */
export function prop(el: Element, name: string) {
  const style = el.getAttribute("style") ?? ""
  const m = style.match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`, "i"))
  return m ? m[1].trim() : el.getAttribute(name)
}

const urlId = (v: string | null) => v?.match(/^url\(\s*['"]?#([^'")]+)['"]?\s*\)$/)?.[1] ?? null

export function readPaint(el: Element): Paint {
  const fill = prop(el, "fill")
  const gradientId = urlId(fill)
  const g = gradientId ? el.ownerDocument.getElementById(gradientId) : null
  return {
    fill,
    stroke: prop(el, "stroke"),
    strokeWidth: prop(el, "stroke-width"),
    cap: prop(el, "stroke-linecap"),
    join: prop(el, "stroke-linejoin"),
    gradient: g ? readGradient(g) : null,
    gradientId
  }
}

function readGradient(g: Element): Gradient | null {
  const type = g.localName === "linearGradient" ? "linear" : g.localName === "radialGradient" ? "radial" : null
  if (!type) return null
  const stops = [...g.querySelectorAll("stop")].map((s) => prop(s, "stop-color") ?? "#000000")
  if (stops.length < 2) return null
  const n = (a: string, d: number) => { const v = parseFloat(g.getAttribute(a) ?? ""); return Number.isFinite(v) ? (g.getAttribute(a)!.trim().endsWith("%") ? v / 100 : v) : d }
  const angle = type === "linear" ? Math.round(Math.atan2(n("y2", 0) - n("y1", 0), n("x2", 1) - n("x1", 0)) * 180 / Math.PI) : 0
  return { type, stops: [stops[0], stops[stops.length - 1]], angle }
}

/** Removes these properties from a style attribute; null when nothing's left */
function stripStyle(style: string | null, names: string[]) {
  if (!style) return undefined
  const kept = style.split(";").map((s) => s.trim()).filter((s) => s && !names.includes(s.split(":")[0].trim().toLowerCase()))
  const next = kept.join("; ")
  return next === style.trim() ? undefined : next || null
}

/** Sets (or, with null, removes) presentation attributes on several elements */
export function applyPaint(markup: string, elements: Element[], indices: number[], patch: Record<string, string | null>) {
  return paintTargets(markup, indices.map((i) => ({ index: i, el: elements[i] })), patch)
}

/** Same, with each element's index in `markup` paired with its parsed element (for its style="") */
function paintTargets(markup: string, targets: { index: number, el: Element | undefined }[], patch: Record<string, string | null>) {
  const ranges = elementRanges(markup)
  let next = markup
  // Back to front, so earlier offsets stay put
  for (const { index, el } of [...targets].sort((a, b) => b.index - a.index)) {
    const r = ranges[index]
    if (!r || !el || index === 0) continue
    const style = stripStyle(el.getAttribute("style"), Object.keys(patch))
    next = setAttrs(next, r, { ...patch, ...(style !== undefined ? { style } : {}) })
  }
  return next
}

const r4 = (n: number) => String(Math.round(n * 1e4) / 1e4)

function gradientMarkup(id: string, g: Gradient) {
  const stops = `<stop offset="0" stop-color="${g.stops[0]}"/><stop offset="1" stop-color="${g.stops[1]}"/>`
  if (g.type === "radial") return `<radialGradient id="${id}" cx=".5" cy=".5" r=".5">${stops}</radialGradient>`
  const a = (g.angle * Math.PI) / 180, c = Math.cos(a) / 2, s = Math.sin(a) / 2
  return `<linearGradient id="${id}" x1="${r4(0.5 - c)}" y1="${r4(0.5 - s)}" x2="${r4(0.5 + c)}" y2="${r4(0.5 + s)}">${stops}</linearGradient>`
}

/**
 * Fills the elements with a gradient. Reuses `reuseId` when it names one of
 * ours (so editing it doesn't pile up copies), otherwise adds a new one to
 * <defs>. Returns the new markup and where the elements are now: the gradient
 * can add elements ahead of them, which renumbers them
 */
export function applyGradient(markup: string, elements: Element[], indices: number[], g: Gradient, reuseId: string | null) {
  const taken = new Set(elements.map((e) => e.getAttribute("id")).filter(Boolean))
  let id = reuseId && /^svgenius-g\d+$/.test(reuseId) && taken.has(reuseId) ? reuseId : null
  const existing = id
  if (!id) { let n = 1; while (taken.has(`svgenius-g${n}`)) n++; id = `svgenius-g${n}` }
  const def = gradientMarkup(id, g)
  const before = elementRanges(markup)

  // 1. The gradient itself: replaced in place, or added to <defs>
  let next = markup, at = -1
  const re = new RegExp(`<(linearGradient|radialGradient)\\b[^>]*\\bid=["']${id}["'][\\s\\S]*?</\\1>`)
  const found = existing ? re.exec(markup) : null
  if (found) {
    at = found.index
    next = markup.slice(0, at) + def + markup.slice(at + found[0].length)
  } else {
    const root = before[0]
    if (!root) return { markup, select: indices }
    const defsOpen = markup.slice(root.tagEnd).match(/<defs\b[^>]*?(\/?)>/)
    if (defsOpen && defsOpen.index !== undefined) {
      const open = root.tagEnd + defsOpen.index
      if (defsOpen[1]) { at = open; next = markup.slice(0, at) + `<defs>${def}</defs>` + markup.slice(at + defsOpen[0].length) }
      else { at = open + defsOpen[0].length; next = markup.slice(0, at) + def + markup.slice(at) }
    } else {
      at = root.tagEnd
      next = markup.slice(0, at) + `<defs>${def}</defs>` + markup.slice(at)
    }
  }

  // 2. Elements after that point moved along by however many were added
  const added = elementRanges(next).length - before.length
  const select = indices.map((i) => (before[i] && before[i].start >= at ? i + added : i))

  // 3. Point their fills at it
  next = paintTargets(next, select.map((index, k) => ({ index, el: elements[indices[k]] })), { fill: `url(#${id})` })
  return { markup: next, select }
}

/** #rrggbb for a colour input, or null when it isn't a plain colour (none, url(), currentColor) */
export function toHex(v: string | null) {
  if (!v || v === "none" || v.startsWith("url(") || /^currentcolor$/i.test(v) || /^var\(/.test(v)) return null
  const ctx = document.createElement("canvas").getContext("2d")
  if (!ctx) return null
  ctx.fillStyle = "#000"
  ctx.fillStyle = v
  const out = ctx.fillStyle
  return /^#[0-9a-f]{6}$/i.test(out) ? out : null
}

export const PAINT_PROPS = PROPS
export type { TagRange }
