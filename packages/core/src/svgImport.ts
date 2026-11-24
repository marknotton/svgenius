import { LIMITS } from "./complexity"
import { byteLength, formatBytes } from "./format"
import { fmtNum, parseLength, parseViewBox } from "./svgRoot"

// ── SVG from pasted or typed code ─────────────────────────────────────────────
// Takes whatever someone pasted (a whole file, a bare <symbol>, a sprite, a
// few loose shapes, a data URI, an <svg> copied out of a web page) and turns it
// into one or more standalone SVGs with a sensible file name each. Scripts and
// event handlers are stripped on the way in.

const SVG_NS = "http://www.w3.org/2000/svg"
const XLINK_NS = "http://www.w3.org/1999/xlink"

export const PASTE_LIMITS = {
  /** Above this, ask before doing anything with it */
  warnBytes: 1024 * 1024,
  warnElements: LIMITS.elements,
  /** Above this, don't touch it at all */
  maxBytes: 25 * 1024 * 1024
}

export interface PastedSvg {
  svg: string
  /** File name without .svg */
  name: string
  /** Where it came from, like "<symbol id="arrow">", for the preview caption */
  from?: string
}

export type Prepared =
  | { ok: true, items: PastedSvg[], notes: string[], warnings: string[] }
  | { ok: false, error: string }

/** Quick sniff: worth opening the paste dialog for? */
export function looksLikeSvg(text: string): boolean {
  const t = text.trim()
  return /^(url\(\s*['"]?)?data:image\/svg\+xml/i.test(t) || /<(svg|symbol)[\s>]/i.test(t) || /^&lt;(svg|symbol|\?xml)/i.test(t)
}

/** Too big to touch (block), or big enough to ask first (warn) */
export function sizeCheck(text: string): { block?: string, warn?: string } {
  const bytes = text.length > 4 * 1024 * 1024 ? text.length : byteLength(text)
  if (bytes > PASTE_LIMITS.maxBytes) {
    return { block: `That's ${formatBytes(bytes)} of markup. Pasting is limited to ${formatBytes(PASTE_LIMITS.maxBytes)}: save it as a file and add that instead.` }
  }
  let elements = 0
  const tag = /<[A-Za-z]/g
  while (tag.exec(text)) elements++
  if (bytes > PASTE_LIMITS.warnBytes || elements > PASTE_LIMITS.warnElements) {
    return { warn: `${formatBytes(bytes)} of markup with ${elements.toLocaleString("en-GB")} elements` }
  }
  return {}
}

// ── Reading the input ─────────────────────────────────────────────────────────

/** Data URIs, CSS url(…) and HTML-escaped markup become plain markup */
function unwrap(text: string, notes: string[]): string {
  let t = text.replace(/^﻿/, "").trim()
  const url = t.match(/^url\(\s*(['"]?)([\s\S]*)\1\s*\)\s*;?$/i)
  if (url) t = url[2].trim()
  const data = t.match(/^data:image\/svg\+xml((?:;[^,]*)?),([\s\S]*)$/i)
  if (data) {
    const body = data[2].trim()
    try {
      if (/;base64/i.test(data[1])) {
        const bin = atob(body.replace(/\s+/g, ""))
        t = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
      } else {
        try { t = decodeURIComponent(body) } catch { t = body }
      }
      notes.push("Decoded from a data URI")
    } catch {
      throw new Error("That data URI couldn't be decoded. It may have been cut short when it was copied.")
    }
  }
  if (/^&lt;(svg|symbol|\?xml|!--|g|path)/i.test(t)) {
    t = new DOMParser().parseFromString(`<textarea>${t}</textarea>`, "text/html").querySelector("textarea")?.value ?? t
    notes.push("Unescaped HTML entities (&lt; and &gt;)")
  }
  return t.trim()
}

const PROLOG = /^(\s*(?:<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^[>]*(?:\[[\s\S]*?\])?\s*>))*\s*/i

/** Adds the SVG (and xlink) namespaces to the first tag when they're missing, as in SVG copied from HTML */
function withNamespaces(text: string): string {
  const lead = text.match(PROLOG)?.[0] ?? ""
  const m = text.slice(lead.length).match(/^<([A-Za-z][\w:.-]*)([^>]*)>/)
  if (!m) return text
  let add = ""
  if (!/\sxmlns\s*=/.test(m[2])) add += ` xmlns="${SVG_NS}"`
  if (/\bxlink:/.test(text) && !/\sxmlns:xlink\s*=/.test(m[2])) add += ` xmlns:xlink="${XLINK_NS}"`
  if (!add) return text
  const at = lead.length + 1 + m[1].length
  return text.slice(0, at) + add + text.slice(at)
}

function parseXml(text: string): { doc: Document, error: string | null } {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml")
  const pe = doc.getElementsByTagName("parsererror")[0]
  return { doc, error: pe ? friendlyError(pe.textContent ?? "") : null }
}

/** Turns the browser's XML error into something a person can act on */
function friendlyError(raw: string): string {
  const webkit = raw.match(/line (\d+) at column (\d+):\s*([^\n]+)/i)
  const gecko = raw.match(/XML Parsing Error:\s*([^\n]+)[\s\S]*?Line Number (\d+), Column (\d+)/i)
  const [line, col, msg] = webkit ? [webkit[1], webkit[2], webkit[3]] : gecko ? [gecko[2], gecko[3], gecko[1]] : [null, null, raw.split("\n").find((l) => l.trim()) ?? "Unknown error"]
  const where = line ? `Line ${line}, column ${col}: ` : ""
  const m = msg.replace(/Below is a rendering[\s\S]*$/i, "").trim().replace(/\.$/, "")
  const hints: Array<[RegExp, string]> = [
    [/unbound prefix|namespace prefix .* not defined|prefix not bound/i, "an attribute or tag uses a prefix (like xlink: or sodipodi:) that isn't declared"],
    [/AttValue|attributes construct|not well-formed.*attribute|quote/i, "an attribute value is missing its quotes"],
    [/EntityRef|expecting ';'|undefined entity/i, "a bare & has to be written as &amp;"],
    [/Opening and ending tag mismatch|mismatched tag/i, "a tag is closed in the wrong place, or not closed at all"],
    [/Premature end|no element found|unclosed|EOF/i, "the markup stops part way through. Was it cut off when copying?"],
    [/Start tag expected|Document is empty|syntax error/i, "there's no markup to read"]
  ]
  const hint = hints.find(([re]) => re.test(m))?.[1]
  return `${where}${hint ? `${hint[0].toUpperCase()}${hint.slice(1)} (${m})` : m}`
}

const HTML_WRAPPERS = new Set(["html", "head", "body", "div", "span", "p", "section", "figure", "picture", "template", "button", "i", "li", "ul", "main", "header", "footer", "article", "td"])

const SVG_ELEMENTS = new Set([
  "svg", "g", "defs", "symbol", "use", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "textPath",
  "image", "linearGradient", "radialGradient", "stop", "pattern", "clipPath", "mask", "filter", "marker", "style", "title", "desc",
  "metadata", "a", "switch", "foreignObject", "view", "script", "animate", "animateTransform", "animateMotion", "set", "mpath"
])
const isFilter = (n: string) => n.startsWith("fe")

// ── Sanitising ────────────────────────────────────────────────────────────────

/** Removes scripts, event handlers and javascript: links. Returns how many of each */
function sanitise(root: Element): { scripts: number, handlers: number } {
  let scripts = 0, handlers = 0
  for (const el of [...root.querySelectorAll("*"), root]) {
    if (!el.isConnected && el !== root) continue
    const name = el.localName.toLowerCase()
    if (name === "script" || name === "iframe" || name === "object" || name === "embed") { el.remove(); scripts++; continue }
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.localName)) { el.removeAttributeNode(a); handlers++ }
      else if (/^(href|src|action|formaction)$/i.test(a.localName) && /^\s*(javascript|vbscript):/i.test(a.value)) { el.removeAttributeNode(a); handlers++ }
    }
  }
  return { scripts, handlers }
}

// ── Measuring artwork that has no viewBox ─────────────────────────────────────

/** Renders the SVG off screen and measures its contents, plus half the widest stroke */
function measure(svg: Element): string | null {
  const host = document.createElement("div")
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:1px;height:1px;overflow:hidden;visibility:hidden;pointer-events:none"
  const live = document.importNode(svg, true) as SVGSVGElement
  live.removeAttribute("viewBox")
  host.append(live)
  document.body.append(host)
  try {
    const b = live.getBBox()
    if (!(b.width > 0 || b.height > 0)) return null
    let stroke = 0
    for (const el of [live, ...live.querySelectorAll("*")]) {
      const cs = getComputedStyle(el)
      if (cs.stroke && cs.stroke !== "none") stroke = Math.max(stroke, parseFloat(cs.strokeWidth) || 1)
    }
    const pad = stroke / 2
    const x = Math.floor((b.x - pad) * 1000) / 1000, y = Math.floor((b.y - pad) * 1000) / 1000
    const w = Math.ceil((b.width + pad * 2) * 1000) / 1000, h = Math.ceil((b.height + pad * 2) * 1000) / 1000
    return [x, y, Math.max(w, 0.001), Math.max(h, 0.001)].map((n) => fmtNum(n)).join(" ")
  } catch {
    return null
  } finally {
    host.remove()
  }
}

/** Makes sure the SVG has a usable viewBox, measuring it when it has to */
function ensureViewBox(svg: Element, notes: string[], what: string) {
  if (parseViewBox(svg.getAttribute("viewBox"))) return
  const w = parseLength(svg.getAttribute("width")), h = parseLength(svg.getAttribute("height"))
  if (w && h) { svg.setAttribute("viewBox", `0 0 ${fmtNum(w)} ${fmtNum(h)}`); notes.push(`${what}: viewBox set from its width and height`); return }
  const vb = measure(svg)
  if (vb) { svg.setAttribute("viewBox", vb); notes.push(`${what}: viewBox measured from the artwork (${vb})`); return }
  svg.setAttribute("viewBox", "0 0 24 24")
  notes.push(`${what}: the artwork couldn't be measured, so the viewBox is a guess (0 0 24 24). Trim will fix it`)
}

// ── Names ─────────────────────────────────────────────────────────────────────

const GENERIC = /^(layer|calque|capa|ebene|livello|laag|warstwa|camada|slide|artboard|frame|group|grupo|groupe|gruppe|g|path|svg|svgid|icon|image|img|vector|shape|graphic|untitled|symbol|defs|mask|clip|clippath|lineargradient|radialgradient|object|item|element|root|main|content|isolation[\s_-]*mode|svgrepo.*|ebene|copy|kopie|a|b|c|x)[\s_-]*\d*$/i

function slug(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/\.svg$/i, "")
    .replace(/['’"]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/_+/g, "_")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .toLowerCase()
    .slice(0, 64)
    .replace(/[-_.]+$/, "")
  if (!s || GENERIC.test(s)) return null
  // Machine ids: long hex runs, Illustrator's SVGID_1_, React's :r1:, base64-ish noise
  if (/^[a-f0-9]{8,}$/.test(s) || /^svgid/.test(s) || /^[a-z]?\d+$/.test(s) || /^_+/.test(raw) || /^:r\w+:$/.test(raw)) return null
  return s
}

const ownText = (el: Element, name: string) => {
  for (const c of el.children) if (c.localName === name && c.textContent?.trim()) return c.textContent.trim()
  return null
}

/** The first thing in the markup that reads like a name */
function guessName(el: Element, context?: Element): string | null {
  const attr = (e: Element, ...names: string[]) => {
    for (const n of names) { const v = e.getAttribute(n); if (v?.trim()) return v }
    return null
  }
  const dataName = (e: Element) => {
    const direct = attr(e, "data-name", "data-icon", "data-title", "data-label", "data-filename", "data-file-name", "data-id")
    if (direct) return direct
    for (const a of e.attributes) if (/^data-.*(name|icon|title|label|file)/i.test(a.name) && a.value.trim()) return a.value
    return null
  }
  const docName = (e: Element) => e.getAttributeNS("http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd", "docname") ?? e.getAttribute("sodipodi:docname")
  const dcTitle = (e: Element) => e.getElementsByTagNameNS("http://purl.org/dc/elements/1.1/", "title")[0]?.textContent?.trim() || null
  const classToken = (e: Element) => {
    const tokens = (e.getAttribute("class") ?? "").split(/\s+/).filter((t) => t.includes("-") && !/^(svg-inline|icon$|is-|has-|js-|w-|h-|size-|text-|fill-|stroke-)/.test(t))
    return tokens.length ? tokens[tokens.length - 1] : null
  }
  const layer = (e: Element) => {
    // A named top group, as Figma, Sketch and Illustrator export layer names
    for (const g of e.querySelectorAll(":scope > g, :scope > g > g")) {
      const n = slug(dataName(g)) ?? slug(g.getAttributeNS("http://www.inkscape.org/namespaces/inkscape", "label")) ?? slug(g.id)
      if (n) return n
    }
    return null
  }
  const candidates = [
    () => docName(el) ?? (context ? docName(context) : null),
    () => ownText(el, "title"),
    () => dcTitle(el),
    () => attr(el, "aria-label"),
    () => dataName(el),
    () => el.id,
    () => classToken(el),
    () => layer(el),
    () => (context && context !== el ? ownText(context, "title") ?? attr(context, "aria-label") ?? dataName(context) ?? context.id : null)
  ]
  for (const c of candidates) {
    const s = slug(c())
    if (s) return s
  }
  return null
}

export const randomName = () => `pasted-${Math.random().toString(36).slice(2, 8).padEnd(6, "0")}`

// ── Building standalone SVGs ──────────────────────────────────────────────────

const NOT_DRAWN = new Set(["defs", "symbol", "title", "desc", "metadata", "style", "script"])
const drawn = (svg: Element) => [...svg.children].filter((c) => !NOT_DRAWN.has(c.localName))

const describe = (el: Element) => `<${el.localName}${el.id ? ` id="${el.id}"` : ""}>`

/** A <symbol> as its own <svg>, taking any gradients, clip paths or styles it uses from the sprite */
function symbolToSvg(sym: Element, sprite: Element | null): Element {
  const doc = sym.ownerDocument
  const svg = doc.createElementNS(SVG_NS, "svg")
  for (const a of sym.attributes) {
    if (!/^(id|x|y|refX|refY)$/.test(a.name)) svg.setAttributeNS(a.namespaceURI, a.name, a.value)
  }
  if (sprite) {
    const text = new XMLSerializer().serializeToString(sym)
    const shared: Node[] = []
    for (const s of sprite.querySelectorAll(":scope > style, :scope > defs > style")) shared.push(s.cloneNode(true))
    const defs = doc.createElementNS(SVG_NS, "defs")
    for (const d of sprite.querySelectorAll(":scope > defs > *:not(symbol):not(style), :scope > linearGradient, :scope > radialGradient, :scope > clipPath, :scope > mask, :scope > filter, :scope > pattern")) {
      if (d.id && new RegExp(`#${d.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) defs.append(d.cloneNode(true))
    }
    for (const s of shared) svg.append(s)
    if (defs.children.length) svg.append(defs)
  }
  for (const c of sym.childNodes) svg.append(c.cloneNode(true))
  return svg
}

const serialise = (el: Element) => new XMLSerializer().serializeToString(el)

/**
 * Validates and prepares pasted markup. Runs in the page (it measures
 * artwork in a hidden render), so check sizeCheck() before calling it.
 */
export function prepareSvg(input: string): Prepared {
  const notes: string[] = [], warnings: string[] = []
  let text: string
  try { text = unwrap(input, notes) } catch (e) { return { ok: false, error: (e as Error).message } }
  if (!text) return { ok: false, error: "Nothing to read yet. Paste or type some SVG markup." }
  if (!text.includes("<")) return { ok: false, error: "That's plain text, not SVG markup. SVG starts with <svg or <symbol." }
  if (/\sclassName=|\s[a-z]+[A-Z]\w*=\{|=\{\s*\d/.test(text)) {
    return { ok: false, error: "This looks like JSX (React), not SVG: it has className or {…} attributes. Paste the plain SVG markup instead." }
  }

  // 1. As it is, with the namespace added if it came out of HTML
  const fixed = withNamespaces(text)
  let { doc, error } = parseXml(fixed)
  let root: Element | null = error ? null : doc.documentElement
  let original: string | null = root?.localName === "svg" ? fixed : null
  if (original && fixed !== text) notes.push("Added the missing xmlns, as SVG copied from a web page often lacks it")
  let fragment = false

  // 2. A bare <symbol>, loose shapes or several top-level elements: wrap them
  if (!root || root.localName !== "svg") {
    const body = text.replace(PROLOG, "")
    const wrapped = parseXml(`<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}">${body}</svg>`)
    if (!wrapped.error) {
      doc = wrapped.doc; root = doc.documentElement; error = null; fragment = true; original = null
    } else if (!error) {
      error = wrapped.error
    }
  }

  // 3. Still broken: let the forgiving HTML parser have a go, then check its result
  if (!root || error) {
    const html = new DOMParser().parseFromString(text, "text/html")
    const found = [...html.body.querySelectorAll("svg")].filter((s) => !s.parentElement?.closest("svg"))
    const symbols = found.length ? [] : [...html.body.querySelectorAll("symbol")]
    if (!found.length && !symbols.length) return { ok: false, error: error ?? "That isn't SVG markup." }
    const markup = found.length
      ? found.map((s) => serialise(s)).join("")
      : symbols.map((s) => serialise(s)).join("")
    const repaired = parseXml(`<svg xmlns="${SVG_NS}" xmlns:xlink="${XLINK_NS}">${markup}</svg>`)
    if (repaired.error) return { ok: false, error: error ?? repaired.error }
    warnings.push(`The markup had errors, so it was repaired. Check the preview looks right.${error ? ` ${error}` : ""}`)
    doc = repaired.doc; root = doc.documentElement; fragment = true; original = null
  }

  // What's at the top: SVG, or an HTML wrapper with SVG inside
  const tops = fragment ? [...root.children] : [root]
  const strange = tops.find((t) => !SVG_ELEMENTS.has(t.localName) && !isFilter(t.localName))
  if (strange) {
    if (HTML_WRAPPERS.has(strange.localName.toLowerCase())) {
      const inner = [...root.querySelectorAll("svg")].filter((s) => s !== root && !s.parentElement?.closest("svg:not(:root)"))
      if (!inner.length) return { ok: false, error: `That's HTML (<${strange.localName}>) with no <svg> inside it.` }
      notes.push(`Took the SVG out of the surrounding <${strange.localName}>`)
      for (const t of [...root.children]) t.remove()
      for (const s of inner) root.append(s)
    } else {
      return { ok: false, error: `<${strange.localName}> isn't an SVG element. Paste markup that starts with <svg or <symbol.` }
    }
  }

  // Safety first: nothing runs in a preview
  const clean = sanitise(root)
  if (clean.scripts || clean.handlers) {
    original = null
    const bits = [clean.scripts && `${clean.scripts} script${clean.scripts === 1 ? "" : "s"}`, clean.handlers && `${clean.handlers} event handler${clean.handlers === 1 ? "" : "s"} or javascript: link${clean.handlers === 1 ? "" : "s"}`].filter(Boolean)
    notes.push(`Removed ${bits.join(" and ")}`)
  }

  const items: PastedSvg[] = []
  const add = (svg: Element, from: string | undefined, nameEl: Element, context?: Element, keep?: string | null) => {
    if (!keep) ensureViewBox(svg, notes, from ?? "The SVG")
    items.push({ svg: keep ?? serialise(svg), name: guessName(nameEl, context) ?? "", from })
  }

  /** One <svg>: a sprite becomes one file per symbol, anything else stays whole */
  const takeSvg = (svg: Element, keep: string | null) => {
    const symbols = [...svg.querySelectorAll("symbol")].filter((s) => s.closest("svg") === svg)
    if (symbols.length && drawn(svg).length === 0) {
      if (symbols.length > 1) notes.push(`A sprite with ${symbols.length} symbols: each one becomes its own SVG`)
      else notes.push("Wrapped the <symbol> in an <svg> so it can be previewed and optimised")
      const spriteName = guessName(svg)
      symbols.forEach((sym, k) => {
        const out = symbolToSvg(sym, svg)
        ensureViewBox(out, notes, describe(sym))
        items.push({ svg: serialise(out), name: guessName(sym) ?? (spriteName ? `${spriteName}-${k + 1}` : ""), from: describe(sym) })
      })
      return
    }
    const hadViewBox = !!parseViewBox(svg.getAttribute("viewBox")) || (parseLength(svg.getAttribute("width")) !== null && parseLength(svg.getAttribute("height")) !== null)
    add(svg, undefined, svg, undefined, hadViewBox ? keep : null)
  }

  if (!fragment) {
    takeSvg(root, original)
  } else {
    const kids = [...root.children]
    if (kids.length === 0) return { ok: false, error: "There's no SVG content in that markup." }
    if (kids.every((k) => k.localName === "svg")) {
      if (kids.length > 1) notes.push(`${kids.length} separate SVGs: each one is added on its own`)
      for (const k of kids) takeSvg(k, null)
    } else if (kids.every((k) => k.localName === "symbol" || k.localName === "defs" || k.localName === "style") && kids.some((k) => k.localName === "symbol")) {
      takeSvg(root, null)
    } else {
      // Loose shapes (or a <g>): give them an <svg> of their own
      notes.push(`Wrapped ${kids.length === 1 ? describe(kids[0]) : `${kids.length} loose elements`} in an <svg>`)
      add(root, undefined, kids.length === 1 ? kids[0] : root, root)
    }
  }

  if (!items.length) return { ok: false, error: "There's no SVG content in that markup." }
  const fallback = randomName()
  items.forEach((it, k) => { if (!it.name) it.name = items.length > 1 ? `${fallback}-${k + 1}` : fallback })
  return { ok: true, items, notes, warnings }
}

/** name.svg, or name-2.svg and so on when it's taken */
export function uniqueName(base: string, taken: Set<string>): string {
  const clean = (slug(base) ?? base.trim().replace(/[\\/:*?"<>|]+/g, "-")) || randomName()
  let name = `${clean}.svg`, n = 2
  while (taken.has(name.toLowerCase())) name = `${clean}-${n++}.svg`
  taken.add(name.toLowerCase())
  return name
}
