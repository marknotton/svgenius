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
