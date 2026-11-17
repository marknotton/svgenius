import type { Config } from "svgo/browser"
import { PLUGINS, PLUGIN_NAMES } from "./plugins"
import type { AppSettings, Preset, Replacement, SvgoSettings } from "./types"

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_PRECISION = 3

export function defaultSvgoSettings(): SvgoSettings {
  return {
    multipass: true,
    floatPrecision: DEFAULT_PRECISION,
    pretty: false,
    plugins: Object.fromEntries(PLUGINS.map((p) => [p.name, p.defaultOn])),
    replacements: []
  }
}

export function createReplacement(): Replacement {
  return { id: newId(), enabled: true, find: "", replace: "", caseSensitive: true, replaceAll: true, regex: false, stage: "before" }
}

export const newId = () => crypto.randomUUID()

export function createPreset(name: string, settings = defaultSvgoSettings()): Preset {
  return { id: newId(), name, settings: structuredClone(settings) }
}

export function defaultAppSettings(): AppSettings {
  const preset = createPreset("Default")
  return {
    version: 1,
    presets: [preset],
    defaultPresetId: preset.id,
    editingPresetId: preset.id,
    thumbSize: "medium",
    backdrop: "light",
    keepStructure: true,
    previewCss: "",
    previewCssEnabled: true
  }
}

// ── SVGO config ───────────────────────────────────────────────────────────────

export function isPluginOn(settings: SvgoSettings, name: string) {
  return settings.plugins[name] ?? PLUGINS.find((p) => p.name === name)?.defaultOn ?? false
}

/** Plain, structured-cloneable SVGO config (it's posted to a worker). */
export function toSvgoConfig(settings: SvgoSettings): Config {
  return {
    multipass: settings.multipass,
    floatPrecision: settings.floatPrecision,
    js2svg: { pretty: settings.pretty, indent: 2 },
    plugins: PLUGINS.filter((p) => isPluginOn(settings, p.name)).map((p) => p.name) as Config["plugins"]
  }
}

/** Rules that will actually do something, minus UI-only fields */
export function activeReplacements(settings: SvgoSettings) {
  return settings.replacements.filter((r) => r.enabled && r.find)
}

/** Stable fingerprint, used to spot results produced by older settings */
export function settingsKey(settings: SvgoSettings) {
  const rules = activeReplacements(settings).map(({ id: _id, enabled: _e, ...r }) => r)
  return JSON.stringify([toSvgoConfig(settings), rules])
}

// ── Validation ────────────────────────────────────────────────────────────────
// Anything loaded from disk or imported goes through here, so a hand-edited or
// older file can't crash the app.

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

export function sanitiseSvgoSettings(raw: unknown): SvgoSettings {
  const base = defaultSvgoSettings()
  if (!isObj(raw)) return base
  const plugins = { ...base.plugins }
  if (isObj(raw.plugins)) {
    for (const [k, v] of Object.entries(raw.plugins)) {
      if (PLUGIN_NAMES.has(k) && typeof v === "boolean") plugins[k] = v
    }
  }
  const precision = Number(raw.floatPrecision)
  const replacements = Array.isArray(raw.replacements)
    ? raw.replacements.map(sanitiseReplacement).filter((r): r is Replacement => r !== null)
    : []
  return {
    replacements,
    multipass: typeof raw.multipass === "boolean" ? raw.multipass : base.multipass,
    pretty: typeof raw.pretty === "boolean" ? raw.pretty : base.pretty,
    floatPrecision: Number.isInteger(precision) && precision >= 0 && precision <= 8 ? precision : base.floatPrecision,
    plugins
  }
}

function sanitiseReplacement(raw: unknown): Replacement | null {
  if (!isObj(raw)) return null
  const base = createReplacement()
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d)
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : base.id,
    enabled: bool(raw.enabled, true),
    find: typeof raw.find === "string" ? raw.find : "",
    replace: typeof raw.replace === "string" ? raw.replace : "",
    caseSensitive: bool(raw.caseSensitive, base.caseSensitive),
    replaceAll: bool(raw.replaceAll, base.replaceAll),
    regex: bool(raw.regex, false),
    stage: raw.stage === "after" ? "after" : "before"
  }
}

export function sanitisePreset(raw: unknown): Preset | null {
  if (!isObj(raw)) return null
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 80) : null
  if (!name) return null
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
    name,
    settings: sanitiseSvgoSettings(raw.settings)
  }
}

export function sanitiseAppSettings(raw: unknown): AppSettings {
  const base = defaultAppSettings()
  if (!isObj(raw)) return base
  const presets = Array.isArray(raw.presets)
    ? raw.presets.map(sanitisePreset).filter((p): p is Preset => p !== null)
    : []
  if (presets.length === 0) return base
  const ids = new Set(presets.map((p) => p.id))
  const pick = (v: unknown) => (typeof v === "string" && ids.has(v) ? v : presets[0].id)
  return {
    version: 1,
    presets,
    defaultPresetId: pick(raw.defaultPresetId),
    editingPresetId: pick(raw.editingPresetId),
    thumbSize: raw.thumbSize === "tiny" || raw.thumbSize === "large" ? raw.thumbSize : "medium",
    backdrop: raw.backdrop === "dark" ? "dark" : "light",
    keepStructure: typeof raw.keepStructure === "boolean" ? raw.keepStructure : true,
    previewCss: typeof raw.previewCss === "string" ? raw.previewCss : "",
    previewCssEnabled: typeof raw.previewCssEnabled === "boolean" ? raw.previewCssEnabled : true
  }
}

// ── Import / export ───────────────────────────────────────────────────────────

export interface SettingsFile {
  app: "SVGenius"
  kind: "presets"
  version: 1
  exportedAt: string
  defaultPresetId: string
  presets: Preset[]
}

export function buildExport(settings: AppSettings): SettingsFile {
  return {
    app: "SVGenius",
    kind: "presets",
    version: 1,
    exportedAt: new Date().toISOString(),
    defaultPresetId: settings.defaultPresetId,
    presets: settings.presets
  }
}

/**
 * Merges presets from an exported file into the current ones. Presets with the
 * same ID are updated in place, everything else is added. Name clashes get a
 * suffix so you can always tell them apart.
 */
export function mergeImport(current: AppSettings, raw: unknown): { next: AppSettings, added: number, updated: number } {
  const list = isObj(raw) && Array.isArray(raw.presets)
    ? raw.presets
    : isObj(raw) && isObj(raw.preset) ? [raw.preset] : null
  if (!list) throw new Error("That file doesn't look like SVGenius settings")
  const incoming = list.map(sanitisePreset).filter((p): p is Preset => p !== null)
  if (incoming.length === 0) throw new Error("No presets found in that file")

  const presets = [...current.presets]
  let added = 0
  let updated = 0
  for (const p of incoming) {
    const idx = presets.findIndex((c) => c.id === p.id)
    if (idx >= 0) {
      presets[idx] = p
      updated++
      continue
    }
    let name = p.name
    let n = 2
    while (presets.some((c) => c.name === name)) name = `${p.name} (${n++})`
    presets.push({ ...p, name })
    added++
  }
  return { next: { ...current, presets }, added, updated }
}
