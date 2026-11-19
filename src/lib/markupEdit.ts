import type { TagRange } from "./markupMap"
import { SHAPE_ATTRS, allAnchors, parsePath, serialisePath, shapeToPathData, shiftPoints, splitSubpaths, fmt } from "./pathData"

// ── Small surgical edits to markup ────────────────────────────────────────────
// Everything outside the touched element stays byte for byte as it was.

const escapeAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

const attrRe = (name: string) => new RegExp(`(\\s${name.replace(/[:.]/g, "\\$&")}\\s*=\\s*)(["'])[\\s\\S]*?\\2`)

/** Sets (or adds) attributes in a start tag's text. null removes one */
export function tagWithAttrs(tag: string, attrs: Record<string, string | null>) {
  for (const [name, value] of Object.entries(attrs)) {
    const re = attrRe(name)
    if (value === null) tag = tag.replace(re, "")
    else if (re.test(tag)) tag = tag.replace(re, (_m, pre: string) => `${pre}"${escapeAttr(value)}"`)
    else tag = tag.replace(/\s*(\/?)>$/, (_m, slash: string) => ` ${name}="${escapeAttr(value)}"${slash ? " /" : ""}>`)
  }
  return tag
}

/** Sets (or adds, or with null removes) attributes on the element's start tag */
export function setAttrs(markup: string, r: TagRange, attrs: Record<string, string | null>) {
  return markup.slice(0, r.start) + tagWithAttrs(markup.slice(r.start, r.tagEnd), attrs) + markup.slice(r.tagEnd)
}

export const setAttr = (markup: string, r: TagRange, name: string, value: string) => setAttrs(markup, r, { [name]: value })

/** Removes the element, and its line when nothing else is on it */
export function removeElement(markup: string, r: TagRange) {
  let start = r.start, end = r.end
  while (start > 0 && (markup[start - 1] === " " || markup[start - 1] === "\t")) start--
  const lineStart = start === 0 || markup[start - 1] === "\n"
  if (lineStart) {
    let e = end
    while (e < markup.length && (markup[e] === " " || markup[e] === "\t")) e++
    if (markup[e] === "\r") e++
    if (markup[e] === "\n") end = e + 1
    else if (e >= markup.length) end = e
  } else start = r.start
  return markup.slice(0, start) + markup.slice(end)
}

/** Turns rect, circle, ellipse, line, polyline or polygon into a path */
export function convertToPath(markup: string, r: TagRange, el: Element): string | null {
  const d = shapeToPathData(el)
  const drop = SHAPE_ATTRS[el.localName]
  if (d === null || !drop) return null
  let tag = markup.slice(r.start, r.tagEnd).replace(new RegExp(`^<${el.tagName}`), "<path")
  for (const a of drop) tag = tag.replace(new RegExp(`\\s${a}\\s*=\\s*(["'])[\\s\\S]*?\\1`), "")
  tag = tag.replace(/\s*(\/?)>$/, (_m, slash: string) => ` d="${d}"${slash ? " /" : ""}>`)
  let rest = markup.slice(r.tagEnd, r.end)
  if (r.end > r.tagEnd) rest = rest.replace(new RegExp(`</${el.tagName}(\\s*)>$`), "</path$1>")
  return markup.slice(0, r.start) + tag + rest + markup.slice(r.end)
}

const lineStarted = (markup: string, at: number) => {
  let i = at
  while (i > 0 && (markup[i - 1] === " " || markup[i - 1] === "\t")) i--
  return i === 0 || markup[i - 1] === "\n"
}
const indentAt = (markup: string, at: number) => {
  let i = at
  while (i > 0 && (markup[i - 1] === " " || markup[i - 1] === "\t")) i--
  return markup.slice(i, at)
}

/** The span removeElement takes out */
function removalSpan(markup: string, r: TagRange): [number, number] {
  const out = removeElement(markup, r)
  // Whatever removeElement dropped sits between the unchanged head and tail
  let a = 0
  while (a < r.start && markup[a] === out[a]) a++
  return [a, a + markup.length - out.length]
}

/** Ids in a copied fragment get a suffix, so the file keeps them unique */
function uniqueIds(fragment: string, markup: string) {
  return fragment.replace(/(\sid\s*=\s*)(["'])([\s\S]*?)\2/g, (_m, pre: string, q: string, id: string) => {
    let n = 2
    while (markup.includes(`"${id}-${n}"`) || fragment.includes(`"${id}-${n}"`)) n++
    return `${pre}${q}${id}-${n}${q}`
  })
}

/** Copies the element right after itself. Returns where the copy starts */
export function duplicateElement(markup: string, r: TagRange) {
  const copy = uniqueIds(markup.slice(r.start, r.end), markup)
  const own = lineStarted(markup, r.start)
  const ins = own ? `\n${indentAt(markup, r.start)}${copy}` : copy
  return { markup: markup.slice(0, r.end) + ins + markup.slice(r.end), start: r.end + ins.length - copy.length }
}

/**
 * Pastes copied markup straight after element `r` (or as the root's last
 * child), so it lands in place: the same parent, the same coordinates.
 * Ids that already exist get a suffix. Returns where the pasted text starts and ends
 */
export function pasteAfter(markup: string, r: TagRange | null, root: TagRange, snippet: string) {
  const copy = uniqueIds(snippet.trim(), markup)
  if (r) {
    const own = lineStarted(markup, r.start)
    const ins = own ? `\n${indentAt(markup, r.start)}${copy}` : copy
    const start = r.end + ins.length - copy.length
    return { markup: markup.slice(0, r.end) + ins + markup.slice(r.end), start, end: start + copy.length }
  }
  // Before </svg>
  const close = markup.lastIndexOf("</", root.end)
  const at = close > root.tagEnd ? close : root.end
  const ins = `${copy}\n`
  return { markup: markup.slice(0, at) + ins + markup.slice(at), start: at, end: at + copy.length }
}

export type DropPlace = "before" | "after" | "inside"

/**
 * Moves element `from` before, after or into element `to` (as its last
 * child). Returns null when that isn't possible, like dropping a group into
 * itself. `start` is where the moved element now begins.
 */
export function moveElement(markup: string, from: TagRange, to: TagRange, place: DropPlace) {
  if (to.start >= from.start && to.end <= from.end) return null
  const text = markup.slice(from.start, from.end)
  const own = lineStarted(markup, from.start)
  let at: number, ins: string, offset: number
  if (place === "inside") {
    if (to.end === to.tagEnd) return null
    const close = markup.lastIndexOf("</", to.end - 1)
    if (close < to.tagEnd) return null
    const ls = markup.lastIndexOf("\n", close - 1) + 1
    if (own && /^[ \t]*$/.test(markup.slice(ls, close))) {
      const indent = indentAt(markup, to.start) + "  "
      at = ls; ins = `${indent}${text}\n`; offset = indent.length
    } else { at = close; ins = text; offset = 0 }
  } else if (place === "before") {
    at = to.start
    if (own && lineStarted(markup, to.start)) { ins = `${text}\n${indentAt(markup, to.start)}`; offset = 0 }
    else { ins = text; offset = 0 }
  } else {
    at = to.end
    if (own && lineStarted(markup, to.start)) { const pre = `\n${indentAt(markup, to.start)}`; ins = pre + text; offset = pre.length }
    else { ins = text; offset = 0 }
  }
  const [rs, re] = removalSpan(markup, from)
  if (at > rs && at < re) return null
  if (at <= rs) return { markup: markup.slice(0, at) + ins + markup.slice(at, rs) + markup.slice(re), start: at + offset }
  return { markup: markup.slice(0, rs) + markup.slice(re, at) + ins + markup.slice(at), start: at - (re - rs) + offset }
}


// ── Moving ────────────────────────────────────────────────────────────────────

const plainNumber = (v: string | null) => v === null || /^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*(px)?\s*$/i.test(v)
const num = (v: string | null) => (v === null ? 0 : parseFloat(v) || 0)

/** The attribute changes that move an element by (dx, dy) in its parent's units */
export function translateAttrs(el: Element, dx: number, dy: number): Record<string, string | null> {
  const tf = el.getAttribute("transform")
  const viaTransform = () => {
    // Fold into a translate that's already at the front
    const m = tf?.match(/^\s*translate\(\s*([+-]?[\d.e-]+)(?:[\s,]+([+-]?[\d.e-]+))?\s*\)\s*(.*)$/i)
    if (m) {
      const x = num(m[1]) + dx, y = num(m[2] ?? "0") + dy
      return { transform: `translate(${fmt(x)} ${fmt(y)})${m[3] ? ` ${m[3]}` : ""}` }
    }
    return { transform: `translate(${fmt(dx)} ${fmt(dy)})${tf ? ` ${tf.trim()}` : ""}` }
  }
  if (tf) return viaTransform()
  const shift = (names: [string, number][]) => {
    if (!names.every(([n]) => plainNumber(el.getAttribute(n)))) return null
    return Object.fromEntries(names.map(([n, d]) => [n, fmt(num(el.getAttribute(n)) + d)]))
  }
  let out: Record<string, string> | null = null
  switch (el.localName) {
    case "path": {
      try {
        const segs = parsePath(el.getAttribute("d") ?? "")
        return { d: serialisePath(shiftPoints(segs, allAnchors(segs), dx, dy)) }
      } catch { return viaTransform() }
    }
    case "rect": case "image": case "use": case "foreignObject": case "svg": out = shift([["x", dx], ["y", dy]]); break
    case "circle": case "ellipse": out = shift([["cx", dx], ["cy", dy]]); break
    case "line": out = shift([["x1", dx], ["y1", dy], ["x2", dx], ["y2", dy]]); break
    case "polyline": case "polygon": {
      const nums = (el.getAttribute("points") ?? "").match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g)?.map(Number) ?? []
      const pts: string[] = []
      for (let k = 0; k + 1 < nums.length; k += 2) pts.push(`${fmt(nums[k] + dx)},${fmt(nums[k + 1] + dy)}`)
      return { points: pts.join(" ") }
    }
  }
  return out ?? viaTransform()
}

// ── Grouping ──────────────────────────────────────────────────────────────────

/** Wraps elements (sorted, none inside another) in a new <g> where the first was */
export function groupElements(markup: string, rs: TagRange[]) {
  if (!rs.length) return null
  const sorted = [...rs].sort((a, b) => a.start - b.start)
  const first = sorted[0]
  const texts = sorted.map((r) => markup.slice(r.start, r.end))
  const own = lineStarted(markup, first.start)
  const indent = indentAt(markup, first.start)
  const group = own
    ? `<g>\n${texts.map((t) => `${indent}  ${t}`).join("\n")}\n${indent}</g>`
    : `<g>${texts.join("")}</g>`
  let out = markup
  for (const r of sorted.slice(1).reverse()) out = removeElement(out, r)
  out = out.slice(0, first.start) + group + out.slice(first.end)
  return { markup: out, start: first.start }
}

/** Group attributes that can't simply move down onto the children */
const UNGROUP_BLOCKERS = ["opacity", "filter", "mask", "clip-path", "style"]

/**
 * Takes a group's children out of it. Its transform and paint attributes move
 * down onto each child (a child's own value wins). Returns null, with a
 * reason, when that would change how things look.
 */
export function ungroupElement(markup: string, g: TagRange, el: Element, kids: TagRange[]): { markup: string } | { error: string } {
  const blocker = UNGROUP_BLOCKERS.find((a) => el.hasAttribute(a))
  if (blocker) return { error: `This group has ${blocker === "style" ? "a style attribute" : `a ${blocker}`}, which would look different spread over its children` }
  const tf = el.getAttribute("transform")
  const cls = el.getAttribute("class")
  const inherit = [...el.attributes].filter((a) => !["id", "class", "transform"].includes(a.name) && !a.name.startsWith("xmlns"))
  let out = markup
  // Back to front, so earlier offsets stay put
  for (const k of [...kids].sort((a, b) => b.start - a.start)) {
    const tag = out.slice(k.start, k.tagEnd)
    const attrs: Record<string, string | null> = {}
    const own = (name: string) => tag.match(attrRe(name))?.[0].replace(/^[^=]*=\s*["']|["']$/g, "") ?? null
    if (tf) { const t = own("transform"); attrs.transform = t ? `${tf.trim()} ${t.trim()}` : tf.trim() }
    if (cls) { const c = own("class"); attrs.class = c ? `${cls} ${c}` : cls }
    for (const a of inherit) if (own(a.name) === null) attrs[a.name] = a.value
    out = out.slice(0, k.start) + tagWithAttrs(tag, attrs) + out.slice(k.tagEnd)
  }
  const grown = out.length - markup.length
  const end = g.end + grown
  const close = out.lastIndexOf("</", end - 1)
  // The end tag first (it's later), then the start tag, each with its line if alone
  out = cutTag(out, close, end)
  out = cutTag(out, g.start, g.tagEnd)
  return { markup: out }
}

/** Removes a tag, and its line when nothing else is on it */
function cutTag(markup: string, a: number, b: number) {
  let s = a, e = b
  while (s > 0 && (markup[s - 1] === " " || markup[s - 1] === "\t")) s--
  let t = e
  while (t < markup.length && (markup[t] === " " || markup[t] === "\t")) t++
  if ((s === 0 || markup[s - 1] === "\n") && (markup[t] === "\n" || t >= markup.length)) return markup.slice(0, s) + markup.slice(Math.min(t + 1, markup.length))
  return markup.slice(0, a) + markup.slice(b)
}

/**
 * Splits a path with several shapes in it into one path per shape, inside a
 * <g> that takes the original's id. Each part keeps every other attribute.
 */
export function breakApart(markup: string, r: TagRange, el: Element) {
  let parts
  try { parts = splitSubpaths(parsePath(el.getAttribute("d") ?? "")) } catch { return null }
  if (parts.length < 2) return null
  const tag = markup.slice(r.start, r.tagEnd)
  const id = el.getAttribute("id")
  const kids = markup.slice(r.tagEnd, r.end).replace(/<\/path\s*>$/, "")
  const own = lineStarted(markup, r.start)
  const indent = indentAt(markup, r.start)
  const pieces = parts.map((p) => {
    let t = tagWithAttrs(tag, { d: serialisePath(p), id: null })
    if (!t.endsWith("/>")) t = t.replace(/>$/, "/>")
    return t
  })
  const open = id ? `<g id="${escapeAttr(id)}">` : "<g>"
  // Anything that was inside the path (a <title>, say) goes on the group
  const inner = [kids.trim(), ...pieces].filter(Boolean)
  const group = own
    ? `${open}\n${inner.map((t) => `${indent}  ${t}`).join("\n")}\n${indent}</g>`
    : `${open}${inner.join("")}</g>`
  return { markup: markup.slice(0, r.start) + group + markup.slice(r.end), start: r.start, parts: parts.length }
}
