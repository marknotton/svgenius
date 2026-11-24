// ── Fake clipping → real cut-outs ─────────────────────────────────────────────
// Artwork often fakes holes by painting a stroke (or a white shape) over the
// shapes beneath. This turns that paint into real holes: the area it covers is
// subtracted from every filled shape painted before it, then the stroke (or
// white shape) is removed. Paint that doesn't cover anything is left alone, so
// a white icon on its own stays put.

import {
  NOT_RENDERED, SHAPES, hasEffects, isUrl, outlineOf, ownMatrix, pathData, replaceWithPath, solid, withLiveSvg,
  type Paper
} from "./paperKit"
import type { CutMatcher } from "./types"

export interface CutOutOptions {
  strokes: boolean
  /** Shapes that become holes, matched by fill colour or markup */
  shapes: CutMatcher[]
}

interface Target {
  el: Element
  /** The parent's transform, root user space ← parent space */
  parentM: paper.Matrix
  /** Fill region in root user space */
  region: paper.PathItem
  dirty: boolean
}

/** Any CSS colour in one canonical spelling, or null if it isn't one */
let colourCtx: CanvasRenderingContext2D | null = null
export function canonicalColour(v: string) {
  colourCtx ??= document.createElement("canvas").getContext("2d")
  if (!colourCtx || !v.trim()) return null
  colourCtx.fillStyle = "#010203"
  colourCtx.fillStyle = v.trim()
  const a = colourCtx.fillStyle
  colourCtx.fillStyle = "#030201"
  colourCtx.fillStyle = v.trim()
  // Unchanged across both sentinels means the browser rejected it
  return a === colourCtx.fillStyle ? a : null
}

function matcherTest(list: CutMatcher[]) {
  const colours = new Set(list.filter((m) => m.kind === "colour").map((m) => canonicalColour(m.value)).filter((c): c is string => !!c))
  const texts = list.filter((m) => m.kind === "markup").map((m) => m.value.trim().toLowerCase()).filter(Boolean)
  return (el: Element, fill: string) => {
    if (colours.size) {
      const c = canonicalColour(fill)
      if (c && colours.has(c)) return true
    }
    if (texts.length) {
      const tag = (el.outerHTML.match(/^<[^>]*>/)?.[0] ?? "").toLowerCase()
      if (texts.some((t) => tag.includes(t))) return true
    }
    return false
  }
}
const STROKE_ATTRS = ["stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset"]

// ── Stroke outlines ───────────────────────────────────────────────────────────
// paper.js can't outline a stroke, so build it from the flattened centre line:
// a quad per segment, plus joins and caps, all united.

export function strokeOutline(paper: Paper, shape: paper.PathItem, width: number, cs: CSSStyleDeclaration) {
  const hw = width / 2
  const join = cs.strokeLinejoin
  const cap = cs.strokeLinecap
  const limit = parseFloat(cs.strokeMiterlimit) || 4
  const pieces: paper.Path[] = []
  const poly = (pts: paper.Point[]) => {
    const p = new paper.Path({ segments: pts, closed: true, insert: false })
    if (Math.abs(p.area) > 1e-9) pieces.push(p.clockwise ? p : (p.reverse(), p))
  }
  const disc = (c: paper.Point) => pieces.push(new paper.Path.Circle({ center: c, radius: hw, insert: false }))

  const parts = shape instanceof paper.CompoundPath ? (shape.children as paper.Path[]) : [shape as paper.Path]
  for (const part of parts) {
    const line = part.clone({ insert: false }) as paper.Path
    line.flatten(Math.max(width * 0.004, 0.0005))
    const pts: paper.Point[] = []
    for (const s of line.segments) {
      if (!pts.length || s.point.getDistance(pts[pts.length - 1]) > 1e-6) pts.push(s.point)
    }
    const closed = line.closed
    if (closed && pts.length > 2 && pts[0].getDistance(pts[pts.length - 1]) < 1e-6) pts.pop()
    if (pts.length < 2) {
      if (pts.length === 1 && cap === "round") disc(pts[0])
      continue
    }
    const segs = closed ? pts.length : pts.length - 1
    const dir = (i: number) => pts[(i + 1) % pts.length].subtract(pts[i]).normalize()
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length]
      const n = new paper.Point(-dir(i).y, dir(i).x).multiply(hw)
      let a2 = a, b2 = b
      if (!closed && cap === "square") {
        if (i === 0) a2 = a.subtract(dir(i).multiply(hw))
        if (i === segs - 1) b2 = b.add(dir(i).multiply(hw))
      }
      poly([a2.add(n), b2.add(n), b2.subtract(n), a2.subtract(n)])
    }
    // Joins at every corner
    const first = closed ? 0 : 1
    const last = closed ? pts.length : pts.length - 1
    for (let i = first; i < last; i++) {
      const p = pts[i]
      const d1 = dir((i - 1 + pts.length) % pts.length), d2 = dir(i)
      const cross = d1.x * d2.y - d1.y * d2.x
      if (Math.abs(cross) < 1e-9 && d1.dot(d2) > 0) continue
      if (join === "round") { disc(p); continue }
      const s = cross > 0 ? -hw : hw
      const n1 = new paper.Point(-d1.y, d1.x).multiply(s)
      const n2 = new paper.Point(-d2.y, d2.x).multiply(s)
      const cos = Math.max(-1, Math.min(1, d1.dot(d2)))
      const ratio = 1 / Math.sin((Math.PI - Math.acos(cos)) / 2)
      if (join !== "bevel" && ratio <= limit) {
        const bis = n1.add(n2).normalize().multiply(hw * ratio)
        poly([p, p.add(n1), p.add(bis), p.add(n2)])
      } else {
        poly([p, p.add(n1), p.add(n2)])
      }
    }
    if (!closed && cap === "round") { disc(pts[0]); disc(pts[pts.length - 1]) }
  }
  if (!pieces.length) return null
  return smoothen(paper, unionAll(pieces), hw)
}

/**
 * The union is made of short straight lines. Fit curves back through them, run
 * by run between real corners, so the outline is smooth at any zoom.
 */
function smoothen(paper: Paper, ring: paper.PathItem, hw: number) {
  ring.flatten(hw * 0.004)
  // paper.js compares squared distances, so this allows hw / 100 of drift
  const tol = (hw * 0.01) ** 2
  const loops = ring instanceof paper.CompoundPath ? (ring.children as paper.Path[]) : [ring as paper.Path]
  const out: paper.Path[] = []
  for (const loop of loops) {
    let pts = loop.segments.map((s) => s.point)
    if (pts.length > 2 && pts[0].getDistance(pts[pts.length - 1]) < 1e-9) pts.pop()
    if (pts.length < 4) { out.push(loop.clone({ insert: false }) as paper.Path); continue }
    const n = pts.length
    const turn = (i: number) => {
      const a = pts[i].subtract(pts[(i - 1 + n) % n]), b = pts[(i + 1) % n].subtract(pts[i])
      return Math.abs(a.getDirectedAngle(b))
    }
    const corners = pts.map((_, i) => turn(i) > 28)
    const start = corners.indexOf(true)
    // Rotate so a corner comes first (or fit the whole loop if it has none)
    if (start > 0) pts = [...pts.slice(start), ...pts.slice(0, start)]
    const isCorner = start < 0 ? () => false : (i: number) => corners[(i + start) % n]
    const path = new paper.Path({ insert: false, closed: true })
    const fit = (run: paper.Point[]) => {
      // Dense points keep the fitted curve from bulging along long straight lines
      const dense: paper.Point[] = [run[0]]
      for (let i = 1; i < run.length; i++) {
        const k = Math.ceil(run[i].getDistance(run[i - 1]) / (hw * 0.1))
        for (let j = 1; j <= k; j++) dense.push(run[i - 1].add(run[i].subtract(run[i - 1]).multiply(j / k)))
      }
      const p = new paper.Path({ segments: dense, insert: false })
      p.simplify(tol)
      return p.segments
    }
    if (start < 0) {
      const p = new paper.Path({ segments: fit([...pts, pts[0]]).map((s) => s.clone()), insert: false, closed: true })
      if (p.firstSegment.point.getDistance(p.lastSegment.point) < 1e-9) {
        p.firstSegment.handleIn = p.lastSegment.handleIn
        p.lastSegment.remove()
      }
      out.push(p)
      continue
    }
    let run: paper.Point[] = [pts[0]]
    const flush = () => {
      const segs = fit(run)
      // Join with the previous run at the shared corner
      if (path.segments.length) {
        const last = path.lastSegment
        last.handleOut = segs[0].handleOut
        path.addSegments(segs.slice(1).map((s) => s.clone()))
      } else {
        path.addSegments(segs.map((s) => s.clone()))
      }
    }
    for (let i = 1; i <= n; i++) {
      const p = pts[i % n]
      run.push(p)
      if (i === n || isCorner(i)) { flush(); run = [p] }
    }
    // The last run ends where the first began
    if (path.segments.length > 1 && path.firstSegment.point.getDistance(path.lastSegment.point) < 1e-9) {
      path.firstSegment.handleIn = path.lastSegment.handleIn
      path.lastSegment.remove()
    }
    out.push(path)
  }
  return out.length === 1 ? out[0] : new paper.CompoundPath({ children: out, insert: false })
}

/** Unites in a balanced tree, much faster than one long chain */
function unionAll(items: paper.PathItem[]): paper.PathItem {
  let level = items
  while (level.length > 1) {
    const next: paper.PathItem[] = []
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? (level[i].unite(level[i + 1], { insert: false }) as paper.PathItem) : level[i])
    }
    level = next
  }
  return level[0]
}

const areaOf = (p: paper.PathItem) => Math.abs((p as paper.Path).area)

// ── Walk the artwork in paint order ───────────────────────────────────────────

function cutIn(paper: Paper, root: Element, opts: CutOutOptions, precision: number) {
  const matches = matcherTest(opts.shapes)
  const targets: Target[] = []
  const removed = new Set<Element>()
  let cuts = 0

  const cut = (region: paper.PathItem) => {
    let hit = false
    const box = region.bounds
    for (const t of targets) {
      if (!t.region.bounds.intersects(box)) continue
      const before = areaOf(t.region)
      const next = t.region.subtract(region, { insert: false }) as paper.PathItem
      if (Math.abs(before - areaOf(next)) < 1e-6) continue
      t.region = next
      t.dirty = true
      hit = true
    }
    return hit
  }

  const visit = (parent: Element, m: paper.Matrix) => {
    for (const el of [...parent.children]) {
      if (NOT_RENDERED.has(el.localName)) continue
      const total = m.clone().append(ownMatrix(paper, el))
      if (!SHAPES.has(el.localName)) {
        if (el.children.length) visit(el, total)
        continue
      }
      const cs = getComputedStyle(el)
      if (cs.display === "none" || hasEffects(el, cs)) continue
      const fillOn = cs.fill !== "none" && Number(cs.fillOpacity) > 0 && el.localName !== "line"
      const strokeOn = cs.stroke !== "none" && parseFloat(cs.strokeWidth) > 0 && Number(cs.strokeOpacity) > 0
      const white = fillOn && !isUrl(cs.fill) && matches(el, cs.fill)
      const strokeCut = opts.strokes && strokeOn && !isUrl(cs.stroke) && (!cs.strokeDasharray || cs.strokeDasharray === "none")

      const local = (fillOn || strokeCut) ? outlineOf(paper, el, true) : null
      if (!local) continue

      if (white) {
        const region = solid(local.clone({ insert: false }) as paper.PathItem)
        region.transform(total)
        if (cut(region)) {
          cuts++
          removed.add(el)
          el.remove()
          continue
        }
      } else if (fillOn && !isUrl(cs.fill)) {
        const region = solid(local.clone({ insert: false }) as paper.PathItem)
        region.transform(total)
        targets.push({ el, parentM: m.clone(), region, dirty: false })
      }

      if (strokeCut) {
        const open = outlineOf(paper, el) ?? local
        const ring = strokeOutline(paper, open, parseFloat(cs.strokeWidth), cs)
        if (ring) {
          ring.transform(total)
          if (cut(ring)) {
            cuts++
            if (!fillOn) {
              removed.add(el)
              el.remove()
            } else {
              for (const a of STROKE_ATTRS) el.removeAttribute(a)
              // A class or inline style would beat the attribute
              if (el.getAttribute("class") || el.getAttribute("style")) (el as SVGElement).style.stroke = "none"
              else el.setAttribute("stroke", "none")
            }
          }
        }
      }
    }
  }
  visit(root, new paper.Matrix())

  for (const t of targets) {
    if (!t.dirty || removed.has(t.el)) continue
    const region = t.region.clone({ insert: false }) as paper.PathItem
    region.transform(t.parentM.inverted())
    // Fully cut away
    if (areaOf(region) < 1e-9) { t.el.remove(); continue }
    replaceWithPath(t.el, pathData(region, precision), false)
  }
  return cuts
}

export async function cutOutFakeClipping(svg: string, opts: CutOutOptions, precision: number) {
  if (!opts.strokes && !opts.shapes.length) return svg
  return withLiveSvg(svg, (paper, root) => cutIn(paper, root, opts, Math.max(precision, 3)))
}
