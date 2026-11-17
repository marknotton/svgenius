import type { SvgItem } from "./types"

// ── Export planning ───────────────────────────────────────────────────────────

/**
 * Works out where each file lands inside the export folder. Flattened exports
 * get a numeric suffix when two files share a name, so nothing is silently lost.
 */
export function planExport(items: SvgItem[], keepStructure: boolean) {
  const used = new Set<string>()
  return items.map((item) => {
    const wanted = keepStructure ? item.relPath : item.name
    let rel = wanted
    let n = 2
    while (used.has(rel.toLowerCase())) {
      rel = wanted.replace(/(\.svg)$/i, `-${n++}$1`)
    }
    used.add(rel.toLowerCase())
    return { item, relPath: rel }
  })
}
