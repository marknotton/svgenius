import { isGuideShape } from "./shapes"
import type { ArtAdjust, DesignPrinciple, DpVariation, GridFit, GridSpec, Keyline, SvgItem } from "./types"

// ── Design principles ─────────────────────────────────────────────────────────
// A brand's icon rules: the canvas, the live area inside its padding, the
// keyline shapes, and small per-file variations. Presets can fit their files
// to one, and Quickview draws its guides.

const id = () => crypto.randomUUID()

export const IDENTITY: ArtAdjust = { scale: 1, x: 0, y: 0 }
/** The vertical scale (the same as scale unless stretched) */
export const syOf = (a: ArtAdjust) => a.sy ?? a.scale
export const isIdentity = (a: ArtAdjust | null | undefined) => !a || (a.scale === 1 && syOf(a) === 1 && a.x === 0 && a.y === 0)

/** Drops sy when it matches scale, so uniform adjustments stay uniform */
export function makeAdjust(scale: number, sy: number, x: number, y: number): ArtAdjust {
  return Math.abs(sy - scale) < 1e-9 ? { scale, x, y } : { scale, sy, x, y }
}

/** b after a: both scale around the same centre, offsets in the same units */
export function composeAdjust(a: ArtAdjust, b: ArtAdjust): ArtAdjust {
  return makeAdjust(a.scale * b.scale, syOf(a) * syOf(b), b.x + b.scale * a.x, b.y + syOf(b) * a.y)
}

/** What turns a into b (d after a = b) */
export function diffAdjust(a: ArtAdjust, b: ArtAdjust): ArtAdjust {
  const sx = b.scale / a.scale, sy = syOf(b) / syOf(a)
  return makeAdjust(sx, sy, b.x - sx * a.x, b.y - sy * a.y)
}

/** Where a box lands after an adjustment around centre (cx, cy) */
export function applyAdjustToBox(a: ArtAdjust, box: { x: number, y: number, w: number, h: number }, cx: number, cy: number) {
  const sy = syOf(a)
  return { x: cx + a.x + a.scale * (box.x - cx), y: cy + a.y + sy * (box.y - cy), w: box.w * a.scale, h: box.h * sy }
}

/** Undoes an adjustment on a box */
export function unapplyAdjustToBox(a: ArtAdjust, box: { x: number, y: number, w: number, h: number }, cx: number, cy: number) {
  const sy = syOf(a)
  return { x: cx + (box.x - cx - a.x) / a.scale, y: cy + (box.y - cy - a.y) / sy, w: box.w / a.scale, h: box.h / sy }
}

/** The four classic keylines, centred in the canvas */
function keylines(square: number, circle: number, long: number, short: number): Keyline[] {
  return [
    { id: id(), kind: "square", w: square, h: square },
    { id: id(), kind: "circle", w: circle, h: circle },
    { id: id(), kind: "portrait", w: short, h: long },
    { id: id(), kind: "landscape", w: long, h: short }
  ]
}

function make(p: Omit<DesignPrinciple, "id" | "variations"> & { id: string }): DesignPrinciple {
  return { ...p, variations: [] }
}

/** Starting points. Fixed ids, so re-adding a built-in updates it rather than doubling up */
export function builtInPrinciples(): DesignPrinciple[] {
  return [
    make({
      id: "dp-material",
      name: "Material Design (MUI)",
      description: "System icons: 24 × 24 canvas, 20 × 20 live area (2 padding), keylines square 18, circle 20, portrait 16 × 20, landscape 20 × 16. 2 stroke, 2 corner radius. Matches @mui/icons-material",
      source: "https://m2.material.io/design/iconography/system-icons.html#grid-and-keyline-shapes",
      width: 24, height: 24, padding: 2, fit: "keylines",
      keylines: keylines(18, 20, 20, 16), stroke: 2, radius: 2, shape: null
    }),
    make({
      id: "dp-material-symbols",
      name: "Material Symbols (960 grid)",
      description: "The same rules on Material Symbols' 960 unit grid (viewBox 0 -960 960 960 in the downloads, 1 dp = 40 units)",
      source: "https://fonts.google.com/icons",
      width: 960, height: 960, padding: 80, fit: "keylines",
      keylines: keylines(720, 800, 800, 640), stroke: 80, radius: 80, shape: null
    }),
    make({
      id: "dp-lucide",
      name: "Lucide (shadcn/ui)",
      description: "24 × 24 canvas, at least 1 padding, 2 stroke with round caps and joins, 2 corner radius (1 under 8), 2 between elements. Weight is matched against a 20 circle and 18 square",
      source: "https://lucide.dev/guide/design/icon-design-guide",
      width: 24, height: 24, padding: 1, fit: "keylines",
      keylines: keylines(18, 20, 20, 16), stroke: 2, radius: 2, shape: null
    }),
    make({
      id: "dp-font-awesome",
      name: "Font Awesome",
      description: "20 × 20 design canvas, keyshapes square 14, circle 16, vertical 12 × 16, horizontal 16 × 12. Regular weight strokes are 1.5, with a 1.5 gap at overlaps",
      source: "https://docs.fontawesome.com/web/add-icons/upload-icons/icon-design",
      width: 20, height: 20, padding: 2, fit: "keylines",
      keylines: keylines(14, 16, 16, 12), stroke: 1.5, radius: 1.5, shape: null
    }),
    make({
      id: "dp-meta",
      name: "Meta (Horizon OS)",
      description: "24 × 24 canvas, 20 × 20 live area (2 padding). Content may bleed into the padding but not past the canvas. Meta gives keyline sizes only as images, so these follow Material's",
      source: "https://developers.meta.com/horizon/design/fonts-icons/",
      width: 24, height: 24, padding: 2, fit: "keylines",
      keylines: keylines(18, 20, 20, 16), stroke: 2, radius: 2, shape: null
    }),
    make({
      id: "dp-app-icon",
      name: "App icon (squircle)",
      description: "A 1024 app icon seen through a squircle mask. Artwork sits in the middle two thirds so nothing important is cut off",
      source: "",
      width: 1024, height: 1024, padding: 170, fit: "contain",
      keylines: [{ id: id(), kind: "circle", w: 684, h: 684 }], stroke: 0, radius: 0, shape: "squircle"
    })
  ]
}

export function createPrinciple(name = "New design principle"): DesignPrinciple {
  return {
    id: id(), name, description: "", source: "",
    width: 24, height: 24, padding: 2, fit: "keylines",
    keylines: keylines(18, 20, 20, 16), stroke: 2, radius: 2, shape: null, variations: []
  }
}

export function createVariation(): DpVariation {
  return { id: id(), enabled: true, by: "name", match: "", scale: 1, x: 0, y: 0, note: "" }
}

// ── Validation ────────────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const num = (v: unknown, min: number, max: number, d: number) => {
  const n = Number(v)
  return v !== null && v !== "" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d
}
const str = (v: unknown, d = "", max = 2000) => (typeof v === "string" ? v.slice(0, max) : d)
const FITS: GridFit[] = ["none", "centre", "contain", "keylines"]
const KINDS: Keyline["kind"][] = ["circle", "square", "portrait", "landscape"]

export function sanitisePrinciple(raw: unknown): DesignPrinciple | null {
  if (!isObj(raw)) return null
  const base = createPrinciple()
  const width = num(raw.width, 1, 1e5, base.width)
  const height = num(raw.height, 1, 1e5, base.height)
  return {
    id: str(raw.id, "", 100) || id(),
    name: str(raw.name, "", 120).trim() || "Untitled",
    description: str(raw.description),
    source: str(raw.source, "", 500),
    width, height,
    padding: num(raw.padding, 0, Math.min(width, height) / 2 - 0.01, base.padding),
    fit: FITS.includes(raw.fit as GridFit) ? raw.fit as GridFit : "keylines",
    keylines: Array.isArray(raw.keylines) ? raw.keylines.flatMap((k): Keyline[] => isObj(k) && KINDS.includes(k.kind as Keyline["kind"])
      ? [{ id: str(k.id, "", 100) || id(), kind: k.kind as Keyline["kind"], w: num(k.w, 0.01, 1e5, 1), h: num(k.h, 0.01, 1e5, 1) }]
      : []) : base.keylines,
    stroke: num(raw.stroke, 0, 1e4, base.stroke),
    radius: num(raw.radius, 0, 1e4, base.radius),
    shape: isGuideShape(raw.shape) ? raw.shape : null,
    variations: Array.isArray(raw.variations) ? raw.variations.flatMap((v): DpVariation[] => isObj(v) ? [{
      id: str(v.id, "", 100) || id(),
      enabled: v.enabled !== false,
      by: v.by === "handle" ? "handle" : "name",
      match: str(v.match, "", 500),
      scale: num(v.scale, 0.0001, 1000, 1),
      x: num(v.x, -1e5, 1e5, 0),
      y: num(v.y, -1e5, 1e5, 0),
      note: str(v.note, "", 500)
    }] : []) : []
  }
}

export const sanitisePrinciples = (raw: unknown): DesignPrinciple[] => Array.isArray(raw)
  ? raw.map(sanitisePrinciple).filter((p): p is DesignPrinciple => p !== null)
  : builtInPrinciples()

// ── Import / export ───────────────────────────────────────────────────────────

export interface PrinciplesFile {
  app: "SVGenius"
  kind: "design-principles"
  version: 1
  exportedAt: string
  principles: DesignPrinciple[]
}

export function buildPrinciplesExport(list: DesignPrinciple[]): PrinciplesFile {
  return { app: "SVGenius", kind: "design-principles", version: 1, exportedAt: new Date().toISOString(), principles: list }
}

/** Same id updates in place, anything else is added (with a suffix on name clashes) */
export function mergePrinciples(current: DesignPrinciple[], raw: unknown): { next: DesignPrinciple[], added: number, updated: number } {
  const list = isObj(raw) && Array.isArray(raw.principles) ? raw.principles
    : Array.isArray(raw) ? raw
    : isObj(raw) && (raw.width !== undefined || raw.keylines !== undefined) ? [raw] : null
  if (!list) throw new Error("That file doesn't look like SVGenius design principles")
  const incoming = list.map(sanitisePrinciple).filter((p): p is DesignPrinciple => p !== null)
  if (!incoming.length) throw new Error("No design principles found in that file")
  const next = [...current]
  let added = 0, updated = 0
  for (const p of incoming) {
    const at = next.findIndex((c) => c.id === p.id)
    if (at >= 0) { next[at] = p; updated++; continue }
    let name = p.name, n = 2
    while (next.some((c) => c.name === name)) name = `${p.name} (${n++})`
    next.push({ ...p, name })
    added++
  }
  return { next, added, updated }
}

// ── Matching files ────────────────────────────────────────────────────────────

const globRe = (glob: string) => new RegExp(`^${glob.trim().replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i")

/** The handle a variation matches: the host's own, else the root id, else the file name */
export function handleOf(item: Pick<SvgItem, "name" | "handle" | "source">) {
  if (item.handle) return item.handle
  const id = item.source?.match(/<svg\b[^>]*?\sid\s*=\s*["']([^"']+)["']/i)?.[1]
  return id ?? baseName(item.name)
}

export const baseName = (name: string) => name.replace(/\.svg$/i, "")

export function variationMatches(v: DpVariation, item: Pick<SvgItem, "name" | "handle" | "source">) {
  if (!v.enabled || !v.match.trim()) return false
  const subject = v.by === "handle" ? handleOf(item) : baseName(item.name)
  return v.match.split(",").some((g) => g.trim() && globRe(g).test(subject))
}

/** Every matching variation, in order, as one adjustment */
export function variationAdjust(dp: DesignPrinciple, item: Pick<SvgItem, "name" | "handle" | "source">): ArtAdjust {
  return dp.variations.filter((v) => variationMatches(v, item)).reduce((a, v) => composeAdjust(a, { scale: v.scale, x: v.x, y: v.y }), IDENTITY)
}

export const gridOf = (dp: DesignPrinciple): GridSpec => ({ width: dp.width, height: dp.height, padding: dp.padding, fit: dp.fit, keylines: dp.keylines })

/** The keyline whose shape is closest to the artwork's (circles are reference only) */
export function pickKeyline(lines: Keyline[], w: number, h: number) {
  const boxes = lines.filter((k) => k.kind !== "circle")
  if (!boxes.length || !(w > 0 && h > 0)) return null
  const r = Math.log(w / h)
  return boxes.reduce((best, k) => (Math.abs(Math.log(k.w / k.h) - r) < Math.abs(Math.log(best.w / best.h) - r) ? k : best))
}

/** JSON for copying a file's tuning to the clipboard */
export const adjustToText = (a: ArtAdjust) => JSON.stringify({ svgenius: "adjust", scale: +a.scale.toFixed(6), ...(a.sy !== undefined && { sy: +a.sy.toFixed(6) }), x: +a.x.toFixed(4), y: +a.y.toFixed(4) })

export function adjustFromText(text: string): ArtAdjust | null {
  try {
    const raw = JSON.parse(text)
    if (!isObj(raw)) return null
    const scale = Number(raw.scale ?? 1), x = Number(raw.x ?? 0), y = Number(raw.y ?? 0)
    const sy = raw.sy === undefined ? scale : Number(raw.sy)
    if (![scale, sy, x, y].every(Number.isFinite) || scale <= 0 || sy <= 0 || (raw.scale === undefined && raw.x === undefined && raw.y === undefined)) return null
    return makeAdjust(scale, sy, x, y)
  } catch {
    return null
  }
}
