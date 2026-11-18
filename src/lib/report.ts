import { CASES } from "./rename"
import { activeCutMatchers } from "./settings"
import { fmtNum, svgSize } from "./svgRoot"
import { formatBytes, formatSaving, plural } from "./format"
import type { GeometryEffect, RenameSettings, SvgItem, SvgoSettings } from "./types"

// ── Work report ───────────────────────────────────────────────────────────────
// A plain-text log of what was done, to copy into notes or send to a client.

export interface ReportEntry {
  item: SvgItem
  settings: SvgoSettings
  preset: string
  /** The exported file name, when renaming is on */
  exportName?: string
  tags: string[]
  stale: boolean
}

export type ReportFormat = "list" | "table"

export interface ReportColumns {
  names: boolean
  sizes: boolean
  dimensions: boolean
  preset: boolean
  changes: boolean
}

const today = () => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
const stamp = () => new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
const dims = (svg?: string) => {
  const s = svgSize(svg)
  return s ? `${fmtNum(s.w, 2)} × ${fmtNum(s.h, 2)}` : ""
}
const done = (e: ReportEntry) => !!e.item.result && e.item.status !== "error"
/** "all 12 files" or "3 of 12 files" */
const howMany = (n: number, total: number) => (n === total ? (total === 1 ? "the file" : `all ${total} files`) : `${n} of ${total} files`)

function totals(entries: ReportEntry[]) {
  const ok = entries.filter(done)
  const before = ok.reduce((n, e) => n + e.item.size, 0)
  const after = ok.reduce((n, e) => n + (e.item.result?.size ?? 0), 0)
  return { ok, before, after }
}

// ── Detailed ──────────────────────────────────────────────────────────────────

export function detailedReport(entries: ReportEntry[], cols: ReportColumns, format: ReportFormat) {
  const { ok, before, after } = totals(entries)
  if (format === "table") return table(entries, cols)

  const lines = [`SVGenius report, ${stamp()}`]
  lines.push(ok.length
    ? `${plural(ok.length, "file")} optimised: ${formatBytes(before)} → ${formatBytes(after)}, saved ${formatBytes(before - after)} (${formatSaving(before, after)})`
    : "Nothing optimised yet")
  const failed = entries.filter((e) => e.item.status === "error").length
  if (failed) lines.push(`${plural(failed, "file")} failed`)
  lines.push("")

  entries.forEach((e, n) => {
    const { item } = e
    lines.push(`${n + 1}. ${item.relPath}`)
    if (cols.names && e.exportName && e.exportName !== item.name) lines.push(`   Exported as: ${e.exportName}`)
    if (item.status === "error") {
      lines.push(`   Failed: ${item.error ?? "unknown error"}`)
    } else if (!item.result) {
      lines.push("   Not optimised")
    } else {
      if (cols.sizes) lines.push(`   Size: ${formatBytes(item.size)} → ${formatBytes(item.result.size)} (${formatSaving(item.size, item.result.size)})`)
      if (cols.dimensions) {
        const a = dims(item.source), b = dims(item.result.output)
        if (a || b) lines.push(`   Dimensions: ${a === b ? a : `${a || "?"} → ${b || "?"}`}`)
      }
    }
    if (cols.preset) lines.push(`   Preset: ${e.preset}`)
    if (cols.changes && e.tags.length && item.status !== "error") lines.push(`   Changes: ${e.tags.join(", ")}`)
    if (e.stale && item.result) lines.push("   Note: settings changed since this was optimised")
    lines.push("")
  })
  return lines.join("\n").trimEnd()
}

/** Tab-separated, so it pastes straight into a spreadsheet */
function table(entries: ReportEntry[], cols: ReportColumns) {
  const head = ["File"]
  if (cols.names) head.push("Exported as")
  if (cols.sizes) head.push("Before", "After", "Saving")
  if (cols.dimensions) head.push("Dimensions before", "Dimensions after")
  if (cols.preset) head.push("Preset")
  if (cols.changes) head.push("Changes")
  head.push("Status")
  const rows = entries.map(({ item, ...e }) => {
    const r = [item.relPath]
    if (cols.names) r.push(e.exportName ?? item.name)
    if (cols.sizes) {
      r.push(formatBytes(item.size))
      r.push(item.result ? formatBytes(item.result.size) : "")
      r.push(item.result ? formatSaving(item.size, item.result.size) : "")
    }
    if (cols.dimensions) r.push(dims(item.source), dims(item.result?.output))
    if (cols.preset) r.push(e.preset)
    if (cols.changes) r.push(e.tags.join(", "))
    r.push(item.status === "error" ? `Failed: ${item.error ?? ""}` : item.result ? (e.stale ? "Out of date" : "Optimised") : "Not optimised")
    return r
  })
  return [head, ...rows].map((r) => r.map((c) => c.replace(/[\t\n]+/g, " ")).join("\t")).join("\n")
}

// ── Summary ───────────────────────────────────────────────────────────────────
// Short, past tense, plain English. What was done, not how.

export function summaryReport(entries: ReportEntry[], rename: RenameSettings) {
  const { ok, before, after } = totals(entries)
  if (!ok.length) return "Nothing has been optimised yet."
  const total = ok.length
  const count = (fn: (s: SvgoSettings, e: ReportEntry) => boolean) => ok.filter((e) => fn(e.settings, e)).length
  const out: string[] = []

  out.push(`Optimised ${plural(total, "SVG file")}, reducing the total size from ${formatBytes(before)} to ${formatBytes(after)} (${formatSaving(before, after).replace("−", "")} ${after <= before ? "smaller" : "larger"}).`)

  const trimmed = count((s) => s.trim.enabled)
  if (trimmed) out.push(`Trimmed the empty space around the artwork in ${howMany(trimmed, total)}, so each icon sits flush to its edges.`)

  const px = ok.filter((e) => e.settings.trim.sizeUnit === "px")
  if (px.length) {
    const sizes = [...new Set(px.map((e) => `${fmtNum(e.settings.trim.sizePx, 2)}px ${e.settings.trim.sizeSide === "width" ? "wide" : "tall"}`))]
    out.push(`Resized ${howMany(px.length, total)} to ${sizes.length === 1 ? sizes[0] : "consistent sizes"}.`)
  }
  const pct = count((s) => s.trim.sizeUnit !== "px" && s.trim.scale !== 1)
  if (pct) out.push(`Rescaled ${howMany(pct, total)}.`)
  const art = count((s) => s.trim.artScale !== 1 || !!s.trim.offsetX || !!s.trim.offsetY)
  if (art) out.push(`Adjusted the artwork's scale and position in ${howMany(art, total)}.`)

  const did = (fx: GeometryEffect) => (s: SvgoSettings, e: ReportEntry) => e.item.result?.effects
    ? e.item.result.effects.includes(fx)
    : fx === "flatten" ? s.flattenTransforms : fx === "merge" ? s.mergePaths : s.cutOutStrokes || activeCutMatchers(s).length > 0
  const flat = count(did("flatten"))
  if (flat) out.push(`Flattened transforms into the path data in ${howMany(flat, total)}.`)
  const cuts = count(did("cutouts"))
  if (cuts) out.push(`Replaced fake masking with real cut-outs in ${howMany(cuts, total)}.`)
  const merged = count(did("merge"))
  if (merged) out.push(`Merged overlapping shapes into single paths in ${howMany(merged, total)}.`)

  const ruled = ok.filter((e) => (e.item.result?.replaced ?? 0) > 0)
  if (ruled.length) {
    const n = ruled.reduce((sum, e) => sum + (e.item.result?.replaced ?? 0), 0)
    out.push(`Applied find and replace and attribute rules, making ${plural(n, "change")} across ${howMany(ruled.length, total)}.`)
  }
  const edited = count((_, e) => e.item.fileSource !== undefined && e.item.source !== e.item.fileSource)
  if (edited) out.push(`Hand-edited the markup of ${plural(edited, "file")}.`)
  const markup = count((s) => !!s.appendMarkup.trim())
  if (markup) out.push(`Added extra markup to ${howMany(markup, total)}.`)

  const renamed = ok.filter((e) => e.exportName && e.exportName !== e.item.name).length
  if (rename.enabled && renamed) out.push(`Renamed ${howMany(renamed, total)}${renameStyle(rename)}.`)

  const failed = entries.filter((e) => e.item.status === "error").length
  if (failed) out.push(`${plural(failed, "file")} couldn't be optimised and ${failed === 1 ? "was" : "were"} left out.`)

  return [`SVG optimisation, ${today()}`, "", ...out.map((l) => `• ${l}`)].join("\n")
}

function renameStyle(r: RenameSettings) {
  const extras: string[] = []
  if (r.prefix) extras.push(`a "${r.prefix}" prefix`)
  if (r.suffix) extras.push(`a "${r.suffix}" suffix`)
  if (r.index !== "none") extras.push(r.scope === "folder" ? "numbering per folder" : "numbering")
  const last = extras.pop()
  const withBits = last ? ` with ${extras.length ? `${extras.join(", ")} and ${last}` : last}` : ""
  const caseLabel = r.case !== "keep" ? CASES.find((c) => c.value === r.case)?.label : null
  if (caseLabel) return ` in ${caseLabel}${withBits}`
  return withBits || " to a consistent naming pattern"
}
