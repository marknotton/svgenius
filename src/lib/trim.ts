import { svgDataUrl } from "./format"
import { mergeOverlappingPaths } from "./mergePaths"
import { fmtNum, getAttr, parseLength, parseViewBox, replaceRoot, rootTag, setAttr, type ViewBox } from "./svgRoot"
import type { ArtTransform, SvgoSettings, TrimSettings } from "./types"

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
export async function postProcess(svg: string, settings: SvgoSettings) {
  const t = settings.trim
  let out = settings.mergePaths ? await mergeOverlappingPaths(svg, settings.floatPrecision) : svg
  out = transformSvg(out, { scale: t.artScale, offsetX: t.offsetX, offsetY: t.offsetY })
  // Outside the artwork group, so it isn't moved or scaled with it
  out = appendMarkup(out, settings.appendMarkup)
  // Trim measures last, after every move and scale, so padding 0 always means
  // the artwork touches the edges
  if (t.enabled) out = await trimSvg(out, t, settings.floatPrecision)
  out = scaleSvg(out, t.scale, settings.floatPrecision)
  return out
}
