import { svgDataUrl } from "./format"
import { fmtNum, getAttr, parseLength, parseViewBox, replaceRoot, rootTag, setAttr, type ViewBox } from "./svgRoot"
import type { TrimSettings } from "./types"

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
  return {
    x: vb.x + minX / scale,
    y: vb.y + minY / scale,
    w: (maxX - minX + 1) / scale,
    h: (maxY - minY + 1) / scale
  }
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
  const next = { x: box.x - p, y: box.y - p, w: box.w + p * 2, h: box.h + p * 2 }

  const digits = Math.max(precision, 2)
  const f = (n: number) => fmtNum(n, digits)
  let out = setAttr(tag, "viewBox", `${f(next.x)} ${f(next.y)} ${f(next.w)} ${f(next.h)}`)
  // Keep explicit sizes in proportion with the new viewBox
  if (width !== null) out = setAttr(out, "width", f(width * (next.w / vb.w)))
  if (height !== null) out = setAttr(out, "height", f(height * (next.h / vb.h)))
  return replaceRoot(svg, out)
}
