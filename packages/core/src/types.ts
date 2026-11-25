import type { GuideShape } from "./shapes"

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
  /** "x" scales by artScale; "px" scales the artwork so one side measures artSizePx (viewBox units). Missing = "x" */
  artUnit?: "x" | "px"
  /** Which side of the artwork artSizePx sets */
  artSide?: "width" | "height"
  artSizePx?: number
}

/** Scale and move the artwork inside its viewBox */
export interface ArtTransform {
  /** Scales the artwork inside its viewBox, around the centre */
  scale: number
  /** Moves the artwork, as % of the viewBox width/height */
  offsetX: number
  offsetY: number
}

/** Per-file fine-tuning (Quickview): scales around the viewBox centre, then moves, in viewBox units */
export interface ArtAdjust {
  scale: number
  x: number
  y: number
}

/** A reference shape on a design principle's grid, in canvas units, centred */
export interface Keyline {
  id: string
  kind: "circle" | "square" | "portrait" | "landscape"
  w: number
  h: number
}

/** A small, file-specific tweak inside a design principle, picked by file name or handle */
export interface DpVariation {
  id: string
  enabled: boolean
  /** name = the file name without .svg; handle = the host's handle, else the root id, else the file name */
  by: "name" | "handle"
  /** Glob: * matches anything, ? one character. Comma separated for several. Case-insensitive */
  match: string
  scale: number
  x: number
  y: number
  note: string
}

/** How a design principle places the artwork on its canvas */
export type GridFit = "none" | "centre" | "contain" | "keylines"

/** A brand's icon rules: canvas, live area, keylines and per-file variations */
export interface DesignPrinciple {
  id: string
  name: string
  description: string
  /** Where the rules come from */
  source: string
  /** The canvas, in px (dp) */
  width: number
  height: number
  /** Space kept clear inside the canvas edge, so the live area is width - padding × 2 */
  padding: number
  fit: GridFit
  keylines: Keyline[]
  /** Reference stroke weight and corner radius, for the guides and the report */
  stroke: number
  radius: number
  /** The mask shape the icons are seen in, if any (app icons, avatars) */
  shape: GuideShape | null
  variations: DpVariation[]
}

/** What the pipeline needs from a design principle */
export type GridSpec = Pick<DesignPrinciple, "width" | "height" | "padding" | "fit" | "keylines">

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
  /** The design principle files are fitted to, if any */
  designPrincipleId?: string | null
  /** Filled in by the host at run time (never saved): the design principle's grid */
  grid?: GridSpec | null
  /** Filled in by the host at run time (never saved): variations plus the file's own Quickview tuning */
  adjust?: ArtAdjust | null
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
  /** The circle guide's colour; null uses the brand accent */
  circleColour: string | null
  circleClip: boolean
  liveUpdates: boolean
  /** The shape the guide and the clip use. Missing = circle */
  guideShape?: GuideShape
  /** Brand icon rules, managed in Design principles */
  designPrinciples?: DesignPrinciple[]
  /** The design principle Quickview shows when a file's preset doesn't name one */
  quickviewDpId?: string | null
  /** Quickview's move step, in viewBox units */
  quickviewStep?: number
  /** Quickview's guides: grid, live area and keylines */
  quickviewGuides?: boolean
}

// ── Files ─────────────────────────────────────────────────────────────────────

export interface ScannedFile {
  path: string
  name: string
  relPath: string
  size: number
  /** Last modified on disk, ms since the epoch */
  mtime?: number | null
}

export type Flag = "red" | "orange" | "yellow" | "green" | "blue" | "purple"

export type ItemStatus = "loading" | "idle" | "running" | "done" | "error"

export type GeometryEffect = "flatten" | "cutouts" | "merge" | "centre"
export type ThemeChoice = "system" | "light" | "dark"
export type PrecisionTolerance = "strict" | "balanced" | "loose"

export interface OptimiseResult {
  output: string
  size: number
  /** The fine-tuning baked into this output, so previews can show changes before the re-run lands */
  adjust?: ArtAdjust
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
  /** When the source was last edited in the app, ms since the epoch */
  editedAt?: number
  /** This file's own settings, used instead of its preset */
  config?: SvgoSettings
  /** A colour flag for sorting through files */
  flag?: Flag
  /** Why the markup is too heavy to render safely (size or element count) */
  heavy?: string
  /** Render and optimise it anyway */
  forceRender?: boolean
  /** Quickview's fine-tuning, applied last */
  adjust?: ArtAdjust
  /** A host's own name for the file (Symbols' handle), for design principle variations */
  handle?: string
}

/** Editor commands that the host's menu or shortcuts can send */
export type Command = "undo" | "redo" | "selectAll" | "duplicate" | "group" | "ungroup" | "breakApart" | "forward" | "backward"
  | "zoomIn" | "zoomOut" | "zoomFit" | "zoomActual" | "newProject" | "openProject" | "saveProject" | "saveProjectAs" | "addSvgs"
