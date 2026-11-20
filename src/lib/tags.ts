import { fmtNum } from "./svgRoot"
import type { GeometryEffect, SvgItem, SvgoSettings } from "./types"
import { plural } from "./format"
import { activeCutMatchers } from "./settings"

// ── What's been done to a file, as short tags ─────────────────────────────────

export interface FileTag {
  label: string
  title: string
  tone?: "accent" | "warning"
}

export function fileTags(item: SvgItem, settings: SvgoSettings, customOn: number): FileTag[] {
  const t = settings.trim
  const tags: FileTag[] = []
  if (item.config) tags.push({ label: "Custom settings", title: "This file uses its own settings, not a preset", tone: "accent" })
  if (item.fileSource !== undefined && item.source !== item.fileSource) {
    tags.push({ label: "Markup edited", title: "Edited in SVGenius. The original file isn't touched", tone: "warning" })
  }
  if (item.result?.replaced) {
    tags.push({ label: plural(item.result.replaced, "rule change"), title: "Find & replace and attribute rule changes made to this file" })
  }
  if (t.enabled) tags.push({ label: "Trimmed", title: `Whitespace trimmed, padding ${fmtNum(t.padding, 2)}${t.unit}` })
  if (t.sizeUnit === "px") tags.push({ label: `${t.sizeSide === "width" ? "Width" : "Height"} ${fmtNum(t.sizePx, 2)}px`, title: "Exported at a fixed size, the other side follows the aspect ratio" })
  else if (t.scale !== 1) tags.push({ label: `Size ${fmtNum(t.scale * 100, 2)}%`, title: "Width and height scaled" })
  if (t.artScale !== 1) tags.push({ label: `Artwork ×${fmtNum(t.artScale, 4)}`, title: "Artwork scaled inside the viewBox" })
  if (t.offsetX || t.offsetY) {
    tags.push({ label: "Artwork moved", title: `Moved ${fmtNum(t.offsetX, 2)}% across, ${fmtNum(t.offsetY, 2)}% down` })
  }
  // Once optimised, only claim what actually changed the file
  const did = (e: GeometryEffect, on: boolean) => on && (!item.result?.effects || item.result.effects.includes(e))
  if (did("flatten", settings.flattenTransforms)) tags.push({ label: "Flattened transforms", title: "Transforms baked into the path data" })
  const shapes = activeCutMatchers(settings).length
  if (did("cutouts", settings.cutOutStrokes || shapes > 0)) {
    const what = [settings.cutOutStrokes && "strokes", shapes > 0 && "matching shapes"].filter(Boolean).join(" and ")
    tags.push({ label: "Cut-outs", title: `Covering ${what} turned into real holes` })
  }
  if (did("centre", settings.opticalCentre)) tags.push({ label: "Optically centred", title: `Artwork moved so its visual weight sits in the middle (strength ${settings.opticalStrength}%)` })
  if (settings.autoPrecision && item.result?.precision !== undefined) {
    tags.push({ label: `Precision ${item.result.precision}`, title: `Auto precision picked ${item.result.precision} decimal place${item.result.precision === 1 ? "" : "s"} (max ${settings.floatPrecision})` })
  }
  if (did("merge", settings.mergePaths)) tags.push({ label: "Merged paths", title: "Shapes sharing a fill and opacity were joined into one path" })
  if (settings.appendMarkup.trim()) tags.push({ label: "Extra markup", title: "Markup added before </svg>" })
  if (customOn) tags.push({ label: plural(customOn, "custom plugin"), title: "Third-party SVGO plugins switched on" })
  return tags
}
