import type { TagRange } from "./markupMap"
import { SHAPE_ATTRS, shapeToPathData } from "./pathData"

// ── Small surgical edits to markup ────────────────────────────────────────────
// Everything outside the touched element stays byte for byte as it was.

const escapeAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

/** Sets (or adds) an attribute on the element's start tag */
export function setAttr(markup: string, r: TagRange, name: string, value: string) {
  const tag = markup.slice(r.start, r.tagEnd)
  const re = new RegExp(`(\\s${name}\\s*=\\s*)(["'])[\\s\\S]*?\\2`)
  const next = re.test(tag)
    ? tag.replace(re, (_m, pre: string) => `${pre}"${escapeAttr(value)}"`)
    : tag.replace(/\s*(\/?)>$/, (_m, slash: string) => ` ${name}="${escapeAttr(value)}"${slash ? " /" : ""}>`)
  return markup.slice(0, r.start) + next + markup.slice(r.tagEnd)
}

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
