// ── Settings ──────────────────────────────────────────────────────────────────

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

/** "When <targets> <condition> then <action>" attribute recipe */
export interface AttrRule {
  id: string
  enabled: boolean
  /** Element names, comma or space separated. Empty or * means every element */
  targets: string
  when: "always" | "has" | "lacks" | "equals" | "contains"
  whenAttr: string
  whenValue: string
  then: "set" | "setIfMissing" | "remove" | "rename" | "removeElement"
  thenAttr: string
  thenValue: string
  caseSensitive: boolean
  stage: "before" | "after"
}

export interface TrimSettings {
  enabled: boolean
  /** Positive adds space around the artwork, negative crops into it */
  padding: number
  unit: "%" | "px"
  /** fit = viewBox hugs the artwork; preserve = keep the original aspect ratio */
  aspect: "fit" | "preserve"
  /** Multiplies the output width/height (the viewBox is untouched). 1 = unchanged */
  scale: number
  /** Scales the artwork inside the viewBox, around its centre. 1 = unchanged */
  artScale: number
  /** Moves the artwork, as % of the viewBox width/height */
  offsetX: number
  offsetY: number
}

/** Scale and move the artwork inside its viewBox */
export interface ArtTransform {
  /** Scales the artwork inside its viewBox, around the centre */
  scale: number
  /** Moves the artwork, as % of the viewBox width/height */
  offsetX: number
  offsetY: number
}

/** Everything that decides how SVGO treats a file. */
export interface SvgoSettings {
  multipass: boolean
  floatPrecision: number
  pretty: boolean
  /** Plugin name → enabled. Missing names fall back to the plugin's default. */
  plugins: Record<string, boolean>
  replacements: Replacement[]
  attrRules: AttrRule[]
  /** Crop the viewBox to the visible artwork, then pad (or inset) it */
  trim: TrimSettings
  /** Raw markup added to every file, just before </svg> */
  appendMarkup: string
  /** Custom plugin id → on/off and its params as JSON text */
  custom: Record<string, { on: boolean, params: string }>
}

/** A third-party SVGO plugin loaded from a .js/.mjs file */
export interface CustomPlugin {
  id: string
  name: string
  description: string
  fileName: string
  code: string
  /** Short hash of the code, so results go stale when a plugin is reloaded */
  hash: string
}

/** What the worker needs to run one custom plugin */
export interface CustomRun { name: string, code: string, hash: string, params: string }

/** Everything needed to optimise one file */
export interface RunSpec { svgo: SvgoSettings, custom: CustomRun[], key: string }

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
  customPlugins: CustomPlugin[]
  /** The preset currently open in the config panel */
  editingPresetId: string
  /** Preview sizes in px: file list rows, inspector before/after */
  thumbPx: number
  inspectorPx: number
  /** Show before and after thumbnails in the file list */
  listCompare: boolean
  /** Show tags and dimensions detail on each row */
  showDetails: boolean
  backdrop: Backdrop
  keepStructure: boolean
  /** CSS injected into previews only */
  previewCss: string
  previewCssEnabled: boolean
  sidebarWidth: number
  circleOverlay: boolean
  circleClip: boolean
  liveUpdates: boolean
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
  /** How many find & replace matches and attribute rule changes were made */
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
  /** The settings fingerprint that last failed, so live updates don't retry it forever */
  errorKey?: string
  /** Markup as read from disk, kept when the source is edited in the app */
  fileSource?: string
  /** Bumped on every in-app edit of the source */
  rev: number
  /** This file's own settings, used instead of its preset */
  config?: SvgoSettings
}
