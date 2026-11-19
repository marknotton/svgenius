// ── Align, distribute and Pathfinder ──────────────────────────────────────────
// Both need the artwork laid out, so the markup is rendered off screen and
// measured. Align works out moves in each element's parent units (the same
// moves dragging makes); Pathfinder uses paper.js's boolean operations.

import type { TagRange } from "./markupMap"
import { removeElement, tagWithAttrs } from "./markupEdit"
import { loadPaper, outlineOf, pathData, SHAPES } from "./paperKit"
import { SHAPE_ATTRS } from "./pathData"

export type AlignMode = "left" | "hcentre" | "right" | "top" | "vmiddle" | "bottom"
export type DistributeMode = "hcentres" | "vcentres" | "hspace" | "vspace"
export type PathfinderOp = "unite" | "minusFront" | "intersect" | "exclude"

export interface Move { index: number, dx: number, dy: number }

// One element lines up with the canvas; several line up with each other,
// unless "Align to canvas" is on
const TARGET_KEY = "svgenius:align-to"
export const alignTarget = {
  get: (): "selection" | "canvas" => { try { return localStorage.getItem(TARGET_KEY) === "canvas" ? "canvas" : "selection" } catch { return "selection" } },
  set: (v: "selection" | "canvas") => { try { localStorage.setItem(TARGET_KEY, v) } catch { /* unavailable */ } }
}

/** Renders the markup off screen for measuring. Call done() afterwards */
function mount(markup: string) {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml")
  if (doc.documentElement.localName !== "svg" || doc.querySelector("parsererror")) return null
  const host = document.createElement("div")
  host.style.cssText = "position:fixed;left:-99999px;top:0;width:1000px;height:1000px;overflow:hidden;visibility:hidden"
  const root = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement
  root.setAttribute("width", "1000")
  root.setAttribute("height", "1000")
  host.appendChild(root)
  document.body.appendChild(host)
  const all = [root, ...root.querySelectorAll("*")] as SVGGraphicsElement[]
  return { root, all, done: () => host.remove() }
}

const toDOM = (m: DOMMatrix | SVGMatrix) => new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f])

interface Box { left: number, top: number, right: number, bottom: number, cx: number, cy: number, w: number, h: number }
// Read one by one: a DOMRect's sides are getters, so spreading it gives nothing
const boxOf = ({ left, top, right, bottom }: { left: number, top: number, right: number, bottom: number }): Box =>
  ({ left, top, right, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2, w: right - left, h: bottom - top })

/** The viewBox area on screen */
function canvasBox(root: SVGSVGElement): Box {
  const vb = root.viewBox?.baseVal
  const m = root.getScreenCTM()
  if (!vb || !vb.width || !m) return boxOf(root.getBoundingClientRect())
  const a = new DOMPoint(vb.x, vb.y).matrixTransform(toDOM(m))
  const b = new DOMPoint(vb.x + vb.width, vb.y + vb.height).matrixTransform(toDOM(m))
  return boxOf({ left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) })
}

/** Screen pixels to each element's parent units */
function toParent(el: SVGGraphicsElement, dx: number, dy: number) {
  const m = (el.parentNode as SVGGraphicsElement | null)?.getScreenCTM?.()
  if (!m) return { dx: 0, dy: 0 }
  const p = new DOMPoint(dx, dy).matrixTransform(new DOMMatrix([m.a, m.b, m.c, m.d, 0, 0]).inverse())
  return { dx: p.x, dy: p.y }
}

function measure(markup: string, indices: number[]) {
  const m = mount(markup)
  if (!m) return null
  const items = indices.map((index) => ({ index, el: m.all[index], box: boxOf(m.all[index].getBoundingClientRect()) }))
    .filter((x) => x.el && x.box.w + x.box.h > 0)
  return { ...m, items, canvas: canvasBox(m.root) }
}

export function alignMoves(markup: string, indices: number[], mode: AlignMode): Move[] {
  const m = measure(markup, indices)
  if (!m) return []
  try {
    const toCanvas = m.items.length === 1 || alignTarget.get() === "canvas"
    const u = toCanvas ? m.canvas : boxOf({
      left: Math.min(...m.items.map((x) => x.box.left)), top: Math.min(...m.items.map((x) => x.box.top)),
      right: Math.max(...m.items.map((x) => x.box.right)), bottom: Math.max(...m.items.map((x) => x.box.bottom))
    })
    return m.items.map(({ index, el, box: b }) => {
      const sx = mode === "left" ? u.left - b.left : mode === "hcentre" ? u.cx - b.cx : mode === "right" ? u.right - b.right : 0
      const sy = mode === "top" ? u.top - b.top : mode === "vmiddle" ? u.cy - b.cy : mode === "bottom" ? u.bottom - b.bottom : 0
      return { index, ...toParent(el, sx, sy) }
    }).filter((x) => Math.abs(x.dx) > 1e-9 || Math.abs(x.dy) > 1e-9)
  } finally {
    m.done()
  }
}

export function distributeMoves(markup: string, indices: number[], mode: DistributeMode): Move[] {
  const m = measure(markup, indices)
  if (!m || m.items.length < 3) { m?.done(); return [] }
  try {
    const horiz = mode === "hcentres" || mode === "hspace"
    const key = (b: Box) => (horiz ? b.cx : b.cy)
    const sorted = [...m.items].sort((a, b) => key(a.box) - key(b.box))
    const n = sorted.length
    const shift: number[] = []
    if (mode === "hcentres" || mode === "vcentres") {
      // Outer two stay, the centres between are spread evenly
      const first = key(sorted[0].box), last = key(sorted[n - 1].box)
      sorted.forEach((x, k) => shift.push(first + ((last - first) * k) / (n - 1) - key(x.box)))
    } else {
      // Equal gaps between neighbours, the outer two stay
      const start = horiz ? sorted[0].box.left : sorted[0].box.top
      const end = horiz ? sorted[n - 1].box.right : sorted[n - 1].box.bottom
      const size = sorted.reduce((s, x) => s + (horiz ? x.box.w : x.box.h), 0)
      const gap = (end - start - size) / (n - 1)
      let at = start
      for (const x of sorted) {
        shift.push(at - (horiz ? x.box.left : x.box.top))
        at += (horiz ? x.box.w : x.box.h) + gap
      }
    }
    return sorted.map((x, k) => ({ index: x.index, ...toParent(x.el, horiz ? shift[k] : 0, horiz ? 0 : shift[k]) }))
      .filter((x) => Math.abs(x.dx) > 1e-9 || Math.abs(x.dy) > 1e-9)
  } finally {
    m.done()
  }
}

// ── Pathfinder ────────────────────────────────────────────────────────────────

export const PATHFINDER: { op: PathfinderOp, label: string, hint: string }[] = [
  { op: "unite", label: "Unite", hint: "Merge the shapes into one outline. It takes the paint of the top shape" },
  { op: "minusFront", label: "Minus front", hint: "Cut the shapes in front out of the bottom one, which keeps its paint" },
  { op: "intersect", label: "Intersect", hint: "Keep only where every shape overlaps. It takes the paint of the top shape" },
  { op: "exclude", label: "Exclude", hint: "Keep where the shapes don't overlap, and cut out where they do. It takes the paint of the top shape" }
]

const GEOMETRY_ATTRS = ["d", "transform", "pathLength", ...new Set(Object.values(SHAPE_ATTRS).flat())]

export async function pathfinder(markup: string, ranges: TagRange[], indices: number[], op: PathfinderOp, precision = 3):
  Promise<{ markup: string, start: number } | { error: string }> {
  const shapes = indices.filter((i) => i > 0).sort((a, b) => a - b)
  const m = mount(markup)
  if (!m) return { error: "The markup doesn't parse" }
  try {
    const usable = shapes.filter((i) => SHAPES.has(m.all[i]?.localName ?? ""))
    if (usable.length < 2) return { error: "Pathfinder needs two or more shapes or paths selected (ungroup groups first)" }
    const paper = await loadPaper()
    const rootInv = toDOM(m.root.getScreenCTM()!).inverse()
    // Every outline in the root's units, so they can meet
    const items = usable.map((i) => {
      const el = m.all[i]
      const p = outlineOf(paper, el, true)
      const s = el.getScreenCTM()
      if (!p || !s) return null
      const t = rootInv.multiply(toDOM(s))
      p.transform(new paper.Matrix(t.a, t.b, t.c, t.d, t.e, t.f))
      return p
    })
    if (items.some((p) => !p)) return { error: "One of the shapes couldn't be read" }
    const list = items as paper.PathItem[]
    const opt = { insert: false }
    let out = list[0]
    for (const p of list.slice(1)) {
      out = op === "unite" ? out.unite(p, opt) : op === "minusFront" ? out.subtract(p, opt) : op === "intersect" ? out.intersect(p, opt) : out.exclude(p, opt)
    }
    if (out.isEmpty() || !(Math.abs((out as paper.Path).area) > 1e-9)) return { error: op === "intersect" ? "Nothing left: the shapes don't all overlap" : "Nothing left after that" }

    // The result takes the place (and paint) of the top shape, or the bottom one for Minus front
    const keep = op === "minusFront" ? usable[0] : usable[usable.length - 1]
    const kept = m.all[keep]
    const parent = (kept.parentNode as SVGGraphicsElement).getScreenCTM()
    if (parent) {
      const back = rootInv.multiply(toDOM(parent)).inverse()
      out.transform(new paper.Matrix(back.a, back.b, back.c, back.d, back.e, back.f))
    }
    const d = pathData(out, precision)
    const r = ranges[keep]
    const open = markup.slice(r.start, r.tagEnd)
    const name = kept.tagName
    let tag = tagWithAttrs(open.replace(new RegExp(`^<${name}`), "<path"), Object.fromEntries(GEOMETRY_ATTRS.map((a) => [a, null])))
    tag = tagWithAttrs(tag, { d })
    const text = open.trimEnd().endsWith("/>") ? tag : `${tag}${markup.slice(r.tagEnd, r.end).replace(new RegExp(`</${name}>\\s*$`), "</path>")}`

    // Back to front so earlier offsets stay put; track where the result lands
    let next = markup
    let start = r.start
    for (const i of [...usable].sort((a, b) => ranges[b].start - ranges[a].start)) {
      const ri = ranges[i]
      if (i === keep) { next = next.slice(0, ri.start) + text + next.slice(ri.end); continue }
      const before = next.length
      next = removeElement(next, ri)
      if (ri.start < r.start) start -= before - next.length
    }
    return { markup: next, start }
  } finally {
    m.done()
  }
}
