import { fmtNum } from "./svgRoot"
import { GROUP_LABELS, isIdentity, MAGIC_LABELS, magicGroup, ratioText, ruleName, scalesOf } from "./designPrinciples"
import { viewBoxSize } from "./filters"
import type { GeometryEffect, SvgItem, SvgoSettings } from "./types"
import { plural } from "./format"
import { activeCutMatchers } from "./settings"

// ── What's been done to a file, as short tags ─────────────────────────────────

export interface FileTag {
  label: string
  title: string
  tone?: "accent" | "warning" | "tuned"
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
  if (settings.grid && settings.grid.fit !== "none") tags.push({ label: `Grid ${fmtNum(settings.grid.width, 2)}×${fmtNum(settings.grid.height, 2)}`, title: "Fitted to a design principle's canvas and live area" })
  const m = item.result?.magic
  if (m && settings.magicKeylines?.enabled) {
    const fit = m.fit === "contain" ? "fitted inside it" : m.fit === "stretch" ? "stretched to fill it" : `fitted to its ${m.fit}`
    const tol = m.tolerance ?? 10
    const shape = (w: number, h: number) => `${fmtNum(w, 2)} × ${fmtNum(h, 2)} (${magicGroup(w, h, tol)}${Math.abs(w - h) > 1e-9 ? `, ${ratioText(w, h)}` : ""})`
    const vb = viewBoxSize(item.source)
    const why = [m.w && m.h ? `Artwork ${shape(m.w, m.h)}` : "", vb ? `viewBox ${shape(vb.w, vb.h)}` : ""].filter(Boolean).join(" · ")
    const where = m.keyline === "canvas" ? "the whole canvas (viewBox)" : m.keyline === "live" ? "the live area" : `the ${MAGIC_LABELS[m.keyline].toLowerCase()} keyline`
    const fitName = m.fit === "contain" ? "fit inside" : m.fit === "stretch" ? "stretched" : `fit ${m.fit}`
    tags.push({
      label: m.rule ? `${ruleName(m)}: ${m.ruleText} → ${MAGIC_LABELS[m.keyline]}, ${fitName}` : `Keyline: ${GROUP_LABELS[m.group]} → ${MAGIC_LABELS[m.keyline]}`,
      title: `Smart Sizing${m.rule ? `, ${ruleName(m).toLowerCase()}: ${m.ruleText}` : ""}: ${GROUP_LABELS[m.group].toLowerCase()} artwork goes in ${where}, ${fit}.${why ? `\n${why}. Square means within ±${fmtNum(tol, 2)}%, measured on the artwork` : ""}${m.fallback ? "\nThe rule's keyline isn't in this design principle, so the closest one stood in" : ""}`,
      tone: m.fallback ? "warning" : "accent"
    })
  }
  if (t.artUnit === "px") tags.push({ label: `Artwork ${t.artSide === "width" ? "W" : "H"} ${fmtNum(t.artSizePx ?? 0, 2)}px`, title: "Artwork scaled to an exact size inside the viewBox" })
  else if (t.artScale !== 1) tags.push({ label: `Artwork ×${fmtNum(t.artScale, 4)}`, title: "Artwork scaled inside the viewBox" })
  if (!isIdentity(item.adjust)) {
    const { X, Y } = scalesOf(item.adjust!)
    const turn = item.adjust!.r ? `, turned ${fmtNum(item.adjust!.r, 2)}°` : ""
    tags.push({ label: "Tuned", title: `Placed in Quick Edit: ${X === Y ? `×${fmtNum(X, 4)}` : `×${fmtNum(X, 4)} across, ×${fmtNum(Y, 4)} down`}${turn}, moved ${fmtNum(item.adjust!.x, 3)} across, ${fmtNum(item.adjust!.y, 3)} down`, tone: "tuned" })
  }
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
