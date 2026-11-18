// ── Why isn't my preview CSS showing on After? ────────────────────────────────
// Preview CSS is applied to the optimised file exactly as to the original, but
// SVGO often removes or renames the very things a selector targets (ids,
// classes, <rect>s, colour values). This finds selectors that match the
// original and nothing in the optimised file, and names the likely plugin.

export interface CssWarning {
  selector: string
  /** Files where it matches before optimising and not after */
  files: number
  hint: string
}

const SHAPE_TAGS = /(^|[\s>+~(,])(rect|circle|ellipse|line|polyline|polygon)(?![\w-])/

function hintFor(sel: string) {
  if (sel.includes("#")) return "Clean up IDs removes ids nothing in the file uses and shortens the rest. Turn it off in the SVGO plugins to keep them."
  if (SHAPE_TAGS.test(sel)) return "Shapes to paths turns rect, circle, ellipse, line and polygon into <path>. Target path, or turn that plugin off."
  if (sel.includes(".")) return "Inline styles moves the file's own class styles onto the elements and drops the class. Merge paths and Collapse useless groups can remove the element too."
  if (sel.includes("[")) return "SVGO rewrites attribute values: Minify colours shortens colours (#FF0000 → red), Remove unknowns & defaults drops default values."
  if (/(^|[\s>+~])g(?![\w-])/.test(sel)) return "Collapse useless groups removes groups that don't do anything."
  return "SVGO removed or changed the elements it matched."
}

/** Plain selectors from the CSS, skipping at-rules, keyframes and :root */
export function selectorsOf(css: string) {
  const out = new Set<string>()
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "")
  const re = /([^{};]+)\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(clean))) {
    const text = m[1].trim()
    if (!text || text.startsWith("@") || /^(from|to|\d+%)/.test(text)) continue
    for (const s of text.split(",")) {
      const sel = s.trim()
      if (sel && !/^:root$|^svg$|^\*$/.test(sel)) out.add(sel)
    }
  }
  return [...out]
}

const parse = (markup: string) => {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml")
  return doc.querySelector("parsererror") ? null : doc
}

const count = (doc: Document, sel: string) => {
  try { return doc.querySelectorAll(sel).length } catch { return -1 }
}

export function checkPreviewCss(css: string, pairs: Array<{ source: string, output: string }>, limit = 150): CssWarning[] {
  const selectors = selectorsOf(css)
  if (!selectors.length) return []
  const lost = new Map<string, number>()
  for (const { source, output } of pairs.slice(0, limit)) {
    const a = parse(source), b = parse(output)
    if (!a || !b) continue
    for (const sel of selectors) {
      if (count(a, sel) > 0 && count(b, sel) === 0) lost.set(sel, (lost.get(sel) ?? 0) + 1)
    }
  }
  return [...lost].map(([selector, files]) => ({ selector, files, hint: hintFor(selector) }))
}
