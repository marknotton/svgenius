import { svgDataUrl } from "./format"
import { mergeOverlappingPaths } from "./mergePaths"
import { flattenTransforms } from "./flattenTransforms"
import { cutOutFakeClipping } from "./cutOuts"
import { geometryBounds } from "./geomBounds"
import { activeCutMatchers } from "./settings"
import { fmtNum, getAttr, parseLength, parseViewBox, replaceRoot, rootTag, setAttr, type ViewBox } from "./svgRoot"
import type { ArtTransform, GeometryEffect, SvgoSettings, TrimSettings } from "./types"

// ── Trim whitespace ───────────────────────────────────────────────────────────
// Renders the SVG to a canvas and scans for visible pixels, so strokes, filters
// and transforms all count. Runs on the main thread because workers can't
// decode SVG images.

const SCAN = 2048

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Couldn't render the SVG to measure it"))
    img.src = src
  })
}

/** Renders the viewBox area to pixels (RGBA), longest side `size` px */
export async function renderPixels(svg: string, vb: ViewBox, size: number) {
  const scale = size / Math.max(vb.w, vb.h)
  const cw = Math.max(1, Math.round(vb.w * scale))
  const ch = Math.max(1, Math.round(vb.h * scale))

  // Render at a fixed size with a stretch-free mapping from viewBox to pixels
  let tag = rootTag(svg) as string
  tag = setAttr(tag, "width", String(cw))
  tag = setAttr(tag, "height", String(ch))
  tag = setAttr(tag, "viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`)
  tag = setAttr(tag, "preserveAspectRatio", "none")
  const img = await loadImage(svgDataUrl(replaceRoot(svg, tag)))

  const canvas = document.createElement("canvas")
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) throw new Error("Canvas isn't available")
  ctx.drawImage(img, 0, 0, cw, ch)
  return { data: ctx.getImageData(0, 0, cw, ch).data, cw, ch, scale }
}

/** Visible bounds in viewBox units, or null if nothing is drawn */
async function contentBounds(svg: string, vb: ViewBox): Promise<ViewBox | null> {
  const { data, cw, ch, scale } = await renderPixels(svg, vb, SCAN)

  let minX = cw, minY = ch, maxX = -1, maxY = -1
  for (let y = 0; y < ch; y++) {
    const row = y * cw * 4
    for (let x = 0; x < cw; x++) {
      if (data[row + x * 4 + 3] > 2) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  // Anti-aliased edge pixels are only partly covered. Their strongest alpha
  // says how much, which gets the bounds to well under a pixel
  const colCover = (x: number) => {
    let a = 0
    for (let y = minY; y <= maxY; y++) a = Math.max(a, data[(y * cw + x) * 4 + 3])
    return a / 255
  }
  const rowCover = (y: number) => {
    let a = 0
    for (let x = minX; x <= maxX; x++) a = Math.max(a, data[(y * cw + x) * 4 + 3])
    return a / 255
  }
  // Compared with the next pixel in, so translucent artwork isn't mistaken for a soft edge
  const frac = (edge: number, inner: number) => (inner > 0 ? Math.min(1, edge / inner) : 1)
  const fx0 = frac(colCover(minX), minX < maxX ? colCover(minX + 1) : 1)
  const fx1 = frac(colCover(maxX), maxX > minX ? colCover(maxX - 1) : 1)
  const fy0 = frac(rowCover(minY), minY < maxY ? rowCover(minY + 1) : 1)
  const fy1 = frac(rowCover(maxY), maxY > minY ? rowCover(maxY - 1) : 1)
  // Content touching an edge snaps to it exactly
  const x0 = minX === 0 ? vb.x : vb.x + (minX + 1 - fx0) / scale
  const y0 = minY === 0 ? vb.y : vb.y + (minY + 1 - fy0) / scale
  const x1 = maxX === cw - 1 ? vb.x + vb.w : vb.x + (maxX + fx1) / scale
  const y1 = maxY === ch - 1 ? vb.y + vb.h : vb.y + (maxY + fy1) / scale
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** Curve-exact bounds, clipped to the viewBox like a render would be */
async function exactBounds(svg: string, vb: ViewBox): Promise<ViewBox | null> {
  const g = await geometryBounds(svg).catch(() => null)
  if (!g) return null
  const x0 = Math.max(g.x, vb.x), y0 = Math.max(g.y, vb.y)
  const x1 = Math.min(g.x + g.w, vb.x + vb.w), y1 = Math.min(g.y + g.h, vb.y + vb.h)
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
}

export async function trimSvg(svg: string, trim: TrimSettings, precision: number) {
  const tag = rootTag(svg)
  if (!tag) return svg
  const width = parseLength(getAttr(tag, "width"))
  const height = parseLength(getAttr(tag, "height"))
  const vb = parseViewBox(getAttr(tag, "viewBox"))
    ?? (width && height ? { x: 0, y: 0, w: width, h: height } : null)
  if (!vb) return svg

  const box = (await exactBounds(svg, vb)) ?? await contentBounds(svg, vb)
  if (!box || ![box.x, box.y, box.w, box.h].every(Number.isFinite)) return svg

  const pad = trim.unit === "%" ? (Math.max(box.w, box.h) * trim.padding) / 100 : trim.padding
  // Never let a big inset flip the box inside out
  const p = Math.max(pad, -Math.min(box.w, box.h) / 2 + 1e-3)
  let next = { x: box.x - p, y: box.y - p, w: box.w + p * 2, h: box.h + p * 2 }

  // Preserve: grow the short side so the original aspect ratio survives,
  // keeping the artwork centred
  if (trim.aspect === "preserve") {
    const ratio = vb.w / vb.h
    if (next.w / next.h < ratio) {
      const w = next.h * ratio
      next = { ...next, x: next.x - (w - next.w) / 2, w }
    } else {
      const h = next.w / ratio
      next = { ...next, y: next.y - (h - next.h) / 2, h }
    }
  }

  const digits = Math.max(precision, 2)
  const f = (n: number) => fmtNum(n, digits)
  // Round outwards, so rounding never shaves the artwork
  const q = 10 ** digits
  const x0 = Math.floor(next.x * q + 1e-6) / q, y0 = Math.floor(next.y * q + 1e-6) / q
  const x1 = Math.ceil((next.x + next.w) * q - 1e-6) / q, y1 = Math.ceil((next.y + next.h) * q - 1e-6) / q
  next = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  let out = setAttr(tag, "viewBox", `${f(next.x)} ${f(next.y)} ${f(next.w)} ${f(next.h)}`)
  // One uniform scale for both sides, so width/height always match the new
  // viewBox's aspect ratio and nothing gets letterboxed back in
  if (width !== null || height !== null) {
    const k = width !== null && height !== null
      ? Math.min(width / vb.w, height / vb.h)
      : width !== null ? width / vb.w : (height as number) / vb.h
    out = setAttr(out, "width", f(next.w * k))
    out = setAttr(out, "height", f(next.h * k))
  }
  // A leftover preserveAspectRatio could still pad or crop
  out = out.replace(/\spreserveAspectRatio="[^"]*"/, "")
  return replaceRoot(svg, out)
}

// ── Optical centring (Beta) ───────────────────────────────────────────────────
// A box-centred icon often looks off, usually too low or too high, because the
// eye centres on where the ink is, not on the outline. This finds the
// artwork's centre of mass (from a render, so strokes and overlaps count),
// moves part of the way from the box centre towards it, and shifts the viewBox
// so that point sits in the middle. Never moves the artwork past an edge.

const OPTICAL_SCAN = 512

export async function opticalCentreSvg(svg: string, strength: number, precision: number) {
  const tag = rootTag(svg)
  if (!tag || strength <= 0) return svg
  const width = parseLength(getAttr(tag, "width"))
  const height = parseLength(getAttr(tag, "height"))
  const vb = parseViewBox(getAttr(tag, "viewBox"))
    ?? (width && height ? { x: 0, y: 0, w: width, h: height } : null)
  if (!vb) return svg

  const box = (await exactBounds(svg, vb)) ?? await contentBounds(svg, vb)
  if (!box) return svg
  const mass = await centreOfMass(svg, vb)
  if (!mass) return svg

  const k = Math.min(1, strength)
  const bx = box.x + box.w / 2, by = box.y + box.h / 2
  const tx = bx + (mass.x - bx) * k, ty = by + (mass.y - by) * k
  // How far the artwork has to travel, kept inside the viewBox
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
  const dx = clamp(vb.x + vb.w / 2 - tx, vb.x - box.x, vb.x + vb.w - (box.x + box.w))
  const dy = clamp(vb.y + vb.h / 2 - ty, vb.y - box.y, vb.y + vb.h - (box.y + box.h))
  const digits = Math.max(precision, 2)
  const q = 10 ** digits
  const rdx = Math.round(dx * q) / q, rdy = Math.round(dy * q) / q
  if (!rdx && !rdy) return svg
  // Moving the viewBox the other way moves the artwork without touching it
  const f = (n: number) => fmtNum(n, digits)
  const out = setAttr(tag, "viewBox", `${f(vb.x - rdx)} ${f(vb.y - rdy)} ${f(vb.w)} ${f(vb.h)}`)
  return replaceRoot(svg, out)
}

/** Ink-weighted centre of the artwork in viewBox units */
async function centreOfMass(svg: string, vb: ViewBox) {
  const { data, cw, ch, scale } = await renderPixels(svg, vb, OPTICAL_SCAN)
  let sum = 0, sx = 0, sy = 0
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const a = data[(y * cw + x) * 4 + 3]
      if (a === 0) continue
      sum += a; sx += a * (x + 0.5); sy += a * (y + 0.5)
    }
  }
  return sum > 0 ? { x: vb.x + sx / sum / scale, y: vb.y + sy / sum / scale } : null
}

// ── Output scale ──────────────────────────────────────────────────────────────

/** Multiplies width/height. Adds them from the viewBox if the file has none */
export function scaleSvg(svg: string, scale: number, precision: number) {
  if (scale === 1) return svg
  const tag = rootTag(svg)
  if (!tag) return svg
  const vb = parseViewBox(getAttr(tag, "viewBox"))
  const width = parseLength(getAttr(tag, "width")) ?? vb?.w ?? null
  const height = parseLength(getAttr(tag, "height")) ?? vb?.h ?? null
  if (width === null || height === null) return svg
  // Without a viewBox the drawing wouldn't scale, so pin one first
  let out = vb ? tag : setAttr(tag, "viewBox", `0 0 ${width} ${height}`)
  const f = (n: number) => fmtNum(n, Math.max(precision, 3))
  out = setAttr(out, "width", f(width * scale))
  out = setAttr(out, "height", f(height * scale))
  return replaceRoot(svg, out)
}

/** Sets one side to an exact size; the other follows the viewBox's aspect ratio */
export function resizeSvg(svg: string, side: "width" | "height", px: number, precision: number) {
  const tag = rootTag(svg)
  if (!tag || !(px > 0)) return svg
  const vb = parseViewBox(getAttr(tag, "viewBox"))
  const width = parseLength(getAttr(tag, "width")) ?? vb?.w ?? null
  const height = parseLength(getAttr(tag, "height")) ?? vb?.h ?? null
  if (!width || !height) return svg
  const ratio = vb ? vb.w / vb.h : width / height
  let out = vb ? tag : setAttr(tag, "viewBox", `0 0 ${width} ${height}`)
  const f = (n: number) => fmtNum(n, Math.max(precision, 3))
  out = setAttr(out, "width", f(side === "width" ? px : px * ratio))
  out = setAttr(out, "height", f(side === "height" ? px : px / ratio))
  return replaceRoot(svg, out)
}

// ── Artwork transform ────────────────────────────────────────────────────────

/** Wraps the artwork in a <g> that scales around the viewBox centre and offsets it */
export function transformSvg(svg: string, b: ArtTransform) {
  if (b.scale === 1 && b.offsetX === 0 && b.offsetY === 0) return svg
  const tag = rootTag(svg)
  if (!tag) return svg
  const vb = parseViewBox(getAttr(tag, "viewBox"))
    ?? (() => {
      const w = parseLength(getAttr(tag, "width"))
      const h = parseLength(getAttr(tag, "height"))
      return w && h ? { x: 0, y: 0, w, h } : null
    })()
  if (!vb) return svg
  const cx = vb.x + vb.w / 2
  const cy = vb.y + vb.h / 2
  const dx = (vb.w * b.offsetX) / 100
  const dy = (vb.h * b.offsetY) / 100
  const f = (n: number) => fmtNum(n, 4)
  const t = `translate(${f(cx + dx)} ${f(cy + dy)}) scale(${f(b.scale)}) translate(${f(-cx)} ${f(-cy)})`
  const start = svg.indexOf(tag) + tag.length
  const end = svg.lastIndexOf("</svg>")
  if (end < start || tag.endsWith("/>")) return svg
  return `${svg.slice(0, start)}<g transform="${t}">${svg.slice(start, end)}</g>${svg.slice(end)}`
}

/** Adds raw markup just before the closing </svg> */
export function appendMarkup(svg: string, markup: string) {
  const extra = markup.trim()
  if (!extra) return svg
  const end = svg.lastIndexOf("</svg>")
  if (end < 0) return svg
  return `${svg.slice(0, end)}${extra}${svg.slice(end)}`
}

/** Everything that happens after SVGO, in order */
export async function postProcess(svg: string, settings: SvgoSettings, effects?: GeometryEffect[]) {
  const t = settings.trim
  const p = settings.floatPrecision
  const step = async (effect: GeometryEffect, on: boolean, input: string, fn: () => Promise<string>) => {
    if (!on) return input
    const next = await fn()
    if (next !== input) effects?.push(effect)
    return next
  }
  // Beta geometry: holes first, so the shapes they leave can still merge
  let out = await step("flatten", settings.flattenTransforms, svg, () => flattenTransforms(svg, p))
  const cut = out
  const shapes = activeCutMatchers(settings)
  out = await step("cutouts", settings.cutOutStrokes || shapes.length > 0, cut, () =>
    cutOutFakeClipping(cut, { strokes: settings.cutOutStrokes, shapes }, p))
  const merge = out
  out = await step("merge", settings.mergePaths, merge, () => mergeOverlappingPaths(merge, p))
  out = transformSvg(out, { scale: t.artScale, offsetX: t.offsetX, offsetY: t.offsetY })
  // Outside the artwork group, so it isn't moved or scaled with it
  out = appendMarkup(out, settings.appendMarkup)
  // Trim measures last, after every move and scale, so padding 0 always means
  // the artwork touches the edges
  if (t.enabled) out = await trimSvg(out, t, settings.floatPrecision)
  // After trim, so it works within the final canvas and its padding
  out = await step("centre", settings.opticalCentre, out, () => opticalCentreSvg(out, settings.opticalStrength / 100, settings.floatPrecision))
  out = t.sizeUnit === "px"
    ? resizeSvg(out, t.sizeSide, t.sizePx, settings.floatPrecision)
    : scaleSvg(out, t.scale, settings.floatPrecision)
  return out
}
