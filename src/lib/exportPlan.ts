import type { SvgItem } from "./types"

// ── Export planning ───────────────────────────────────────────────────────────

/**
 * Works out where each file lands inside the export folder. Flattened exports
 * get a numeric suffix when two files share a name, so nothing is silently lost.
 */
export function planExport(items: SvgItem[], keepStructure: boolean, names?: Map<string, string>) {
  const used = new Set<string>()
  return items.map((item) => {
    const name = names?.get(item.id) ?? item.name
    const dir = item.relPath.includes("/") ? item.relPath.slice(0, item.relPath.lastIndexOf("/") + 1) : ""
    const wanted = keepStructure ? dir + name : name
    let rel = wanted
    let n = 2
    while (used.has(rel.toLowerCase())) {
      rel = wanted.replace(/(\.svg)$/i, `-${n++}$1`)
    }
    used.add(rel.toLowerCase())
    return { item, relPath: rel }
  })
}
