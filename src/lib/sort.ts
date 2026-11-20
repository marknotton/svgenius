import { FLAGS } from "./filters"
import { countNodes } from "./complexity"
import { getAttr, parseViewBox, rootTag, svgSize } from "./svgRoot"
import type { AppSettings, SvgItem } from "./types"

// ── Sorting the list ──────────────────────────────────────────────────────────
// Applied after search and filters. "As added" keeps the list's own order.
// Grouping by flag puts each flag colour together (in the flag menu's order,
// unflagged last) and sorts inside each group.

export type SortKey = "added" | "name" | "folder" | "size" | "saving" | "viewbox" | "nodes" | "updated" | "preset"

export interface SortState {
  key: SortKey
  desc: boolean
  byFlag: boolean
  /** Size, viewBox and nodes from the original markup instead of the optimised */
  original: boolean
}

export const SORT_DEFAULT: SortState = { key: "added", desc: false, byFlag: false, original: false }

export const SORT_KEYS: Array<{ value: SortKey, label: string, short: string }> = [
  { value: "added", label: "As added", short: "As added" },
  { value: "name", label: "File name", short: "Name" },
  { value: "folder", label: "Folder name", short: "Folder" },
  { value: "size", label: "File size", short: "Size" },
  { value: "saving", label: "Saving", short: "Saving" },
  { value: "viewbox", label: "viewBox size", short: "viewBox" },
  { value: "nodes", label: "Node count", short: "Nodes" },
  { value: "updated", label: "Last updated", short: "Updated" },
  { value: "preset", label: "Preset (default, others, own settings)", short: "Preset" }
]

const KEY = "svgenius:sort"
export const sortStore = {
  get: (): SortState => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? "null")
      if (v && SORT_KEYS.some((k) => k.value === v.key)) return { key: v.key, desc: !!v.desc, byFlag: !!v.byFlag, original: !!v.original }
    } catch { /* unavailable */ }
    return SORT_DEFAULT
  },
  set: (s: SortState) => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* unavailable */ } }
}

const collator = new Intl.Collator("en-GB", { numeric: true, sensitivity: "base" })
const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "")

function viewBoxArea(svg: string | undefined): number {
  if (!svg) return 0
  const tag = rootTag(svg)
  const vb = tag ? parseViewBox(getAttr(tag, "viewBox")) : null
  if (vb) return vb.w * vb.h
  const s = svgSize(svg)
  return s ? s.w * s.h : 0
}

export function sortItems(list: SvgItem[], sort: SortState, settings: AppSettings): SvgItem[] {
  if (sort.key === "added" && !sort.byFlag) return list
  const order = new Map(list.map((i, n) => [i.id, n]))
  const flagRank = (i: SvgItem) => { const n = FLAGS.findIndex((f) => f.value === i.flag); return n < 0 ? FLAGS.length : n }
  const presetNames = new Map(settings.presets.map((p) => [p.id, p.name]))
  // Default preset first, then the others by name, then files with their own settings
  const presetRank = (i: SvgItem): [number, string] => {
    if (i.config) return [2, ""]
    const id = i.presetId ?? settings.defaultPresetId
    return id === settings.defaultPresetId ? [0, ""] : [1, presetNames.get(id) ?? ""]
  }
  /** Sorting by these reads the markup, so Before or After matters */
  const cache = new Map<string, number>()
  const memo = (i: SvgItem, k: string, f: () => number) => {
    const key = `${k}:${i.id}`
    let v = cache.get(key)
    if (v === undefined) { v = f(); cache.set(key, v) }
    return v
  }
  const shown = (i: SvgItem) => (sort.original ? i.source : i.result?.output ?? i.source)
  const compare = (a: SvgItem, b: SvgItem): number => {
    switch (sort.key) {
      case "name": return collator.compare(a.name, b.name)
      case "folder": return collator.compare(dirOf(a.relPath), dirOf(b.relPath)) || collator.compare(a.name, b.name)
      case "size": return sort.original ? a.size - b.size : (a.result?.size ?? a.size) - (b.result?.size ?? b.size)
      case "saving": return (a.result ? a.size - a.result.size : 0) - (b.result ? b.size - b.result.size : 0)
      case "viewbox": return memo(a, "vb", () => viewBoxArea(shown(a))) - memo(b, "vb", () => viewBoxArea(shown(b)))
      case "nodes": return memo(a, "n", () => countNodes(shown(a))) - memo(b, "n", () => countNodes(shown(b)))
      case "updated": return Math.max(a.editedAt ?? 0, a.mtime ?? 0) - Math.max(b.editedAt ?? 0, b.mtime ?? 0)
      case "preset": {
        const [ra, na] = presetRank(a), [rb, nb] = presetRank(b)
        return ra - rb || collator.compare(na, nb)
      }
      default: return 0
    }
  }
  const dir = sort.desc ? -1 : 1
  return [...list].sort((a, b) =>
    (sort.byFlag ? flagRank(a) - flagRank(b) : 0)
    || dir * compare(a, b)
    || (order.get(a.id)! - order.get(b.id)!))
}

/** Keys whose values differ between the original and the optimised markup */
export const BEFORE_AFTER_KEYS: SortKey[] = ["size", "viewbox", "nodes"]
