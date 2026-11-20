import { APP_VERSION } from "./about"
import { mergeImport, sanitiseRename, sanitiseSvgoSettings } from "./settings"
import type { Saved } from "./session"
import type { AppSettings, SvgItem } from "./types"

// ── Projects ──────────────────────────────────────────────────────────────────
// A .svgenius file is JSON: every file in the list (its markup as loaded, any
// edits made here, its flag, preset and own settings), plus the presets and
// export options they rely on. Opening one puts all of that back, even when
// the original files have moved, since the markup travels inside it.

export interface ProjectFile {
  app: "SVGenius"
  kind: "project"
  version: 1
  savedAt: string
  appVersion: string
  settings: Pick<AppSettings, "defaultPresetId" | "presets" | "customPlugins" | "rename" | "keepStructure" | "previewCss" | "previewCssEnabled">
  files: Saved[]
  /** The file that was open in the sidebar */
  focusId: string | null
}

export function buildProject(settings: AppSettings, items: SvgItem[], focusId: string | null): ProjectFile {
  const files: Saved[] = items
    .filter((i) => typeof i.source === "string")
    .map(({ id, path, name, relPath, size, source, fileSource, presetId, config, flag }) => ({ id, path, name, relPath, size, source, fileSource, presetId, config, flag }))
  return {
    app: "SVGenius",
    kind: "project",
    version: 1,
    savedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    settings: {
      defaultPresetId: settings.defaultPresetId,
      presets: settings.presets,
      customPlugins: settings.customPlugins,
      rename: settings.rename,
      keepStructure: settings.keepStructure,
      previewCss: settings.previewCss,
      previewCssEnabled: settings.previewCssEnabled
    },
    files,
    focusId: focusId && files.some((f) => f.id === focusId) ? focusId : null
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === "string" ? v : undefined)

/**
 * Reads a project file. The files come back ready for the list, and the
 * settings merge into the current ones: the project's presets are added (or
 * update ones with the same ID), so every file finds its preset again
 */
export function readProject(text: string, current: AppSettings): { files: SvgItem[], focusId: string | null, settings: AppSettings } {
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

  const list = Array.isArray(raw.files) ? raw.files : []
  const files: SvgItem[] = list.flatMap((f): SvgItem[] => {
    if (!isObj(f) || typeof f.source !== "string") return []
    const name = str(f.name) ?? "untitled.svg"
    const presetId = str(f.presetId) ?? null
    return [{
      id: str(f.id) ?? crypto.randomUUID(),
      path: str(f.path) ?? name,
      name,
      relPath: str(f.relPath) ?? name,
      size: typeof f.size === "number" ? f.size : new Blob([f.source]).size,
      source: f.source,
      fileSource: str(f.fileSource),
      presetId: presetId && presetIds.has(presetId) ? presetId : null,
      config: isObj(f.config) ? sanitiseSvgoSettings(f.config) : undefined,
      flag: str(f.flag) as SvgItem["flag"],
      status: "idle",
      rev: 0
    }]
  })
  if (!files.length) throw new Error("That project has no files in it")
  const focusId = str(raw.focusId) ?? null
  return { files, focusId: focusId && files.some((f) => f.id === focusId) ? focusId : null, settings }
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
