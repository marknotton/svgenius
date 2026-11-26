import { APP_VERSION } from "./about"
import { mergeImport, sanitiseRename, sanitiseSvgoSettings } from "@marknotton/svgenius-core/settings"
import { fromScales, isIdentity, mergePrinciples } from "@marknotton/svgenius-core/designPrinciples"
import { byteLength } from "@marknotton/svgenius-core/format"
import { isDesktop } from "./platform"
import { dirOf, hasEdits, isLinked, relativePath } from "./links"
import type { AppSettings, SvgItem } from "@marknotton/svgenius-core/types"

// ── Projects ──────────────────────────────────────────────────────────────────
// A .svgenius file is JSON: every file in the list (where it lives on disk,
// its flag, preset, own settings and Quick Edit tuning), plus the presets and
// export options they rely on. The SVGs themselves stay on disk and are read
// again when the project opens, so the project stays small. Markup only goes
// in when there's no file to read: pasted code, edits made in here, or a copy
// standing in for a file that's gone missing.
// The browser can't read files back by path, so its projects carry the markup
// (as version 1 projects did, which still open).

export interface ProjectEntry {
  id: string
  /** Where the file was when saved */
  path: string
  /** The same, relative to the project file, for a project moved with its SVGs */
  rel?: string
  name: string
  relPath: string
  size?: number
  /** Markup that can't come from the file: pasted code, edits, a stand-in copy */
  source?: string
  /** The file's own markup, only when carried alongside edits */
  fileSource?: string
  /** `source` is edits made in here, not a copy of the file */
  edited?: boolean
  presetId: string | null
  config?: SvgItem["config"]
  flag?: SvgItem["flag"]
  adjust?: SvgItem["adjust"]
}

export interface ProjectFile {
  app: "SVGenius"
  kind: "project"
  version: 2
  savedAt: string
  appVersion: string
  settings: Pick<AppSettings, "defaultPresetId" | "presets" | "customPlugins" | "rename" | "keepStructure" | "previewCss" | "previewCssEnabled" | "designPrinciples">
  files: ProjectEntry[]
  /** The file that was open in the sidebar */
  focusId: string | null
}

export interface BuildOptions {
  /** Carry every file's markup (the browser's projects). Defaults to the browser */
  embed?: boolean
  /** Where the project is being saved, for each file's relative path */
  projectPath?: string | null
}

function entryFor(item: SvgItem, embed: boolean, projectDir: string | null): ProjectEntry | null {
  const { id, path, name, relPath, size, presetId, config, flag, adjust } = item
  const linked = isLinked(item)
  // Nothing to save for pasted code that never loaded
  if (!linked && item.source === undefined) return null
  const e: ProjectEntry = { id, path, name, relPath, size, presetId, config, flag, adjust }
  if (linked && projectDir) {
    const rel = relativePath(projectDir, path)
    if (rel) e.rel = rel
  }
  if (item.source === undefined) return e
  const edited = hasEdits(item)
  if (embed || !linked) {
    e.source = item.source
    if (edited && item.fileSource !== undefined) e.fileSource = item.fileSource
    if (edited) e.edited = true
  } else if (edited && !item.missing) {
    // The file is re-read on open; only the edits need keeping
    e.source = item.source
    e.edited = true
  } else if (item.missing) {
    // No file to read back, so the copy we have stands in until it's found
    e.source = item.source
    if (edited && item.fileSource !== undefined) { e.fileSource = item.fileSource; e.edited = true }
  }
  return e
}

export function buildProject(settings: AppSettings, items: SvgItem[], focusId: string | null, opts: BuildOptions = {}): ProjectFile {
  const embed = opts.embed ?? !isDesktop
  const projectDir = opts.projectPath ? dirOf(opts.projectPath) : null
  const files = items.map((i) => entryFor(i, embed, projectDir)).filter((e): e is ProjectEntry => e !== null)
  return {
    app: "SVGenius",
    kind: "project",
    version: 2,
    savedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    settings: {
      defaultPresetId: settings.defaultPresetId,
      presets: settings.presets,
      customPlugins: settings.customPlugins,
      rename: settings.rename,
      keepStructure: settings.keepStructure,
      previewCss: settings.previewCss,
      previewCssEnabled: settings.previewCssEnabled,
      // Only the ones the presets use, so a project doesn't carry the whole library
      designPrinciples: (settings.designPrinciples ?? []).filter((d) => settings.presets.some((p) => p.settings.designPrincipleId === d.id)
        || files.some((f) => f.config?.designPrincipleId === d.id))
    },
    files,
    focusId: focusId && files.some((f) => f.id === focusId) ? focusId : null
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === "string" ? v : undefined)
const readAdjust = (v: unknown): SvgItem["adjust"] => {
  if (!isObj(v)) return undefined
  const scale = Number(v.scale), x = Number(v.x), y = Number(v.y), sx = Number(v.sx ?? 1), sy = Number(v.sy ?? 1), r = Number(v.r ?? 0)
  if (![scale, x, y, sx, sy, r].every(Number.isFinite) || scale <= 0 || sx <= 0 || sy <= 0) return undefined
  const a = fromScales(scale * sx, scale * sy, x, y, r)
  return isIdentity(a) ? undefined : a
}

/**
 * Reads a project file. The files come back ready for the list, though linked
 * ones still need reading from disk (loadLinked in links.ts); `rels` holds
 * each one's path relative to the project. The settings merge into the
 * current ones: the project's presets are added (or update ones with the same
 * ID), so every file finds its preset again
 */
export function readProject(text: string, current: AppSettings): { files: SvgItem[], rels: Map<string, string>, focusId: string | null, settings: AppSettings } {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new Error("That project file isn't valid JSON") }
  if (!isObj(raw) || raw.app !== "SVGenius" || raw.kind !== "project") throw new Error("That doesn't look like an SVGenius project")
  const s = isObj(raw.settings) ? raw.settings : {}
  let settings = current
  if (Array.isArray(s.presets) && s.presets.length) settings = mergeImport(current, { presets: s.presets, customPlugins: s.customPlugins }).next
  const presetIds = new Set(settings.presets.map((p) => p.id))
  if (typeof s.defaultPresetId === "string" && presetIds.has(s.defaultPresetId)) settings = { ...settings, defaultPresetId: s.defaultPresetId }
  if (isObj(s.rename)) settings = { ...settings, rename: sanitiseRename(s.rename) }
  if (typeof s.keepStructure === "boolean") settings = { ...settings, keepStructure: s.keepStructure }
  if (typeof s.previewCss === "string") settings = { ...settings, previewCss: s.previewCss }
  if (typeof s.previewCssEnabled === "boolean") settings = { ...settings, previewCssEnabled: s.previewCssEnabled }
  if (Array.isArray(s.designPrinciples) && s.designPrinciples.length) {
    try { settings = { ...settings, designPrinciples: mergePrinciples(settings.designPrinciples ?? [], s.designPrinciples).next } } catch { /* none usable */ }
  }

  const rels = new Map<string, string>()
  const list = Array.isArray(raw.files) ? raw.files : []
  const files: SvgItem[] = list.flatMap((f): SvgItem[] => {
    if (!isObj(f)) return []
    const source = str(f.source)
    const path = str(f.path)
    // Version 1 always had markup; version 2 needs at least a path to find
    if (source === undefined && !path) return []
    const name = str(f.name) ?? (path ? path.split(/[\\/]/).pop() as string : "untitled.svg")
    const presetId = str(f.presetId) ?? null
    const id = str(f.id) ?? crypto.randomUUID()
    const rel = str(f.rel)
    if (rel) rels.set(id, rel)
    // Version 1 carried both; a stand-in copy is the file as it was; edits leave it to the disk
    const fileSource = str(f.fileSource) ?? (f.edited === true ? undefined : source)
    return [{
      id,
      path: path ?? name,
      name,
      relPath: str(f.relPath) ?? name,
      size: typeof f.size === "number" ? f.size : source !== undefined ? byteLength(source) : 0,
      source,
      fileSource,
      presetId: presetId && presetIds.has(presetId) ? presetId : null,
      config: isObj(f.config) ? sanitiseSvgoSettings(f.config) : undefined,
      flag: str(f.flag) as SvgItem["flag"],
      adjust: readAdjust(f.adjust),
      status: source === undefined ? "loading" : "idle",
      rev: 0
    }]
  })
  if (!files.length) throw new Error("That project has no files in it")
  const focusId = str(raw.focusId) ?? null
  return { files, rels, focusId: focusId && files.some((f) => f.id === focusId) ? focusId : null, settings }
}

/**
 * Roughly how many things changed between two project fingerprints (from
 * buildProject, as JSON): each file added, removed or edited counts once, and
 * so does each changed setting
 */
export function countChanges(before: string, after: string): number {
  try {
    const a = JSON.parse(before) as ProjectFile, b = JSON.parse(after) as ProjectFile
    const was = new Map(a.files.map((f) => [f.id, JSON.stringify(f)]))
    let n = 0
    for (const f of b.files) {
      const old = was.get(f.id)
      if (old === undefined || old !== JSON.stringify(f)) n++
      was.delete(f.id)
    }
    n += was.size
    const keys = new Set([...Object.keys(a.settings ?? {}), ...Object.keys(b.settings ?? {})])
    for (const k of keys) {
      if (JSON.stringify((a.settings as Record<string, unknown>)[k]) !== JSON.stringify((b.settings as Record<string, unknown>)[k])) n++
    }
    return Math.max(1, n)
  } catch {
    return 1
  }
}
