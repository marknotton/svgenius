// ── Settings ──────────────────────────────────────────────────────────────────

export type Backdrop = "light" | "dark"

/** A find & replace rule, stored on a preset */
/** Picks shapes to turn into cut-outs, by fill colour or by text in their markup */
export interface CutMatcher {
  id: string
  enabled: boolean
  kind: "colour" | "markup"
  /** A colour (any CSS colour) or text to find in the shape's tag */
  value: string
}

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
  /** "%" uses scale; "px" sets one side to sizePx and the other follows the aspect ratio */
  sizeUnit: "%" | "px"
  sizeSide: "width" | "height"
  sizePx: number
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
  /** Boolean-union shapes that share a fill and opacity into one path */
  mergePaths: boolean
  /** Bake transform attributes into the path data (Beta) */
  flattenTransforms: boolean
  /** Shift the artwork so its visual weight sits in the middle (Beta) */
  opticalCentre: boolean
  /** 0–100: how far from the box centre towards the centre of mass */
  opticalStrength: number
  /** Find the lowest precision per file that still renders the same; floatPrecision becomes the most it uses */
  autoPrecision: boolean
  autoTolerance: PrecisionTolerance
  /** Strokes become real holes in the shapes beneath them (Beta) */
  cutOutStrokes: boolean
  /** Shapes matching any of these become real holes in the shapes beneath them (Beta) */
  cutOutShapes: CutMatcher[]
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

/** How exported files are named */
export interface RenameSettings {
  enabled: boolean
  /** Replaces the name; {name} is the original. Empty keeps the original */
  base: string
  prefix: string
  suffix: string
  case: "keep" | "lower" | "upper" | "kebab" | "snake" | "camel" | "pascal" | "title"
  /** Where the number goes, if anywhere. "only" names files 01.svg, 02.svg… */
  index: "none" | "prefix" | "suffix" | "only"
  /** 01, 02… rather than 1, 2… */
  pad: boolean
  start: number
  /** Number across everything, or restart in each folder */
  scope: "all" | "folder"
  separator: string
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
  /** Inspect mode: detailed rows (dimensions, tags, preset). Off = big before/after gallery */
  showDetails: boolean
  /** Thumbnail size in the gallery (showDetails off) */
  galleryPx: number
  backdrop: Backdrop
  /** Checkerboard behind previews. Off shows a plain colour */
  checker: boolean
  /** Solid colour behind previews when the checkerboard is off; null = plain light or dark */
  backdropColour: string | null
  /** Show every option. Off keeps the app simple: presets and output only */
  advanced: boolean
  /** The editor's tools: a full-width row on top, or a column down the left */
  editorToolbar: "top" | "left"
  /** App colours: follow the system, or always light or dark */
  theme: ThemeChoice
  keepStructure: boolean
  rename: RenameSettings
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

export type Flag = "red" | "orange" | "yellow" | "green" | "blue" | "purple"

export type ItemStatus = "loading" | "idle" | "running" | "done" | "error"

export type GeometryEffect = "flatten" | "cutouts" | "merge" | "centre"
export type ThemeChoice = "system" | "light" | "dark"
export type PrecisionTolerance = "strict" | "balanced" | "loose"

export interface OptimiseResult {
  output: string
  size: number
  /** How many find & replace matches and attribute rule changes were made */
  replaced: number
  /** Beta geometry steps that actually changed something */
  effects?: GeometryEffect[]
  /** The precision auto precision settled on */
  precision?: number
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
  /** A colour flag for sorting through files */
  flag?: Flag
  /** Why the markup is too heavy to render safely (size or element count) */
  heavy?: string
  /** Render and optimise it anyway */
  forceRender?: boolean
}
