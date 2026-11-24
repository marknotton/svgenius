import type { RenameSettings, SvgItem } from "./types"

// ── Export file names ─────────────────────────────────────────────────────────

export const CASES: Array<{ value: RenameSettings["case"], label: string, example: string }> = [
  { value: "keep", label: "Keep", example: "My Icon_2" },
  { value: "lower", label: "lowercase", example: "my icon_2" },
  { value: "upper", label: "UPPERCASE", example: "MY ICON_2" },
  { value: "kebab", label: "kebab-case", example: "my-icon-2" },
  { value: "snake", label: "snake_case", example: "my_icon_2" },
  { value: "camel", label: "camelCase", example: "myIcon2" },
  { value: "pascal", label: "PascalCase", example: "MyIcon2" },
  { value: "title", label: "Title Case", example: "My Icon 2" }
]

export function defaultRename(): RenameSettings {
  return {
    enabled: false,
    base: "",
    prefix: "",
    suffix: "",
    case: "keep",
    index: "none",
    pad: true,
    start: 1,
    scope: "all",
    separator: "-"
  }
}

/** Splits "myIcon_2 final" into ["my", "Icon", "2", "final"] */
function words(s: string) {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()

export function applyCase(s: string, c: RenameSettings["case"]) {
  switch (c) {
    case "lower": return s.toLowerCase()
    case "upper": return s.toUpperCase()
    case "kebab": return words(s).map((w) => w.toLowerCase()).join("-")
    case "snake": return words(s).map((w) => w.toLowerCase()).join("_")
    case "camel": return words(s).map((w, i) => (i ? cap(w) : w.toLowerCase())).join("")
    case "pascal": return words(s).map(cap).join("")
    case "title": return words(s).map(cap).join(" ")
    default: return s
  }
}

const dirOf = (relPath: string) => (relPath.includes("/") ? relPath.slice(0, relPath.lastIndexOf("/")) : "")

/** Characters macOS and Windows both reject in file names */
const safe = (s: string) => s.replace(/[/\\:*?"<>|]+/g, "-").trim()

/**
 * New file names (with .svg) for the given items, in list order. Numbering runs
 * across all of them, or restarts in each folder.
 */
export function exportNames(items: SvgItem[], r: RenameSettings) {
  const names = new Map<string, string>()
  if (!r.enabled) {
    for (const i of items) names.set(i.id, i.name)
    return names
  }
  const groups = new Map<string, SvgItem[]>()
  for (const i of items) {
    const key = r.scope === "folder" ? dirOf(i.relPath) : ""
    const g = groups.get(key)
    if (g) g.push(i)
    else groups.set(key, [i])
  }
  for (const group of groups.values()) {
    const last = r.start + group.length - 1
    const width = r.pad ? Math.max(2, String(last).length) : 0
    group.forEach((item, n) => {
      const original = item.name.replace(/\.svg$/i, "")
      const num = String(r.start + n).padStart(width, "0")
      let name = r.base.trim() ? r.base.trim().replaceAll("{name}", original) : original
      name = applyCase(`${r.prefix}${name}${r.suffix}`, r.case)
      if (r.index === "prefix") name = `${num}${r.separator}${name}`
      if (r.index === "suffix") name = `${name}${r.separator}${num}`
      if (r.index === "only") name = num
      names.set(item.id, `${safe(name) || "untitled"}.svg`)
    })
  }
  return names
}
