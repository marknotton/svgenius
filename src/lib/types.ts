// ── Settings ──────────────────────────────────────────────────────────────────

export type ThumbSize = "tiny" | "medium" | "large"
export type Backdrop = "light" | "dark"

/** A find & replace rule, stored on a preset */
export interface Replacement {
  id: string
  enabled: boolean
  find: string
  replace: string
  caseSensitive: boolean
  /** false = first match only */
  replaceAll: boolean
  regex: boolean
  /** Run on the original markup, or on SVGO's output */
  stage: "before" | "after"
}

/** Everything that decides how SVGO treats a file. */
export interface SvgoSettings {
  multipass: boolean
  floatPrecision: number
  pretty: boolean
  /** Plugin name → enabled. Missing names fall back to the plugin's default. */
  plugins: Record<string, boolean>
  replacements: Replacement[]
}

export interface Preset {
  id: string
  name: string
  settings: SvgoSettings
}

export interface AppSettings {
  version: 1
  presets: Preset[]
  /** Used by every file that hasn't been given its own preset */
  defaultPresetId: string
  /** The preset currently open in the config panel */
  editingPresetId: string
  thumbSize: ThumbSize
  backdrop: Backdrop
  keepStructure: boolean
  /** CSS injected into previews only */
  previewCss: string
  previewCssEnabled: boolean
}

// ── Files ─────────────────────────────────────────────────────────────────────

export interface ScannedFile {
  path: string
  name: string
  relPath: string
  size: number
}

export type ItemStatus = "loading" | "idle" | "running" | "done" | "error"

export interface OptimiseResult {
  output: string
  size: number
  /** How many find & replace matches were made */
  replaced: number
  /** Fingerprint of the settings used, so we can tell when a result is stale */
  key: string
}

export interface SvgItem extends ScannedFile {
  id: string
  source?: string
  status: ItemStatus
  error?: string
  /** null means "use the default preset" */
  presetId: string | null
  result?: OptimiseResult
}
