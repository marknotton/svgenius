import { svgDataUrl } from "./format"
import { fmtNum, getAttr, parseLength, parseViewBox, replaceRoot, rootTag, setAttr, type ViewBox } from "./svgRoot"
import type { Bespoke, SvgoSettings, TrimSettings } from "./types"

// ── Trim whitespace ───────────────────────────────────────────────────────────
// Renders the SVG to a canvas and scans for visible pixels, so strokes, filters
// and transforms all count. Runs on the main thread because workers can't
// decode SVG images.

const SCAN = 1024

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Couldn't render the SVG to measure it"))
    img.src = src
  })
}

/** Visible bounds in viewBox units, or null if nothing is drawn */
async function contentBounds(svg: string, vb: ViewBox): Promise<ViewBox | null> {
  const scale = SCAN / Math.max(vb.w, vb.h)
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
  const data = ctx.getImageData(0, 0, cw, ch).data

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
  // Content touching an edge snaps to it exactly, avoiding sub-pixel drift
  const x0 = minX === 0 ? vb.x : vb.x + minX / scale
  const y0 = minY === 0 ? vb.y : vb.y + minY / scale
  const x1 = maxX === cw - 1 ? vb.x + vb.w : vb.x + (maxX + 1) / scale
  const y1 = maxY === ch - 1 ? vb.y + vb.h : vb.y + (maxY + 1) / scale
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export async function trimSvg(svg: string, trim: TrimSettings, precision: number) {
  const tag = rootTag(svg)
  if (!tag) return svg
  const width = parseLength(getAttr(tag, "width"))
  const height = parseLength(getAttr(tag, "height"))
  const vb = parseViewBox(getAttr(tag, "viewBox"))
    ?? (width && height ? { x: 0, y: 0, w: width, h: height } : null)
  if (!vb) return svg

  const box = await contentBounds(svg, vb)
  if (!box) return svg

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
  let out = setAttr(tag, "viewBox", `${f(next.x)} ${f(next.y)} ${f(next.w)} ${f(next.h)}`)
  // Keep explicit sizes in proportion with the new viewBox
  if (width !== null) out = setAttr(out, "width", f(width * (next.w / vb.w)))
  if (height !== null) out = setAttr(out, "height", f(height * (next.h / vb.h)))
  return replaceRoot(svg, out)
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

// ── Per-file transform ────────────────────────────────────────────────────────

/** Wraps the artwork in a <g> that scales around the viewBox centre and offsets it */
export function transformSvg(svg: string, b: Bespoke) {
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

/** Everything that happens after SVGO, in order */
export async function postProcess(svg: string, settings: SvgoSettings, bespoke?: Bespoke) {
  let out = svg
  if (settings.trim.enabled) out = await trimSvg(out, settings.trim, settings.floatPrecision)
  // The preset's artwork transform and the file's own one combine into one <g>
  const t = settings.trim
  out = transformSvg(out, {
    scale: t.artScale * (bespoke?.scale ?? 1),
    offsetX: t.offsetX + (bespoke?.offsetX ?? 0),
    offsetY: t.offsetY + (bespoke?.offsetY ?? 0)
  })
  out = scaleSvg(out, settings.trim.scale, settings.floatPrecision)
  return out
}
