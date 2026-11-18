import { fmtNum } from "./svgRoot"
import type { SvgItem, SvgoSettings } from "./types"
import { plural } from "./format"

// ── What's been done to a file, as short tags ─────────────────────────────────

export interface FileTag {
  label: string
  title: string
  tone?: "accent" | "warning"
}

export function fileTags(item: SvgItem, settings: SvgoSettings, customOn: number): FileTag[] {
  const t = settings.trim
  const tags: FileTag[] = []
  if (item.config) tags.push({ label: "Own settings", title: "This file uses its own settings, not a preset", tone: "accent" })
  if (item.fileSource !== undefined && item.source !== item.fileSource) {
    tags.push({ label: "Markup edited", title: "Edited in SVGenius. The original file isn't touched", tone: "warning" })
  }
  if (item.result?.replaced) {
    tags.push({ label: plural(item.result.replaced, "rule change"), title: "Find & replace and attribute rule changes made to this file" })
  }
  if (t.enabled) tags.push({ label: "Trimmed", title: `Whitespace trimmed, padding ${fmtNum(t.padding, 2)}${t.unit}` })
  if (t.scale !== 1) tags.push({ label: `Size ×${fmtNum(t.scale, 4)}`, title: "Width and height multiplied" })
  if (t.artScale !== 1) tags.push({ label: `Artwork ×${fmtNum(t.artScale, 4)}`, title: "Artwork scaled inside the viewBox" })
  if (t.offsetX || t.offsetY) {
    tags.push({ label: "Artwork moved", title: `Moved ${fmtNum(t.offsetX, 2)}% across, ${fmtNum(t.offsetY, 2)}% down` })
  }
  if (settings.mergePaths) tags.push({ label: "Merged paths", title: "Shapes sharing a fill and opacity were joined into one path" })
  if (settings.appendMarkup.trim()) tags.push({ label: "Extra markup", title: "Markup added before </svg>" })
  if (customOn) tags.push({ label: plural(customOn, "custom plugin"), title: "Third-party SVGO plugins switched on" })
  return tags
}
