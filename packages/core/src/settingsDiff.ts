import { isPluginOn } from "./settings"
import type { SvgoSettings, TrimSettings } from "./types"

// ── How far a file's own settings have moved from its preset ──────────────────
// Counted per section of the settings editor, so each heading can say how many
// of its settings differ, and put just that section back

export type DiffSection = "output" | "principle" | "contents" | "viewbox" | "replace" | "attrs" | "plugins" | "beta" | "custom"

type Field = keyof SvgoSettings
type TrimField = keyof TrimSettings

const FIELDS: Record<DiffSection, { fields?: Field[], trim?: TrimField[], lists?: Field[] }> = {
  output: { fields: ["multipass", "pretty", "autoPrecision", "floatPrecision", "autoTolerance"] },
  principle: { fields: ["designPrincipleId", "magicKeylines"] },
  contents: { fields: ["appendMarkup"], trim: ["artScale", "artUnit", "artSide", "artSizePx", "offsetX", "offsetY"] },
  viewbox: { trim: ["enabled", "padding", "unit", "aspect", "scale", "sizeUnit", "sizeSide", "sizePx"] },
  replace: { lists: ["replacements"] },
  attrs: { lists: ["attrRules"] },
  plugins: {},
  beta: { fields: ["flattenTransforms", "cutOutStrokes", "opticalCentre", "opticalStrength", "mergePaths"], lists: ["cutOutShapes"] },
  custom: {}
}

export const DIFF_SECTIONS = Object.keys(FIELDS) as DiffSection[]

/** Optional fields: missing and their default mean the same thing */
const TRIM_DEFAULTS: Partial<TrimSettings> = { artUnit: "x", artSide: "height" }
const norm = (v: unknown) => (v === undefined ? null : v)

/** Deep equality for plain settings data (key order doesn't matter) */
export function same(a: unknown, b: unknown): boolean {
  a = norm(a); b = norm(b)
  if (a === b) return true
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((x, i) => same(x, (b as unknown[])[i]))
  const ka = Object.keys(a).filter((k) => norm((a as Record<string, unknown>)[k]) !== null)
  const kb = Object.keys(b).filter((k) => norm((b as Record<string, unknown>)[k]) !== null)
  return ka.length === kb.length && ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
}

/** A list's rules, ignoring ids (a copied preset gets the same ones, a re-added rule may not) */
const listCount = (a: unknown[] = [], b: unknown[] = []) => {
  const strip = (r: unknown) => (r && typeof r === "object" ? { ...(r as object), id: undefined } : r)
  let n = 0
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (!same(strip(a[i]), strip(b[i]))) n++
  return n
}

const customOf = (s: SvgoSettings, id: string) => ({ on: s.custom?.[id]?.on ?? false, params: s.custom?.[id]?.on ? s.custom[id].params ?? "" : "" })

/** How many settings in a section differ from the preset */
export function sectionDiff(s: SvgoSettings, base: SvgoSettings, section: DiffSection): number {
  if (section === "plugins") {
    const names = new Set([...Object.keys(s.plugins), ...Object.keys(base.plugins)])
    return [...names].filter((n) => isPluginOn(s, n) !== isPluginOn(base, n)).length
  }
  if (section === "custom") {
    const ids = new Set([...Object.keys(s.custom ?? {}), ...Object.keys(base.custom ?? {})])
    return [...ids].filter((id) => !same(customOf(s, id), customOf(base, id))).length
  }
  const f = FIELDS[section]
  let n = 0
  for (const k of f.fields ?? []) if (!same(s[k], base[k])) n++
  for (const k of f.trim ?? []) if (!same(s.trim[k] ?? TRIM_DEFAULTS[k], base.trim[k] ?? TRIM_DEFAULTS[k])) n++
  for (const k of f.lists ?? []) n += listCount(s[k] as unknown[], base[k] as unknown[])
  return n
}

export function settingsDiff(s: SvgoSettings, base: SvgoSettings): Record<DiffSection, number> {
  return Object.fromEntries(DIFF_SECTIONS.map((k) => [k, sectionDiff(s, base, k)])) as Record<DiffSection, number>
}

/** The file's settings with one section put back to the preset's */
export function revertSection(s: SvgoSettings, base: SvgoSettings, section: DiffSection): SvgoSettings {
  const f = FIELDS[section]
  const out: SvgoSettings = { ...s }
  if (section === "plugins") out.plugins = structuredClone(base.plugins)
  if (section === "custom") out.custom = structuredClone(base.custom ?? {})
  for (const k of [...(f.fields ?? []), ...(f.lists ?? [])]) (out as unknown as Record<string, unknown>)[k] = structuredClone(base[k])
  if (f.trim) {
    const trim = { ...s.trim } as Record<string, unknown>
    for (const k of f.trim) trim[k] = base.trim[k]
    out.trim = trim as unknown as TrimSettings
  }
  return out
}
