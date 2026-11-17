// ── Settings ──────────────────────────────────────────────────────────────────

export type ThumbSize = "tiny" | "medium" | "large"
export type Backdrop = "light" | "dark"

/** Everything that decides how SVGO treats a file. */
export interface SvgoSettings {
  multipass: boolean
  floatPrecision: number
  pretty: boolean
  /** Plugin name → enabled. Missing names fall back to the plugin's default. */
  plugins: Record<string, boolean>
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
