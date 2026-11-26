import { canonicalColour } from "./cutOuts"
import { newId } from "./settings"
import type { Flag, SvgItem } from "./types"
import { DEFAULT_SQUARE_TOLERANCE, isIdentity, magicGroup } from "./designPrinciples"
import { getAttr, parseViewBox, rootTag, svgSize } from "./svgRoot"
import { artworkBounds } from "./trim"

// ── Advanced list filters ─────────────────────────────────────────────────────
// Rules combine with "all" or "any". Each can be flipped to "doesn't".

export type FilterField = "text" | "colour" | "element" | "attribute" | "flag" | "status" | "name" | "shape"
export type FilterStatus = "optimised" | "pending" | "error" | "edited" | "own" | "tuned"

export interface FilterRule {
  id: string
  enabled: boolean
  field: FilterField
  /** false = "doesn't" */
  has: boolean
  value: string
  /** Attribute value to look for (attribute rules only). Shape rules: "content" or "viewbox" */
  value2: string
}

export interface FilterSet {
  rules: FilterRule[]
  match: "all" | "any"
  /** Which markup to look in */
  markup: "source" | "output"
}

export const FLAGS: Array<{ value: Flag, label: string, colour: string }> = [
  { value: "red", label: "Red", colour: "#ef4444" },
  { value: "orange", label: "Orange", colour: "#f97316" },
  { value: "yellow", label: "Yellow", colour: "#eab308" },
  { value: "green", label: "Green", colour: "#22c55e" },
  { value: "blue", label: "Blue", colour: "#3b82f6" },
  { value: "purple", label: "Purple", colour: "#a855f7" }
]

/** Next flag in the cycle, ending back at none */
export function nextFlag(f: Flag | undefined): Flag | undefined {
  if (!f) return FLAGS[0].value
  const i = FLAGS.findIndex((x) => x.value === f)
  return i < 0 || i === FLAGS.length - 1 ? undefined : FLAGS[i + 1].value
}

export const FIELDS: Array<{ value: FilterField, label: string, hint: string }> = [
  { value: "text", label: "Markup", hint: "Any text in the markup, e.g. #fff or data-name" },
  { value: "colour", label: "Colour", hint: "A colour used anywhere: fills, strokes, stops, styles. #fff, white and rgb(255,255,255) all match" },
  { value: "element", label: "Element", hint: "An element, e.g. circle, g, mask, text" },
  { value: "attribute", label: "Attribute", hint: "An attribute, optionally with a value containing some text" },
  { value: "name", label: "File name", hint: "Text in the file name or folder" },
  { value: "flag", label: "Flag", hint: "A flag colour, or any flag" },
  { value: "status", label: "Status", hint: "Optimised, waiting, failed, edited, own settings or tuned in Quick Edit" },
  { value: "shape", label: "Shape", hint: "Square, tall or wide, by the artwork itself or by the viewBox. Square tolerance is in Settings" }
]

export type Shape = "square" | "tall" | "wide"
export const SHAPES: Array<{ value: Shape, label: string }> = [
  { value: "square", label: "Square" }, { value: "tall", label: "Tall" }, { value: "wide", label: "Wide" }
]
export type ShapeBy = "content" | "viewbox"

export const STATUSES: Array<{ value: FilterStatus, label: string }> = [
  { value: "optimised", label: "Optimised" },
  { value: "pending", label: "Not optimised yet" },
  { value: "error", label: "Failed" },
  { value: "edited", label: "Markup edited" },
  { value: "own", label: "Custom settings" },
  { value: "tuned", label: "Tuned in Quick Edit" }
]

export const ELEMENTS = ["path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "g", "use", "symbol", "defs", "text", "tspan",
  "image", "mask", "clipPath", "pattern", "linearGradient", "radialGradient", "filter", "style", "title", "desc", "metadata", "foreignObject", "a", "switch", "script"]

export function createFilterRule(field: FilterField = "text"): FilterRule {
  return { id: newId(), enabled: true, field, has: true, value: field === "colour" ? "#ffffff" : field === "flag" ? "any" : field === "status" ? "error" : field === "element" ? "circle" : field === "shape" ? "square" : "", value2: field === "shape" ? "content" : "" }
}

export const emptyFilters = (): FilterSet => ({ rules: [], match: "all", markup: "source" })

/** Rules that are on and complete enough to test */
export const activeRules = (f: FilterSet) =>
  f.rules.filter((r) => r.enabled && (r.value.trim() || r.field === "attribute" && r.value2.trim()))

// ── Facts about a file's markup, worked out once per version ─────────────────

interface Facts {
  ok: boolean
  elements: Set<string>
  /** attribute name → values */
  attrs: Map<string, string[]>
  colours: Set<string>
}

const cache = new Map<string, Facts>()
const COLOUR_TOKEN = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b[a-z]{3,20}\b/gi
const PAINT_PROPS = /(?:fill|stroke|stop-color|flood-color|lighting-color|color)\s*:\s*([^;}"']+)/gi

function factsOf(svg: string): Facts {
  const hit = cache.get(svg)
  if (hit) return hit
  const facts: Facts = { ok: false, elements: new Set(), attrs: new Map(), colours: new Set() }
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml")
  if (doc.documentElement.localName === "svg" && !doc.querySelector("parsererror")) {
    facts.ok = true
    const addColours = (text: string) => {
      for (const t of text.match(COLOUR_TOKEN) ?? []) {
        // Only words a browser knows as colours count
        const c = canonicalColour(t)
        if (c && (t.startsWith("#") || /\(/.test(t) || isNamedColour(t))) facts.colours.add(c)
      }
    }
    for (const el of [doc.documentElement, ...doc.documentElement.querySelectorAll("*")]) {
      facts.elements.add(el.localName.toLowerCase())
      for (const a of el.attributes) {
        const name = a.name.toLowerCase()
        const list = facts.attrs.get(name)
        if (list) list.push(a.value)
        else facts.attrs.set(name, [a.value])
        if (/^(fill|stroke|stop-color|flood-color|lighting-color|color)$/.test(name)) addColours(a.value)
        if (name === "style") for (const m of a.value.matchAll(PAINT_PROPS)) addColours(m[1])
      }
      if (el.localName === "style") for (const m of (el.textContent ?? "").matchAll(PAINT_PROPS)) addColours(m[1])
    }
  }
  if (cache.size > 2000) cache.delete(cache.keys().next().value as string)
  cache.set(svg, facts)
  return facts
}

const NAMED = new Set(["black", "white", "red", "green", "blue", "yellow", "orange", "purple", "grey", "gray", "silver", "maroon", "navy",
  "teal", "olive", "lime", "aqua", "fuchsia", "cyan", "magenta", "pink", "brown", "gold", "transparent"])
const isNamedColour = (t: string) => NAMED.has(t.toLowerCase())

// ── Shapes: square, tall or wide ──────────────────────────────────────────────
// The viewBox is read straight from the markup. The artwork's own bounds need
// a render, so they're measured in the background and cached by markup

const artCache = new Map<string, { w: number, h: number } | null>()
const measuring = new Set<string>()

/** The artwork's measured size; undefined while it hasn't been measured */
export const cachedArt = (svg: string) => artCache.get(svg)

/** Measures any of these not measured yet. Resolves once they're all done */
export async function measureArt(svgs: string[]) {
  const todo = [...new Set(svgs)].filter((s) => !artCache.has(s) && !measuring.has(s))
  todo.forEach((s) => measuring.add(s))
  for (const svg of todo) {
    const box = await artworkBounds(svg).catch(() => null)
    if (artCache.size > 4000) artCache.delete(artCache.keys().next().value as string)
    artCache.set(svg, box ? { w: box.w, h: box.h } : null)
    measuring.delete(svg)
  }
  return todo.length
}

export function viewBoxSize(svg: string | undefined) {
  if (!svg) return null
  const tag = rootTag(svg)
  const vb = tag ? parseViewBox(getAttr(tag, "viewBox")) : null
  return vb && vb.w > 0 && vb.h > 0 ? { w: vb.w, h: vb.h } : svgSize(svg)
}

/** Square, tall or wide by the artwork or the viewBox. undefined = not measured yet, null = can't tell */
export function shapeOf(svg: string | undefined, by: ShapeBy, tolerance = DEFAULT_SQUARE_TOLERANCE): Shape | null | undefined {
  if (!svg) return null
  const size = by === "viewbox" ? viewBoxSize(svg) : cachedArt(svg)
  if (size === undefined) return undefined
  return size && size.w > 0 && size.h > 0 ? magicGroup(size.w, size.h, tolerance) : null
}

/** Search words like shape:tall (artwork) or vb:wide (viewBox). Returns the rest of the query */
/** Placed in Quick Edit (the row's Tuned tag) */
export const isTuned = (item: Pick<SvgItem, "adjust">) => !isIdentity(item.adjust)

/**
 * Search tokens, mixed in with the name search: shape:tall, vb:wide, is:tuned,
 * and a leading - to leave them out (-shape:square, -is:tuned)
 */
export function shapeTokens(query: string) {
  const tokens: Array<{ shape: Shape, by: ShapeBy, has: boolean }> = []
  const is: Array<{ status: "tuned", has: boolean }> = []
  query = query.replace(/(^|\s)(-?)is:(tuned)(?=\s|$)/gi, (_m, pre: string, neg: string) => { is.push({ status: "tuned", has: !neg }); return pre })
  const rest = query.replace(/(^|\s)(-?)(shape|art|vb|viewbox):(square|tall|wide)(?=\s|$)/gi, (_m, pre: string, neg: string, kind: string, shape: string) => {
    tokens.push({ shape: shape.toLowerCase() as Shape, by: /^(vb|viewbox)$/i.test(kind) ? "viewbox" : "content", has: !neg })
    return pre
  })
  return { tokens, is, rest: rest.trim() }
}

export interface FilterContext {
  /** Square tolerance, ±% */
  tolerance?: number
}

/** Markup whose artwork needs measuring for these filters (empty when none use the artwork) */
export function needsMeasuring(items: SvgItem[], f: FilterSet, extraContent = false) {
  const on = extraContent || activeRules(f).some((r) => r.field === "shape" && r.value2 !== "viewbox")
  if (!on) return []
  return items.flatMap((i) => {
    const svg = f.markup === "output" ? i.result?.output : i.source
    return svg && cachedArt(svg) === undefined ? [svg] : []
  })
}

// ── Matching ──────────────────────────────────────────────────────────────────

function test(rule: FilterRule, item: SvgItem, svg: string | undefined, ctx: FilterContext): boolean {
  const v = rule.value.trim().toLowerCase()
  switch (rule.field) {
    case "shape": return shapeOf(svg, rule.value2 === "viewbox" ? "viewbox" : "content", ctx.tolerance) === v
    case "name": return item.relPath.toLowerCase().includes(v)
    case "flag": return v === "any" ? !!item.flag : v === "none" ? !item.flag : item.flag === v
    case "status":
      if (v === "optimised") return !!item.result && item.status !== "error"
      if (v === "pending") return !item.result && item.status !== "error"
      if (v === "error") return item.status === "error"
      if (v === "edited") return item.fileSource !== undefined && item.source !== item.fileSource
      if (v === "own") return !!item.config
      if (v === "tuned") return isTuned(item)
      return false
    case "text": return !!svg && svg.toLowerCase().includes(v)
    default: break
  }
  if (!svg) return false
  const facts = factsOf(svg)
  if (!facts.ok) return false
  if (rule.field === "element") return facts.elements.has(v)
  if (rule.field === "colour") {
    const c = canonicalColour(rule.value)
    return !!c && facts.colours.has(c)
  }
  // Attribute: name (optional), value contains (optional)
  const want = rule.value2.trim().toLowerCase()
  const names = v ? [v] : [...facts.attrs.keys()]
  return names.some((n) => {
    const values = facts.attrs.get(n)
    return !!values && (!want || values.some((x) => x.toLowerCase().includes(want)))
  })
}

export function matchesFilters(item: SvgItem, f: FilterSet, ctx: FilterContext = {}) {
  const rules = activeRules(f)
  if (!rules.length) return true
  const svg = f.markup === "output" ? item.result?.output : item.source
  const check = (r: FilterRule) => test(r, item, svg, ctx) === r.has
  return f.match === "all" ? rules.every(check) : rules.some(check)
}
