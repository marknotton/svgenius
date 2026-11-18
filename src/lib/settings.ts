import type { Config } from "svgo/browser"
import { PLUGINS, PLUGIN_NAMES } from "./plugins"
import { CASES, defaultRename } from "./rename"
import type { RenameSettings, AppSettings, AttrRule, CustomPlugin, CustomRun, Preset, Replacement, RunSpec, SvgoSettings } from "./types"

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_PRECISION = 3

export function defaultSvgoSettings(): SvgoSettings {
  return {
    multipass: true,
    floatPrecision: DEFAULT_PRECISION,
    pretty: false,
    plugins: Object.fromEntries(PLUGINS.map((p) => [p.name, p.defaultOn])),
    replacements: [],
    attrRules: [],
    trim: { enabled: false, padding: 0, unit: "%", aspect: "fit", scale: 1, sizeUnit: "%", sizeSide: "height", sizePx: 100, artScale: 1, offsetX: 0, offsetY: 0 },
    appendMarkup: "",
    mergePaths: false,
    custom: {}
  }
}

export function createAttrRule(): AttrRule {
  return {
    id: newId(), enabled: true, targets: "*",
    when: "lacks", whenAttr: "", whenValue: "",
    then: "setIfMissing", thenAttr: "", thenValue: "",
    caseSensitive: true, stage: "before"
  }
}

export function createReplacement(): Replacement {
  return { id: newId(), enabled: true, find: "", replace: "", caseSensitive: true, replaceAll: true, regex: false, stage: "before" }
}

export const newId = () => crypto.randomUUID()

/** A deep copy of one item with a new id, placed straight after the original */
export function duplicateAfter<T extends { id: string }>(list: T[], id: string, tweak: (copy: T) => T = (c) => c): T[] {
  const i = list.findIndex((x) => x.id === id)
  if (i < 0) return list
  const copy = tweak({ ...structuredClone(list[i]), id: newId() })
  return [...list.slice(0, i + 1), copy, ...list.slice(i + 1)]
}

export function createPreset(name: string, settings = defaultSvgoSettings()): Preset {
  return { id: newId(), name, settings: structuredClone(settings) }
}

export function defaultAppSettings(): AppSettings {
  const preset = createPreset("Default")
  return {
    version: 1,
    presets: [preset],
    customPlugins: [],
    defaultPresetId: preset.id,
    editingPresetId: preset.id,
    keepStructure: true,
    rename: defaultRename(),
    liveUpdates: true,
    ...defaultLayout()
  }
}

export const SIDEBAR = { default: 300, min: 260, max: 640 }

/** Preview size sliders: [min, default, max] in px. Typing a value can go past max */
export const PREVIEW_PX = {
  list: { min: 24, default: 64, max: 320 },
  gallery: { min: 80, default: 200, max: 800 },
  inspector: { min: 48, default: 112, max: 400 }
}
const OLD_THUMB_SIZES: Record<string, [number, number]> = { tiny: [32, 140], medium: [64, 220], large: [128, 340] }

export const SCALE_LIMITS = { min: 0.0001, max: 1000 }

/** A usable scale factor, or null */
export function validScale(v: unknown) {
  const n = typeof v === "string" ? Number(v.trim()) : v
  return typeof n === "number" && Number.isFinite(n) && n >= SCALE_LIMITS.min && n <= SCALE_LIMITS.max ? n : null
}

/** The bits "Reset layout" puts back */
export function defaultLayout() {
  return {
    previewCss: "",
    previewCssEnabled: true,
    sidebarWidth: SIDEBAR.default,
    circleOverlay: false,
    circleClip: false,
    thumbPx: PREVIEW_PX.list.default,
    inspectorPx: PREVIEW_PX.inspector.default,
    listCompare: false,
    showDetails: false,
    galleryPx: PREVIEW_PX.gallery.default,
    backdrop: "light" as const
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

/** Custom plugins switched on in these settings, in load order */
export function activeCustom(settings: SvgoSettings, plugins: CustomPlugin[]): CustomRun[] {
  return plugins
    .filter((p) => settings.custom[p.id]?.on)
    .map((p) => ({ name: p.name, code: p.code, hash: p.hash, params: settings.custom[p.id]?.params ?? "" }))
}

/** Stable fingerprint, used to spot results produced by older settings */
export function settingsKey(settings: SvgoSettings, custom: CustomRun[] = []) {
  const rules = activeReplacements(settings).map(({ id: _id, enabled: _e, ...r }) => r)
  const attrs = settings.attrRules.filter((r) => r.enabled).map(({ id: _id, enabled: _e, ...r }) => r)
  const t = settings.trim
  const trim = [t.enabled ? [t.padding, t.unit, t.aspect] : null, t.sizeUnit === "px" ? [t.sizeSide, t.sizePx] : t.scale, t.artScale, t.offsetX, t.offsetY]
  return JSON.stringify([toSvgoConfig(settings), rules, attrs, trim, custom.map((c) => [c.hash, c.params.trim()]), settings.appendMarkup.trim(), settings.mergePaths])
}

export function runSpec(settings: SvgoSettings, plugins: CustomPlugin[]): RunSpec {
  const custom = activeCustom(settings, plugins)
  return { svgo: settings, custom, key: settingsKey(settings, custom) }
}

export function hashCode(code: string) {
  let h = 5381
  for (let i = 0; i < code.length; i++) h = ((h << 5) + h + code.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

// ── Validation ────────────────────────────────────────────────────────────────
// Anything loaded from disk or imported goes through here, so a hand-edited or
// older file can't crash the app.

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

const clampNum = (v: unknown, min: number, max: number, d: number) => {
  const n = Number(v)
  return Number.isFinite(n) && v !== null && v !== "" ? Math.min(max, Math.max(min, n)) : d
}

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
  const custom: SvgoSettings["custom"] = {}
  if (isObj(raw.custom)) {
    for (const [k, v] of Object.entries(raw.custom)) {
      if (isObj(v)) custom[k] = { on: v.on === true, params: typeof v.params === "string" ? v.params : "" }
    }
  }
  const attrRules = Array.isArray(raw.attrRules)
    ? raw.attrRules.map(sanitiseAttrRule).filter((r): r is AttrRule => r !== null)
    : []
  const trimRaw = isObj(raw.trim) ? raw.trim : {}
  return {
    trim: {
      enabled: trimRaw.enabled === true,
      padding: clampNum(trimRaw.padding, -1e6, 1e6, 0),
      unit: trimRaw.unit === "px" ? "px" : "%",
      aspect: trimRaw.aspect === "preserve" ? "preserve" : "fit",
      scale: validScale(trimRaw.scale) ?? 1,
      sizeUnit: trimRaw.sizeUnit === "px" ? "px" : "%",
      sizeSide: trimRaw.sizeSide === "width" ? "width" : "height",
      sizePx: clampNum(trimRaw.sizePx, 0.01, 1e5, 100),
      artScale: validScale(trimRaw.artScale) ?? 1,
      offsetX: clampNum(trimRaw.offsetX, -1e4, 1e4, 0),
      offsetY: clampNum(trimRaw.offsetY, -1e4, 1e4, 0)
    },
    appendMarkup: typeof raw.appendMarkup === "string" ? raw.appendMarkup : "",
    mergePaths: raw.mergePaths === true,
    custom,
    attrRules,
    replacements,
    multipass: typeof raw.multipass === "boolean" ? raw.multipass : base.multipass,
    pretty: typeof raw.pretty === "boolean" ? raw.pretty : base.pretty,
    floatPrecision: Number.isInteger(precision) && precision >= 0 && precision <= 8 ? precision : base.floatPrecision,
    plugins
  }
}

const WHENS: AttrRule["when"][] = ["always", "has", "lacks", "equals", "contains"]
const THENS: AttrRule["then"][] = ["set", "setIfMissing", "remove", "rename", "removeElement"]

function sanitiseAttrRule(raw: unknown): AttrRule | null {
  if (!isObj(raw)) return null
  const base = createAttrRule()
  const str = (v: unknown, d = "") => (typeof v === "string" ? v : d)
  return {
    id: str(raw.id) || base.id,
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : true,
    targets: str(raw.targets, "*"),
    when: WHENS.includes(raw.when as AttrRule["when"]) ? raw.when as AttrRule["when"] : base.when,
    whenAttr: str(raw.whenAttr),
    whenValue: str(raw.whenValue),
    then: THENS.includes(raw.then as AttrRule["then"]) ? raw.then as AttrRule["then"] : base.then,
    thenAttr: str(raw.thenAttr),
    thenValue: str(raw.thenValue),
    caseSensitive: typeof raw.caseSensitive === "boolean" ? raw.caseSensitive : true,
    // Rules always run on the original markup now (the Before/After SVGO switch is gone)
    stage: "before"
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
    // Rules always run on the original markup now (the Before/After SVGO switch is gone)
    stage: "before"
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

export function sanitiseCustomPlugin(raw: unknown): CustomPlugin | null {
  if (!isObj(raw) || typeof raw.code !== "string" || typeof raw.name !== "string" || !raw.name) return null
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
    name: raw.name,
    description: typeof raw.description === "string" ? raw.description : "",
    fileName: typeof raw.fileName === "string" ? raw.fileName : `${raw.name}.js`,
    code: raw.code,
    hash: hashCode(raw.code)
  }
}

const sanitiseCustomList = (raw: unknown) => Array.isArray(raw)
  ? raw.map(sanitiseCustomPlugin).filter((p): p is CustomPlugin => p !== null)
  : []

function sanitiseRename(raw: unknown): RenameSettings {
  const d = defaultRename()
  if (!isObj(raw)) return d
  const str = (v: unknown, fallback: string) => (typeof v === "string" ? v.slice(0, 200) : fallback)
  return {
    enabled: raw.enabled === true,
    base: str(raw.base, d.base),
    prefix: str(raw.prefix, d.prefix),
    suffix: str(raw.suffix, d.suffix),
    case: CASES.some((c) => c.value === raw.case) ? raw.case as RenameSettings["case"] : d.case,
    index: (["none", "prefix", "suffix", "only"] as const).find((v) => v === raw.index) ?? d.index,
    pad: typeof raw.pad === "boolean" ? raw.pad : d.pad,
    start: Math.round(clampNum(raw.start, 0, 1e6, d.start)),
    scope: raw.scope === "folder" ? "folder" : "all",
    separator: str(raw.separator, d.separator).slice(0, 5)
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
    customPlugins: sanitiseCustomList(raw.customPlugins),
    defaultPresetId: pick(raw.defaultPresetId),
    editingPresetId: pick(raw.editingPresetId),
    // Older settings stored S/M/L
    thumbPx: clampNum(raw.thumbPx, PREVIEW_PX.list.min, 2000, OLD_THUMB_SIZES[String(raw.thumbSize)]?.[0] ?? PREVIEW_PX.list.default),
    inspectorPx: clampNum(raw.inspectorPx, PREVIEW_PX.inspector.min, 2000, PREVIEW_PX.inspector.default),
    listCompare: raw.listCompare === true,
    showDetails: raw.showDetails === true,
    galleryPx: clampNum(raw.galleryPx, PREVIEW_PX.gallery.min, 4000, PREVIEW_PX.gallery.default),
    backdrop: raw.backdrop === "dark" ? "dark" : "light",
    keepStructure: typeof raw.keepStructure === "boolean" ? raw.keepStructure : true,
    rename: sanitiseRename(raw.rename),
    previewCss: typeof raw.previewCss === "string" ? raw.previewCss : "",
    previewCssEnabled: typeof raw.previewCssEnabled === "boolean" ? raw.previewCssEnabled : true,
    sidebarWidth: clampNum(raw.sidebarWidth, SIDEBAR.min, SIDEBAR.max, SIDEBAR.default),
    circleOverlay: raw.circleOverlay === true,
    circleClip: raw.circleClip === true,
    liveUpdates: raw.liveUpdates !== false
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
  customPlugins: CustomPlugin[]
}

export function buildExport(settings: AppSettings): SettingsFile {
  return {
    app: "SVGenius",
    kind: "presets",
    version: 1,
    exportedAt: new Date().toISOString(),
    defaultPresetId: settings.defaultPresetId,
    presets: settings.presets,
    customPlugins: settings.customPlugins
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
  // Custom plugins travel with presets; same id replaces, new ones are added
  const customPlugins = [...current.customPlugins]
  for (const c of isObj(raw) ? sanitiseCustomList(raw.customPlugins) : []) {
    const idx = customPlugins.findIndex((x) => x.id === c.id)
    if (idx >= 0) customPlugins[idx] = c
    else customPlugins.push(c)
  }
  return { next: { ...current, presets, customPlugins }, added, updated }
}
