// ── Where each element sits in the markup ─────────────────────────────────────
// Start tags in document order line up with a parsed document's elements in
// tree order, so element n in the DOM is tag n here.

export interface TagRange {
  /** Offset of "<" */
  start: number
  /** Offset just after the start tag's ">" */
  tagEnd: number
  /** Offset just after the element's end tag (or the self-closing tag) */
  end: number
}

export function elementRanges(src: string): TagRange[] {
  const out: TagRange[] = []
  const stack: number[] = []
  let i = 0
  const n = src.length
  while (i < n) {
    const lt = src.indexOf("<", i)
    if (lt < 0) break
    if (src.startsWith("<!--", lt)) { const e = src.indexOf("-->", lt + 4); i = e < 0 ? n : e + 3; continue }
    if (src.startsWith("<![CDATA[", lt)) { const e = src.indexOf("]]>", lt + 9); i = e < 0 ? n : e + 3; continue }
    if (src.startsWith("<?", lt)) { const e = src.indexOf("?>", lt + 2); i = e < 0 ? n : e + 2; continue }
    if (src.startsWith("<!", lt)) {
      // Doctype, possibly with an internal subset in [ ]
      let j = lt + 2, depth = 0
      while (j < n && !(src[j] === ">" && depth === 0)) { if (src[j] === "[") depth++; else if (src[j] === "]") depth--; j++ }
      i = j + 1
      continue
    }
    if (src[lt + 1] === "/") {
      const e = src.indexOf(">", lt)
      const open = stack.pop()
      if (open !== undefined) out[open].end = e < 0 ? n : e + 1
      i = e < 0 ? n : e + 1
      continue
    }
    if (!/[A-Za-z_:]/.test(src[lt + 1] ?? "")) { i = lt + 1; continue }
    // Find the tag's end, skipping quoted attribute values
    let j = lt + 1, quote = ""
    while (j < n) {
      const c = src[j]
      if (quote) { if (c === quote) quote = "" } else if (c === "\"" || c === "'") quote = c
      else if (c === ">") break
      j++
    }
    const tagEnd = Math.min(n, j + 1)
    const selfClosing = src[j - 1] === "/"
    out.push({ start: lt, tagEnd, end: selfClosing ? tagEnd : n })
    if (!selfClosing) stack.push(out.length - 1)
    i = tagEnd
  }
  return out
}

/** The innermost element containing an offset */
export function rangeAt(ranges: TagRange[], offset: number) {
  let best = -1
  ranges.forEach((r, k) => { if (r.start <= offset && offset < r.end) best = k })
  return best
}
