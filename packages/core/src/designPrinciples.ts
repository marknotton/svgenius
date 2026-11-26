import { isGuideShape } from "./shapes"
import type { ArtAdjust, DesignPrinciple, DpVariation, AlignmentKeyline, GridFit, GuideLineStyle, GridSpec, Keyline, MagicFit, MagicGroup, MagicKeylines, MagicPick, MagicRule, SmartRule, SmartTarget, SvgItem } from "./types"

// ── Design principles ─────────────────────────────────────────────────────────
// A brand's icon rules: the canvas, the live area inside its padding, the
// keyline shapes, and small per-file variations. Presets can fit their files
// to one, and Quickview draws its guides.

const id = () => crypto.randomUUID()

export const IDENTITY: ArtAdjust = { scale: 1, x: 0, y: 0 }
export const isIdentity = (a: ArtAdjust | null | undefined) =>
  !a || (a.scale === 1 && a.x === 0 && a.y === 0 && (a.sx ?? 1) === 1 && (a.sy ?? 1) === 1 && !a.r)

/** The scale across and down */
export const scalesOf = (a: ArtAdjust) => ({ X: a.scale * (a.sx ?? 1), Y: a.scale * (a.sy ?? 1) })

/** An adjustment from its scales across and down: uniform scale plus a vertical stretch when they differ */
export function fromScales(X: number, Y: number, x: number, y: number, r = 0): ArtAdjust {
  const sy = Y / X
  const turn = normAngle(r)
  return { scale: X, x, y, ...(Math.abs(sy - 1) < 1e-9 ? {} : { sy }), ...(Math.abs(turn) < 1e-9 ? {} : { r: turn }) }
}

/** Degrees in (-180, 180] */
export const normAngle = (deg: number) => { const d = ((deg % 360) + 540) % 360 - 180; return d === -180 ? 180 : d }

/**
 * An adjustment as a linear part and a move, both around the canvas centre:
 * p' = centre + t + L(p - centre). L is [a, b, c, d] in CSS matrix() order
 */
export interface Affine { L: [number, number, number, number], t: [number, number] }

export function toAffine(a: ArtAdjust): Affine {
  const { X, Y } = scalesOf(a)
  const th = ((a.r ?? 0) * Math.PI) / 180
  const cos = Math.cos(th), sin = Math.sin(th)
  return { L: [cos * X, sin * X, -sin * Y, cos * Y], t: [a.x, a.y] }
}

/** Back to an adjustment. Assumes no skew, which holds for everything built from adjustments here */
export function fromAffine(m: Affine): ArtAdjust {
  const [a, b, c, d] = m.L
  const X = Math.hypot(a, b)
  const th = Math.atan2(b, a)
  const Y = -c * Math.sin(th) + d * Math.cos(th)
  return fromScales(X, Y, m.t[0], m.t[1], (th * 180) / Math.PI)
}

/** n after m */
export function composeAffine(m: Affine, n: Affine): Affine {
  const [a1, b1, c1, d1] = m.L, [a2, b2, c2, d2] = n.L
  return {
    L: [a2 * a1 + c2 * b1, b2 * a1 + d2 * b1, a2 * c1 + c2 * d1, b2 * c1 + d2 * d1],
    t: [n.t[0] + a2 * m.t[0] + c2 * m.t[1], n.t[1] + b2 * m.t[0] + d2 * m.t[1]]
  }
}

export function invertAffine(m: Affine): Affine {
  const [a, b, c, d] = m.L
  const det = a * d - b * c || 1e-12
  const L: Affine["L"] = [d / det, -b / det, -c / det, a / det]
  return { L, t: [-(L[0] * m.t[0] + L[2] * m.t[1]), -(L[1] * m.t[0] + L[3] * m.t[1])] }
}

/** Where a point goes, around centre (cx, cy) */
export function applyAffine(m: Affine, cx: number, cy: number, x: number, y: number): [number, number] {
  const dx = x - cx, dy = y - cy
  return [cx + m.t[0] + m.L[0] * dx + m.L[2] * dy, cy + m.t[1] + m.L[1] * dx + m.L[3] * dy]
}

/** b after a: both around the same centre, offsets in the same units */
export const composeAdjust = (a: ArtAdjust, b: ArtAdjust): ArtAdjust => fromAffine(composeAffine(toAffine(a), toAffine(b)))

/** What turns a into b (d after a = b) */
export const diffAdjust = (a: ArtAdjust, b: ArtAdjust): ArtAdjust => fromAffine(composeAffine(invertAffine(toAffine(a)), toAffine(b)))

/** The four classic keylines, centred in the canvas */
function keylines(square: number, circle: number, long: number, short: number): Keyline[] {
  return [
    { id: id(), kind: "square", w: square, h: square },
    { id: id(), kind: "circle", w: circle, h: circle },
    { id: id(), kind: "portrait", w: short, h: long },
    { id: id(), kind: "landscape", w: long, h: short }
  ]
}

/** Alignment keylines. Material's centre circle is 10 of 24 (measured from its keyline image), scaled to the canvas */
export function alignmentGuides(size: number, { circle = true } = {}): AlignmentKeyline[] {
  return [
    ...(circle ? [{ id: id(), name: "Centre circle", enabled: true, kind: "circle" as const, w: +(size * 10 / 24).toFixed(4), h: +(size * 10 / 24).toFixed(4) }] : []),
    { id: id(), name: "Diagonals", enabled: true, kind: "diagonals", w: size, h: size, over: "canvas" },
    { id: id(), name: "Centre lines", enabled: true, kind: "centreLines", w: size, h: size }
  ]
}

/** Alignment keylines the built-ins come with, by id */
const BUILT_IN_ALIGNMENT: Record<string, () => AlignmentKeyline[]> = {
  "dp-material": () => alignmentGuides(24),
  "dp-material-symbols": () => alignmentGuides(960),
  "dp-lucide": () => alignmentGuides(24, { circle: false }),
  "dp-font-awesome": () => alignmentGuides(20, { circle: false }),
  "dp-meta": () => alignmentGuides(24, { circle: false })
}

function make(p: Omit<DesignPrinciple, "id" | "variations"> & { id: string }): DesignPrinciple {
  return { ...p, ...(BUILT_IN_ALIGNMENT[p.id] ? { alignmentKeylines: BUILT_IN_ALIGNMENT[p.id]() } : {}), variations: [] }
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
    keylines: keylines(18, 20, 20, 16), alignmentKeylines: alignmentGuides(24), stroke: 2, radius: 2, shape: null, variations: []
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
/** Only the style fields that are set and valid, so unstyled guides stay as they were */
export function sanitiseLineStyle(raw: Record<string, unknown>): GuideLineStyle {
  return {
    ...(raw.line === "solid" || raw.line === "dotted" || raw.line === "dashed" ? { line: raw.line } : {}),
    ...(raw.strokeWidth !== undefined && raw.strokeWidth !== null ? { strokeWidth: num(raw.strokeWidth, 0.25, 8, 1) } : {}),
    ...(typeof raw.colour === "string" && /^#[0-9a-f]{6}$/i.test(raw.colour.trim()) ? { colour: raw.colour.trim().toLowerCase() } : {}),
    ...(raw.opacity !== undefined && raw.opacity !== null ? { opacity: num(raw.opacity, 0, 1, 1) } : {})
  }
}

const ALIGN_KINDS: AlignmentKeyline["kind"][] = ["circle", "diagonals", "centreLines", "rect", "lines"]
const offsets = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter(Number.isFinite).slice(0, 200) : [])

export function sanitiseAlignment(raw: unknown, size: { width: number, height: number }): AlignmentKeyline[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw.flatMap((a): AlignmentKeyline[] => {
    if (!isObj(a) || !ALIGN_KINDS.includes(a.kind as AlignmentKeyline["kind"])) return []
    const kind = a.kind as AlignmentKeyline["kind"]
    return [{
      id: str(a.id, "", 100) || id(),
      name: str(a.name, "", 120),
      enabled: a.enabled !== false,
      kind,
      w: num(a.w, 0.01, 1e5, size.width),
      h: num(a.h, 0.01, 1e5, size.height),
      ...(kind === "rect" ? { r: num(a.r, 0, 1e5, 0) } : {}),
      ...(kind === "diagonals" ? { over: a.over === "live" ? "live" as const : "canvas" as const } : {}),
      ...(kind === "lines" ? { xs: offsets(a.xs), ys: offsets(a.ys) } : {}),
      ...sanitiseLineStyle(a)
    }]
  })
}

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
      ? [{ id: str(k.id, "", 100) || id(), kind: k.kind as Keyline["kind"], w: num(k.w, 0.01, 1e5, 1), h: num(k.h, 0.01, 1e5, 1), ...sanitiseLineStyle(k) }]
      : []) : base.keylines,
    ...((): { alignmentKeylines?: AlignmentKeyline[] } => {
      // Built-ins saved before alignment keylines existed pick up their defaults
      const list = sanitiseAlignment(raw.alignmentKeylines, { width, height }) ?? BUILT_IN_ALIGNMENT[str(raw.id, "", 100)]?.()
      return list ? { alignmentKeylines: list } : {}
    })(),
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
export const adjustToText = (a: ArtAdjust) => JSON.stringify({
  svgenius: "adjust", scale: +a.scale.toFixed(6), x: +a.x.toFixed(4), y: +a.y.toFixed(4),
  ...((a.sx ?? 1) !== 1 ? { sx: +(a.sx ?? 1).toFixed(6) } : {}), ...((a.sy ?? 1) !== 1 ? { sy: +(a.sy ?? 1).toFixed(6) } : {}),
  ...(a.r ? { r: +a.r.toFixed(4) } : {})
})

export function adjustFromText(text: string): ArtAdjust | null {
  try {
    const raw = JSON.parse(text)
    if (!isObj(raw)) return null
    const scale = Number(raw.scale ?? 1), x = Number(raw.x ?? 0), y = Number(raw.y ?? 0)
    const sx = Number(raw.sx ?? 1), sy = Number(raw.sy ?? 1), r = Number(raw.r ?? 0)
    if (![scale, x, y, sx, sy, r].every(Number.isFinite) || scale <= 0 || sx <= 0 || sy <= 0 || (raw.scale === undefined && raw.x === undefined && raw.y === undefined && raw.r === undefined)) return null
    return fromScales(scale * sx, scale * sy, x, y, r)
  } catch {
    return null
  }
}

// ── Smart Sizing ──────────────────────────────────────────────────────────────
// Each file is sorted by its artwork's shape: square (within a tolerance of
// 1:1), tall or wide, and each group fits its own keyline

export const MAGIC_GROUPS: MagicGroup[] = ["square", "tall", "wide"]

export function defaultMagic(): MagicKeylines {
  return {
    enabled: true,
    tolerance: null,
    rules: {
      square: { keyline: "square", fit: "contain" },
      tall: { keyline: "portrait", fit: "height" },
      wide: { keyline: "landscape", fit: "width" }
    }
  }
}

const MAGIC_KEYS: SmartTarget[] = ["square", "circle", "portrait", "landscape", "live", "canvas"]
const MAGIC_FITS: MagicFit[] = ["contain", "height", "width", "stretch"]

export function sanitiseMagic(raw: unknown): MagicKeylines | null {
  if (!isObj(raw)) return null
  const base = defaultMagic()
  const rules = isObj(raw.rules) ? raw.rules : {}
  const rule = (g: MagicGroup): MagicRule => {
    const r = isObj(rules[g]) ? rules[g] as Record<string, unknown> : {}
    const own = Array.isArray(r.advanced) ? r.advanced.flatMap((x) => (isObj(x) ? [sanitiseSmartRule(x)] : [])) : []
    return {
      keyline: MAGIC_KEYS.includes(r.keyline as MagicRule["keyline"]) ? r.keyline as MagicRule["keyline"] : base.rules[g].keyline,
      fit: MAGIC_FITS.includes(r.fit as MagicFit) ? r.fit as MagicFit : base.rules[g].fit,
      ...(own.length ? { advanced: own } : {})
    }
  }
  const tol = raw.tolerance === null || raw.tolerance === undefined ? NaN : Number(raw.tolerance)
  return {
    enabled: raw.enabled === true,
    tolerance: Number.isFinite(tol) ? Math.min(50, Math.max(0, tol)) : null,
    rules: { square: rule("square"), tall: rule("tall"), wide: rule("wide") },
    advanced: Array.isArray(raw.advanced) ? raw.advanced.flatMap((r) => (isObj(r) ? [sanitiseSmartRule(r)] : [])) : []
  }
}

/** Square when the longer side is within tolerance% of the shorter */
export const DEFAULT_SQUARE_TOLERANCE = 10

export function magicGroup(w: number, h: number, tolerance: number = DEFAULT_SQUARE_TOLERANCE): MagicGroup {
  const r = w / h
  const t = 1 + Math.max(0, tolerance) / 100
  return r > t ? "wide" : r < 1 / t ? "tall" : "square"
}

/** The box a group fits into: its keyline, else the closest keyline by shape, else the live area */
export function magicTarget(grid: GridSpec, rule: MagicRule, w: number, h: number) {
  const liveW = Math.max(1e-3, grid.width - grid.padding * 2), liveH = Math.max(1e-3, grid.height - grid.padding * 2)
  if (rule.keyline === "canvas") return { w: grid.width, h: grid.height, keyline: "canvas" as const, fallback: false }
  if (rule.keyline === "live") return { w: liveW, h: liveH, keyline: "live" as const, fallback: false }
  const k = grid.keylines.find((l) => l.kind === rule.keyline)
  if (k) return { w: k.w, h: k.h, keyline: k.kind, fallback: false }
  const near = pickKeyline(grid.keylines, w, h)
  return near ? { w: near.w, h: near.h, keyline: near.kind, fallback: true } : { w: liveW, h: liveH, keyline: "live" as const, fallback: true }
}

export const MAGIC_LABELS: Record<SmartTarget, string> = { square: "Square", circle: "Circle", portrait: "Portrait", landscape: "Landscape", live: "Live area", canvas: "ViewBox" }
export const GROUP_LABELS: Record<MagicGroup, string> = { square: "Square", tall: "Tall", wide: "Wide" }

/** "1.22:1" style ratio, longer side first */
export const ratioText = (w: number, h: number) => `${+(Math.max(w, h) / Math.min(w, h)).toFixed(2)}:1`

// ── Smart Sizing advanced rules ───────────────────────────────────────────────

const RULE_OPS: SmartRule["op"][] = ["is", "lt", "gt", "eq", "between"]
const RULE_MEASURES: SmartRule["measure"][] = ["shape", "ratio", "width", "height"]

export function createSmartRule(): SmartRule {
  return { id: id(), enabled: true, of: "artwork", measure: "ratio", op: "gt", shape: "wide", value: 2, value2: 3, valueText: "2:1", value2Text: "3:1", unit: "%", keyline: "canvas", fit: "width" }
}

function sanitiseSmartRule(r: Record<string, unknown>): SmartRule {
  const base = createSmartRule()
  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d)
  const measure = RULE_MEASURES.includes(r.measure as SmartRule["measure"]) ? r.measure as SmartRule["measure"] : base.measure
  const op = RULE_OPS.includes(r.op as SmartRule["op"]) ? r.op as SmartRule["op"] : base.op
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 20) : undefined)
  return {
    id: typeof r.id === "string" && r.id ? r.id : base.id,
    enabled: r.enabled !== false,
    of: r.of === "viewbox" ? "viewbox" : "artwork",
    measure,
    op: measure === "shape" ? "is" : op === "is" ? "gt" : op,
    shape: MAGIC_GROUPS.includes(r.shape as MagicGroup) ? r.shape as MagicGroup : base.shape,
    value: num(r.value, base.value),
    value2: num(r.value2, base.value2),
    valueText: text(r.valueText),
    value2Text: text(r.value2Text),
    // Rules saved before units existed measured viewBox units
    unit: r.unit === "%" ? "%" : "units",
    against: r.against === "ref" ? "ref" : "number",
    ref: MAGIC_KEYS.includes(r.ref as SmartTarget) ? r.ref as SmartTarget : "portrait",
    refDim: r.refDim === "height" || r.refDim === "ratio" ? r.refDim : "width",
    keyline: MAGIC_KEYS.includes(r.keyline as SmartTarget) ? r.keyline as SmartTarget : base.keyline,
    fit: MAGIC_FITS.includes(r.fit as MagicFit) ? r.fit as MagicFit : base.fit
  }
}

/** "3:2", "1.5" or "1.5:1" → 1.5 (width ÷ height). NaN when it doesn't read */
export function parseRatio(text: string) {
  const m = text.trim().match(/^(\d*\.?\d+)\s*(?:[:x×/]\s*(\d*\.?\d+))?$/i)
  if (!m) return NaN
  const a = Number(m[1]), b = m[2] === undefined ? 1 : Number(m[2])
  return a > 0 && b > 0 ? a / b : NaN
}

/** 1.5 → "3:2"-ish text when it's a tidy fraction, else "1.5:1" */
export function ratioLabel(v: number) {
  for (const d of [1, 2, 3, 4, 5, 8, 9, 10, 16]) {
    const n = v * d
    if (Math.abs(n - Math.round(n)) < 1e-6 && Math.round(n) > 0) return `${Math.round(n)}:${d}`
  }
  return `${+v.toFixed(3)}:1`
}

/** Plain words for an aspect ratio: "1.5× wider than tall", "square", "2× taller than wide" */
export function ratioWords(v: number) {
  if (!(v > 0)) return ""
  if (Math.abs(v - 1) < 1e-9) return "as wide as tall"
  return v > 1 ? `${+v.toFixed(2)}× wider than tall` : `${+(1 / v).toFixed(2)}× taller than wide`
}

export interface SmartSizes {
  art: { w: number, h: number }
  viewBox: { w: number, h: number } | null
  /** The design principle, for rules that compare against a keyline */
  grid?: GridSpec | null
}

/** A keyline, the live area or the canvas's size in the design principle; null when it isn't there */
export function targetSize(grid: GridSpec, t: SmartTarget) {
  if (t === "canvas") return { w: grid.width, h: grid.height }
  if (t === "live") return { w: Math.max(1e-3, grid.width - grid.padding * 2), h: Math.max(1e-3, grid.height - grid.padding * 2) }
  const k = grid.keylines.find((l) => l.kind === t)
  return k ? { w: k.w, h: k.h } : null
}

/** Is the rule comparing against a keyline (and not "is between", which takes numbers)? */
export const comparesToRef = (r: SmartRule) => r.measure !== "shape" && r.against === "ref" && r.op !== "between"

/** Does one advanced rule match? Equals means within the square tolerance */
export function smartRuleMatches(r: SmartRule, sizes: SmartSizes, tolerance: number) {
  const box = r.of === "viewbox" ? sizes.viewBox : sizes.art
  if (!r.enabled || !box || !(box.w > 0 && box.h > 0)) return false
  if (r.measure === "shape") return magicGroup(box.w, box.h, tolerance) === r.shape
  let v = r.measure === "ratio" ? box.w / box.h : r.measure === "width" ? box.w : box.h
  if (comparesToRef(r)) {
    // Against a keyline: aspect ratios compare as they are. Sizes compare as a share of the
    // canvas (the artwork in its viewBox, the keyline in the design principle), since the two
    // are drawn in different units; the viewBox's own size compares in units
    const grid = sizes.grid
    const k = grid ? targetSize(grid, r.ref ?? "portrait") : null
    if (!grid || !k) return false
    const dim = r.refDim ?? "width"
    let ref = dim === "ratio" ? k.w / k.h : dim === "width" ? k.w : k.h
    if (r.measure !== "ratio" && dim !== "ratio") {
      if (r.of === "artwork") {
        const vb = sizes.viewBox
        if (!vb) return false
        v = v / (r.measure === "width" ? vb.w : vb.h)
        ref = ref / (dim === "width" ? grid.width : grid.height)
      }
    } else if ((r.measure === "ratio") !== (dim === "ratio")) return false
    const t = 1 + Math.max(0, tolerance) / 100
    return r.op === "lt" ? v < ref : r.op === "gt" ? v > ref : r.op === "eq" ? v <= ref * t && v >= ref / t : false
  }
  // % of the canvas: the artwork against the viewBox (the viewBox itself is always 100%)
  if (r.measure !== "ratio" && r.unit === "%") {
    const vb = sizes.viewBox
    if (!vb) return false
    v = (v / (r.measure === "width" ? vb.w : vb.h)) * 100
  }
  const t = 1 + Math.max(0, tolerance) / 100
  switch (r.op) {
    case "lt": return v < r.value
    case "gt": return v > r.value
    case "eq": return r.value > 0 && v <= r.value * t && v >= r.value / t
    case "between": return v >= Math.min(r.value, r.value2) && v <= Math.max(r.value, r.value2)
    default: return false
  }
}

const OP_SHORT: Record<SmartRule["op"], string> = { is: "is", lt: "<", gt: ">", eq: "=", between: "between" }

const valueOf = (r: SmartRule, second = false) => {
  const v = second ? r.value2 : r.value
  if (r.measure === "ratio") return (second ? r.value2Text : r.valueText) ?? ratioLabel(v)
  return `${+v.toFixed(3)}${r.unit === "%" ? "%" : ""}`
}

/** "ratio > 3:2" style summary, for tags */
export function smartRuleText(r: SmartRule) {
  const of = r.of === "viewbox" ? "viewBox " : ""
  if (r.measure === "shape") return `${of}${r.shape}`
  if (comparesToRef(r)) return `${of}${r.measure} ${OP_SHORT[r.op]} ${MAGIC_LABELS[r.ref ?? "portrait"]} ${r.refDim === "ratio" ? "ratio" : r.refDim ?? "width"}`
  const m = r.measure === "ratio" ? "ratio" : r.measure
  const v = r.op === "between" ? `${valueOf(r)}–${valueOf(r, true)}` : valueOf(r)
  return `${of}${m} ${OP_SHORT[r.op]} ${v}`
}

const FIT_WORDS: Record<MagicFit, string> = { contain: "fitted inside", height: "sized to its height", width: "sized to its width", stretch: "stretched to fill it" }

const refName = (t: SmartTarget) => (t === "canvas" ? "the viewBox" : t === "live" ? "the live area" : `the ${MAGIC_LABELS[t]} keyline`)

/** One plain sentence: "Artwork more than 1.5× wider than tall goes in the landscape keyline, sized to its width" */
export function smartRuleSentence(r: SmartRule) {
  const who = r.of === "viewbox" ? "Files whose viewBox is" : "Artwork"
  let cond: string
  if (r.measure === "shape") cond = r.of === "viewbox" ? `${who} ${r.shape}` : `${r.shape[0].toUpperCase()}${r.shape.slice(1)} artwork`
  else if (comparesToRef(r)) {
    const dim = r.refDim ?? "width", ref = refName(r.ref ?? "portrait")
    const same = r.measure === dim
    const word = { width: ["narrower than", "wider than", "as wide as"], height: ["shorter than", "taller than", "as tall as"], ratio: ["with a smaller aspect ratio than", "with a bigger aspect ratio than", "with the same aspect ratio as"] }[r.measure]
    const i = r.op === "lt" ? 0 : r.op === "gt" ? 1 : 2
    const subject = r.of === "viewbox" ? "Files whose viewBox is" : "Artwork"
    cond = same ? `${subject} ${word[i]} ${ref}` : `${subject} ${r.measure} ${["less than", "more than", "about"][i]} ${ref}'s ${dim === "ratio" ? "aspect ratio" : dim}`
  } else if (r.measure === "ratio") {
    const v1 = `${valueOf(r)} (${ratioWords(r.value)})`
    const words = r.op === "lt" ? `under ${v1}` : r.op === "gt" ? `over ${v1}` : r.op === "eq" ? `of about ${v1}`
      : `between ${valueOf(r)} and ${valueOf(r, true)}`
    cond = `${r.of === "viewbox" ? "Files with a viewBox aspect ratio" : "Artwork with an aspect ratio"} ${words}`
  } else {
    const side = r.measure
    const unit = r.unit === "%" ? `% of the canvas ${side}` : " viewBox units"
    const n = (v: number) => `${+v.toFixed(3)}${unit}`
    const words = r.op === "lt" ? `under ${n(r.value)}` : r.op === "gt" ? `over ${n(r.value)}` : r.op === "eq" ? `about ${n(r.value)}` : `between ${+r.value.toFixed(3)} and ${n(r.value2)}`
    cond = `${r.of === "viewbox" ? "Files whose viewBox" : "Artwork whose"} ${side} is ${words}`
  }
  const where = r.keyline === "canvas" ? "the whole viewBox" : r.keyline === "live" ? "the live area" : `the ${MAGIC_LABELS[r.keyline].toLowerCase()} keyline`
  return `${cond} ${cond.startsWith("Files") ? "go" : "goes"} in ${where}, ${FIT_WORDS[r.fit]}`
}

/** The rule or group a file's artwork goes to */
/** The rule or card a file's artwork goes to: its shape's own rules, then the rules for every shape, then its shape's card */
export function smartPick(magic: MagicKeylines, sizes: SmartSizes, tolerance: number): Pick<MagicPick, "group" | "rule" | "ruleText" | "ruleGroup"> & { target: MagicRule } {
  const group = magicGroup(sizes.art.w, sizes.art.h, tolerance)
  const own = magic.rules[group].advanced ?? []
  const j = own.findIndex((r) => smartRuleMatches(r, sizes, tolerance))
  if (j >= 0) return { group, rule: j + 1, ruleGroup: group, ruleText: smartRuleText(own[j]), target: { keyline: own[j].keyline, fit: own[j].fit } }
  const list = magic.advanced ?? []
  const i = list.findIndex((r) => smartRuleMatches(r, sizes, tolerance))
  if (i >= 0) return { group, rule: i + 1, ruleText: smartRuleText(list[i]), target: { keyline: list[i].keyline, fit: list[i].fit } }
  return { group, target: { keyline: magic.rules[group].keyline, fit: magic.rules[group].fit } }
}

/** "Tall rule 2" or "Rule 2" */
export const ruleName = (m: Pick<MagicPick, "rule" | "ruleGroup">) => (m.ruleGroup ? `${GROUP_LABELS[m.ruleGroup]} rule ${m.rule}` : `All-shapes rule ${m.rule}`)

// ── Alignment keylines ────────────────────────────────────────────────────────

/** One alignment keyline as path data, in canvas units */
export function alignmentPath(a: AlignmentKeyline, dp: Pick<DesignPrinciple, "width" | "height" | "padding">): string {
  const W = dp.width, H = dp.height, cx = W / 2, cy = H / 2
  const f = (n: number) => +n.toFixed(4)
  switch (a.kind) {
    case "circle": {
      const rx = a.w / 2, ry = a.h / 2
      return `M${f(cx - rx)} ${f(cy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(rx * 2)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-rx * 2)} 0Z`
    }
    case "rect": {
      const w = a.w, h = a.h, x = cx - w / 2, y = cy - h / 2, r = Math.min(a.r ?? 0, w / 2, h / 2)
      if (!r) return `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`
      return `M${f(x + r)} ${f(y)}h${f(w - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(r)}v${f(h - 2 * r)}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(r)}h${f(-(w - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(-r)} ${f(-r)}v${f(-(h - 2 * r))}a${f(r)} ${f(r)} 0 0 1 ${f(r)} ${f(-r)}Z`
    }
    case "diagonals": {
      const p = a.over === "live" ? dp.padding : 0
      return `M${f(p)} ${f(p)}L${f(W - p)} ${f(H - p)}M${f(W - p)} ${f(p)}L${f(p)} ${f(H - p)}`
    }
    case "centreLines":
      return `M${f(cx)} 0V${f(H)}M0 ${f(cy)}H${f(W)}`
    case "lines":
      return [...(a.xs ?? []).map((x) => `M${f(x)} 0V${f(H)}`), ...(a.ys ?? []).map((y) => `M0 ${f(y)}H${f(W)}`)].join("")
  }
}

export const ALIGNMENT_LABELS: Record<AlignmentKeyline["kind"], string> = {
  circle: "Circle", diagonals: "Diagonals", centreLines: "Centre lines", rect: "Rectangle", lines: "Lines"
}

/** A short description: "Circle 10", "Diagonals across the live area", "Lines at x 8, 16" */
export function alignmentText(a: AlignmentKeyline): string {
  const n = (v: number) => String(+v.toFixed(2))
  switch (a.kind) {
    case "circle": return a.w === a.h ? `${n(a.w)} across` : `${n(a.w)} × ${n(a.h)}`
    case "rect": return `${n(a.w)} × ${n(a.h)}${a.r ? `, radius ${n(a.r)}` : ""}`
    case "diagonals": return a.over === "live" ? "Corner to corner of the live area" : "Corner to corner of the canvas"
    case "centreLines": return "Through the middle, both ways"
    case "lines": return [a.xs?.length ? `x ${a.xs.map(n).join(", ")}` : "", a.ys?.length ? `y ${a.ys.map(n).join(", ")}` : ""].filter(Boolean).join(" · ") || "No lines yet"
  }
}

export function createAlignment(kind: AlignmentKeyline["kind"], dp: Pick<DesignPrinciple, "width" | "height">): AlignmentKeyline {
  const s = Math.min(dp.width, dp.height)
  return {
    id: id(), name: ALIGNMENT_LABELS[kind], enabled: true, kind,
    w: kind === "circle" || kind === "rect" ? +(s / 2).toFixed(4) : dp.width,
    h: kind === "circle" || kind === "rect" ? +(s / 2).toFixed(4) : dp.height,
    ...(kind === "rect" ? { r: 0 } : {}),
    ...(kind === "diagonals" ? { over: "canvas" as const } : {}),
    ...(kind === "lines" ? { xs: [+(dp.width / 3).toFixed(4), +(dp.width * 2 / 3).toFixed(4)], ys: [+(dp.height / 3).toFixed(4), +(dp.height * 2 / 3).toFixed(4)] } : {})
  }
}

/** Default looks, matching the CSS: alignment keylines faint grey dashes, keylines solid blue */
export const LINE_DEFAULTS = {
  alignment: { line: "dashed", strokeWidth: 0.75, colour: "#78788c", opacity: 0.55 },
  keyline: { line: "solid", strokeWidth: 1, colour: "#2b8be6", opacity: 0.8 }
} as const

/** Inline SVG style for a guide line: only what's been changed, so CSS keeps the rest */
export function lineStyle(a: GuideLineStyle, kind: keyof typeof LINE_DEFAULTS = "alignment"): Record<string, string | number> {
  const d = LINE_DEFAULTS[kind]
  const w = a.strokeWidth ?? d.strokeWidth
  const dash = a.line ?? d.line
  const changed = a.line !== undefined || a.strokeWidth !== undefined
  return {
    ...(a.colour ? { stroke: a.colour } : {}),
    ...(a.opacity !== undefined ? { opacity: a.opacity } : {}),
    ...(a.strokeWidth !== undefined ? { strokeWidth: `${w}px` } : {}),
    ...(changed ? dash === "solid" ? { strokeDasharray: "none" } : dash === "dotted" ? { strokeDasharray: `0.01 ${Math.max(w * 2.5, 2.5)}`, strokeLinecap: "round" } : { strokeDasharray: `${Math.max(w * 4, 3)} ${Math.max(w * 2.5, 2)}` } : {})
  }
}
export const alignmentStyle = (a: AlignmentKeyline) => lineStyle(a, "alignment")

// ── Areas to align to ─────────────────────────────────────────────────────────

/** A box in the design principle's own units, for aligning artwork to */
export interface DpArea { id: string, label: string, x: number, y: number, w: number, h: number }

const KEYLINE_LABELS: Record<Keyline["kind"], string> = { square: "Square", circle: "Circle", portrait: "Portrait", landscape: "Landscape" }

/** The live area, each keyline, and the boxed alignment keylines (circles, rectangles), centred like GridGuides draws them */
export function dpAreas(dp: Pick<DesignPrinciple, "width" | "height" | "padding" | "keylines" | "alignmentKeylines">): DpArea[] {
  const W = dp.width, H = dp.height, n = (v: number) => String(+v.toFixed(2))
  const centred = (id: string, label: string, w: number, h: number): DpArea => ({ id, label, x: (W - w) / 2, y: (H - h) / 2, w, h })
  const out: DpArea[] = []
  if (dp.padding > 0) out.push(centred("live", `Live area (${n(W - dp.padding * 2)} × ${n(H - dp.padding * 2)})`, W - dp.padding * 2, H - dp.padding * 2))
  for (const k of dp.keylines) out.push(centred(`key:${k.id}`, `${KEYLINE_LABELS[k.kind]} keyline (${k.w === k.h ? n(k.w) : `${n(k.w)} × ${n(k.h)}`})`, k.w, k.h))
  for (const a of dp.alignmentKeylines ?? []) {
    if (!a.enabled || (a.kind !== "circle" && a.kind !== "rect")) continue
    out.push(centred(`align:${a.id}`, `${a.name || ALIGNMENT_LABELS[a.kind]} (${a.w === a.h ? n(a.w) : `${n(a.w)} × ${n(a.h)}`})`, a.w, a.h))
  }
  return out
}

/** Design principle units → a viewBox's units: the principle's canvas fitted in the middle, shorter side, as GridGuides draws it */
export function dpToViewBox(dp: Pick<DesignPrinciple, "width" | "height">, vb: { x: number, y: number, w: number, h: number }) {
  const k = Math.min(vb.w / dp.width, vb.h / dp.height)
  const ox = vb.x + (vb.w - dp.width * k) / 2, oy = vb.y + (vb.h - dp.height * k) / 2
  return { k, x: (u: number) => ox + u * k, y: (u: number) => oy + u * k }
}
