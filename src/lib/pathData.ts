// ── Path data: parse, edit, convert ───────────────────────────────────────────
// Our own small take on path editing, inspired by Yqnn's svg-path-editor
// (Apache-2.0). Segments keep the case they were written in, so a relative
// path stays relative after a point is dragged.

export interface Seg {
  /** Command letter as written: upper case is absolute, lower case relative */
  c: string
  v: number[]
}

type Pt = [number, number]

/** Where a segment starts and ends, and its control points, all absolute */
export interface SegGeometry {
  from: Pt
  to: Pt
  c1?: Pt
  c2?: Pt
}

export type PointKind = "end" | "c1" | "c2"

const PARAMS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 }

/** Names for the values of each command, for the command list */
export const PARAM_NAMES: Record<string, string[]> = {
  m: ["x", "y"], l: ["x", "y"], t: ["x", "y"], h: ["x"], v: ["y"],
  c: ["x1", "y1", "x2", "y2", "x", "y"], s: ["x2", "y2", "x", "y"], q: ["x1", "y1", "x", "y"],
  a: ["rx", "ry", "rotation", "large arc", "sweep", "x", "y"], z: [],
}

export const COMMAND_NAMES: Record<string, string> = {
  m: "Move to", l: "Line to", h: "Horizontal line", v: "Vertical line", c: "Curve",
  s: "Smooth curve", q: "Quadratic curve", t: "Smooth quadratic", a: "Arc", z: "Close path",
}

const NUM = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y
const isRel = (c: string) => c >= "a"

export function parsePath(d: string): Seg[] {
  const out: Seg[] = []
  const n = d.length
  let i = 0
  const skip = () => { while (i < n && (d[i] === " " || d[i] === "," || d[i] === "\n" || d[i] === "\t" || d[i] === "\r")) i++ }
  const num = () => {
    skip()
    NUM.lastIndex = i
    const m = NUM.exec(d)
    if (!m) return null
    i += m[0].length
    return Number(m[0])
  }
  // Arc flags can be squashed together ("a1 1 0 01 5 5")
  const flag = () => {
    skip()
    if (d[i] === "0" || d[i] === "1") return Number(d[i++])
    return null
  }
  let cmd = ""
  for (;;) {
    skip()
    if (i >= n) break
    const ch = d[i]
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(ch)) { cmd = ch; i++ }
    else if (!cmd || cmd === "z" || cmd === "Z") throw new Error(`Unexpected “${d.slice(i, i + 10)}” in path data`)
    const lower = cmd.toLowerCase()
    if (lower === "z") { out.push({ c: cmd, v: [] }); continue }
    const v: number[] = []
    for (let k = 0; k < PARAMS[lower]; k++) {
      const x = lower === "a" && (k === 3 || k === 4) ? flag() : num()
      if (x === null) throw new Error(`Bad path data near “${d.slice(i, i + 10) || "the end"}”`)
      v.push(x)
    }
    out.push({ c: cmd, v })
    // Extra pairs after a move are lines
    if (cmd === "M") cmd = "L"
    else if (cmd === "m") cmd = "l"
  }
  if (out.length && out[0].c.toLowerCase() !== "m") throw new Error("Path data has to start with a move (M)")
  return out
}

export const fmt = (n: number) => {
  const r = Math.round(n * 1000) / 1000
  return Object.is(r, -0) ? "0" : String(r)
}

export function serialisePath(segs: Seg[]) {
  let out = ""
  for (const s of segs) {
    out += s.c
    out += s.v.map(fmt).join(" ")
  }
  return out
}

// ── Absolute and relative ─────────────────────────────────────────────────────

/** Every segment in absolute form (H and V stay H and V) */
export function absolutise(segs: Seg[]): Seg[] {
  let x = 0, y = 0, sx = 0, sy = 0
  return segs.map(({ c, v }) => {
    const C = c.toUpperCase()
    const rel = isRel(c)
    const ox = rel ? x : 0, oy = rel ? y : 0
    let w: number[]
    switch (C) {
      case "H": w = [v[0] + ox]; x = w[0]; break
      case "V": w = [v[0] + oy]; y = w[0]; break
      case "Z": w = []; x = sx; y = sy; break
      case "A": w = [v[0], v[1], v[2], v[3], v[4], v[5] + ox, v[6] + oy]; x = w[5]; y = w[6]; break
      default: {
        w = v.map((n, k) => n + (k % 2 ? oy : ox))
        x = w[w.length - 2]; y = w[w.length - 1]
        if (C === "M") { sx = x; sy = y }
      }
    }
    return { c: C, v: w }
  })
}

/** Writes absolute segments back, each relative or not as `relative(i)` says */
export function withCase(abs: Seg[], relative: (i: number) => boolean): Seg[] {
  let x = 0, y = 0, sx = 0, sy = 0
  return abs.map(({ c, v }, i) => {
    const rel = relative(i)
    const ox = rel ? x : 0, oy = rel ? y : 0
    let w: number[]
    switch (c) {
      case "H": w = [v[0] - ox]; x = v[0]; break
      case "V": w = [v[0] - oy]; y = v[0]; break
      case "Z": w = []; x = sx; y = sy; break
      case "A": w = [v[0], v[1], v[2], v[3], v[4], v[5] - ox, v[6] - oy]; x = v[5]; y = v[6]; break
      default: {
        w = v.map((n, k) => n - (k % 2 ? oy : ox))
        x = v[v.length - 2]; y = v[v.length - 1]
        if (c === "M") { sx = x; sy = y }
      }
    }
    return { c: rel ? c.toLowerCase() : c, v: w }
  })
}

export const toAbsolute = (segs: Seg[]) => absolutise(segs)
export const toRelative = (segs: Seg[]) => withCase(absolutise(segs), () => true)
/** Flips one segment between absolute and relative, leaving the shape alone */
export const toggleCase = (segs: Seg[], index: number) =>
  withCase(absolutise(segs), (i) => (i === index ? !isRel(segs[i].c) : isRel(segs[i].c)))

export const caseOf = (segs: Seg[]): "absolute" | "relative" | "mixed" => {
  const rel = segs.filter((s, i) => i > 0 && s.c.toLowerCase() !== "z" && isRel(s.c)).length
  const all = segs.filter((s, i) => i > 0 && s.c.toLowerCase() !== "z").length
  return rel === 0 ? "absolute" : rel === all ? "relative" : "mixed"
}

// ── Geometry for the on-canvas handles ────────────────────────────────────────

export function geometry(segs: Seg[]): SegGeometry[] {
  const abs = absolutise(segs)
  let x = 0, y = 0, sx = 0, sy = 0
  return abs.map(({ c, v }) => {
    const from: Pt = [x, y]
    let g: SegGeometry
    switch (c) {
      case "M": g = { from, to: [v[0], v[1]] }; sx = v[0]; sy = v[1]; break
      case "L": case "T": g = { from, to: [v[0], v[1]] }; break
      case "H": g = { from, to: [v[0], y] }; break
      case "V": g = { from, to: [x, v[0]] }; break
      case "C": g = { from, c1: [v[0], v[1]], c2: [v[2], v[3]], to: [v[4], v[5]] }; break
      case "S": g = { from, c2: [v[0], v[1]], to: [v[2], v[3]] }; break
      case "Q": g = { from, c1: [v[0], v[1]], to: [v[2], v[3]] }; break
      case "A": g = { from, to: [v[5], v[6]] }; break
      default: g = { from, to: [sx, sy] }
    }
    ;[x, y] = g.to
    return g
  })
}

/**
 * Moves one point of segment `index` to an absolute position. Moving an end
 * point drags its handles along, like a vector editor. Relative segments
 * after it are adjusted so the rest of the path stays put.
 */
export function movePoint(segs: Seg[], index: number, kind: PointKind, x: number, y: number): Seg[] {
  const abs = absolutise(segs).map((s) => ({ c: s.c, v: [...s.v] }))
  const s = abs[index]
  if (!s) return segs
  const set = (k: number) => { s.v[k] = x; s.v[k + 1] = y }
  if (kind === "end") {
    const g = geometry(segs)[index]
    const dx = x - g.to[0], dy = y - g.to[1]
    switch (s.c) {
      case "M": case "L": case "T": set(0); break
      case "H": s.v[0] = x; break
      case "V": s.v[0] = y; break
      case "C": set(4); s.v[2] += dx; s.v[3] += dy; break
      case "S": set(2); s.v[0] += dx; s.v[1] += dy; break
      case "Q": set(2); break
      case "A": set(5); break
      default: return segs
    }
    // The next segment's first handle belongs to this point too
    const next = abs[index + 1]
    if (next?.c === "C") { next.v[0] += dx; next.v[1] += dy }
  } else if (kind === "c1" && (s.c === "C" || s.c === "Q")) set(0)
  else if (kind === "c2" && s.c === "C") set(2)
  else if (kind === "c2" && s.c === "S") set(0)
  else return segs
  return withCase(abs, (i) => isRel(segs[i].c))
}

// ── Reverse ───────────────────────────────────────────────────────────────────

/** Same shape, drawn the other way round. Keeps the path's relative style */
export function reversePath(segs: Seg[]): Seg[] {
  // Plain absolute C, Q, L and A first, so every segment stands on its own
  const geo = geometry(segs)
  const abs = absolutise(segs)
  const plain: Seg[] = abs.map((s, i) => {
    const g = geo[i]
    switch (s.c) {
      case "H": case "V": return { c: "L", v: [...g.to] }
      case "S": {
        const prev = abs[i - 1], pg = geo[i - 1]
        const c1: Pt = prev && (prev.c === "C" || prev.c === "S") && pg.c2 ? [2 * g.from[0] - pg.c2[0], 2 * g.from[1] - pg.c2[1]] : g.from
        return { c: "C", v: [...c1, ...(g.c2 as Pt), ...g.to] }
      }
      default: return s
    }
  })
  // T needs its reflected control point, which depends on the Q/T before it
  let lastQ: Pt | null = null
  for (let i = 0; i < plain.length; i++) {
    const s = plain[i], g = geo[i]
    if (s.c === "Q") lastQ = [s.v[0], s.v[1]]
    else if (s.c === "T") {
      const c: Pt = lastQ ? [2 * g.from[0] - lastQ[0], 2 * g.from[1] - lastQ[1]] : g.from
      plain[i] = { c: "Q", v: [...c, ...g.to] }
      lastQ = c
    } else lastQ = null
  }

  // Split into subpaths
  const subs: { segs: Seg[], geo: SegGeometry[], closed: boolean }[] = []
  plain.forEach((s, i) => {
    if (s.c === "M") subs.push({ segs: [s], geo: [geo[i]], closed: false })
    else if (s.c === "Z") { if (subs.length) subs[subs.length - 1].closed = true }
    else if (subs.length) { subs[subs.length - 1].segs.push(s); subs[subs.length - 1].geo.push(geo[i]) }
  })

  const out: Seg[] = []
  for (const sub of subs) {
    const n = sub.segs.length - 1
    const start = sub.geo[0].to
    const end = sub.geo[n].to
    const same = Math.abs(start[0] - end[0]) < 1e-9 && Math.abs(start[1] - end[1]) < 1e-9
    if (sub.closed) {
      out.push({ c: "M", v: [...start] })
      if (!same) out.push({ c: "L", v: [...end] })
    } else out.push({ c: "M", v: [...end] })
    for (let k = n; k >= 1; k--) {
      const s = sub.segs[k]
      const back = sub.geo[k].from
      switch (s.c) {
        case "C": out.push({ c: "C", v: [s.v[2], s.v[3], s.v[0], s.v[1], ...back] }); break
        case "Q": out.push({ c: "Q", v: [s.v[0], s.v[1], ...back] }); break
        case "A": out.push({ c: "A", v: [s.v[0], s.v[1], s.v[2], s.v[3], 1 - s.v[4], ...back] }); break
        default: out.push({ c: "L", v: [...back] })
      }
    }
    // Z draws the last line home anyway
    if (sub.closed && out[out.length - 1].c === "L" && out.length > 1 && out[out.length - 2].c !== "M") out.pop()
    if (sub.closed) out.push({ c: "Z", v: [] })
  }
  return caseOf(segs) === "relative" ? withCase(out, () => true) : out
}

// ── Shapes to paths ───────────────────────────────────────────────────────────

export const SHAPES = new Set(["rect", "circle", "ellipse", "line", "polyline", "polygon"])
/** Attributes that become the path data, and so are dropped */
export const SHAPE_ATTRS: Record<string, string[]> = {
  rect: ["x", "y", "width", "height", "rx", "ry"],
  circle: ["cx", "cy", "r"],
  ellipse: ["cx", "cy", "rx", "ry"],
  line: ["x1", "y1", "x2", "y2"],
  polyline: ["points"],
  polygon: ["points"],
}

/** Path data for a basic shape, or null when it has nothing to draw */
export function shapeToPathData(el: Element): string | null {
  const n = (a: string) => {
    const v = parseFloat(el.getAttribute(a) ?? "")
    return Number.isFinite(v) ? v : 0
  }
  const f = fmt
  switch (el.localName) {
    case "rect": {
      const x = n("x"), y = n("y"), w = n("width"), h = n("height")
      if (w <= 0 || h <= 0) return null
      const hasRx = el.hasAttribute("rx"), hasRy = el.hasAttribute("ry")
      let rx = hasRx ? n("rx") : n("ry"), ry = hasRy ? n("ry") : n("rx")
      rx = Math.min(Math.max(rx, 0), w / 2); ry = Math.min(Math.max(ry, 0), h / 2)
      if (!rx || !ry) return `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`
      return `M${f(x + rx)} ${f(y)}H${f(x + w - rx)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x + w)} ${f(y + ry)}`
        + `V${f(y + h - ry)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x + w - rx)} ${f(y + h)}`
        + `H${f(x + rx)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x)} ${f(y + h - ry)}`
        + `V${f(y + ry)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x + rx)} ${f(y)}Z`
    }
    case "circle": case "ellipse": {
      const cx = n("cx"), cy = n("cy")
      const rx = el.localName === "circle" ? n("r") : n("rx"), ry = el.localName === "circle" ? n("r") : n("ry")
      if (rx <= 0 || ry <= 0) return null
      return `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`
    }
    case "line": return `M${f(n("x1"))} ${f(n("y1"))}L${f(n("x2"))} ${f(n("y2"))}`
    case "polyline": case "polygon": {
      const nums = (el.getAttribute("points") ?? "").match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g)?.map(Number) ?? []
      if (nums.length < 4) return null
      let d = `M${f(nums[0])} ${f(nums[1])}`
      for (let k = 2; k + 1 < nums.length; k += 2) d += `L${f(nums[k])} ${f(nums[k + 1])}`
      return el.localName === "polygon" ? d + "Z" : d
    }
  }
  return null
}

// ── Moving several points at once ─────────────────────────────────────────────

export interface PointRef { seg: number, kind: PointKind }
export const pointKey = (p: PointRef) => `${p.seg}:${p.kind}`

/** Every anchor (end point) of the path, for "select all" */
export const allAnchors = (segs: Seg[]): PointRef[] =>
  segs.flatMap((s, seg) => (s.c.toLowerCase() === "z" ? [] : [{ seg, kind: "end" as const }]))

/**
 * Moves points by (dx, dy) in the path's own units. End points bring their
 * handles; each coordinate moves once, however many selected points share it.
 */
export function shiftPoints(segs: Seg[], points: PointRef[], dx: number, dy: number): Seg[] {
  if (!points.length || (!dx && !dy)) return segs
  const abs = absolutise(segs).map((s) => ({ c: s.c, v: [...s.v] }))
  // "seg:valueIndex" of each x to move (y is the next value), plus lone axes
  const pairs = new Set<string>()
  const xs = new Set<number>(), ys = new Set<number>()
  const end = (i: number) => {
    const s = abs[i]
    if (!s) return
    switch (s.c) {
      case "M": case "L": case "T": pairs.add(`${i}:0`); break
      case "H": xs.add(i); break
      case "V": ys.add(i); break
      case "C": pairs.add(`${i}:4`); pairs.add(`${i}:2`); break
      case "S": pairs.add(`${i}:2`); pairs.add(`${i}:0`); break
      case "Q": pairs.add(`${i}:2`); break
      case "A": pairs.add(`${i}:5`); break
    }
    if (abs[i + 1]?.c === "C") pairs.add(`${i + 1}:0`)
  }
  for (const p of points) {
    const s = abs[p.seg]
    if (!s) continue
    if (p.kind === "end") end(p.seg)
    else if (p.kind === "c1" && (s.c === "C" || s.c === "Q")) pairs.add(`${p.seg}:0`)
    else if (p.kind === "c2" && s.c === "C") pairs.add(`${p.seg}:2`)
    else if (p.kind === "c2" && s.c === "S") pairs.add(`${p.seg}:0`)
  }
  // A quadratic's one handle moves when both its ends do
  const ends = new Set(points.filter((p) => p.kind === "end").map((p) => p.seg))
  abs.forEach((s, i) => { if (s.c === "Q" && ends.has(i) && ends.has(i - 1)) pairs.add(`${i}:0`) })
  for (const key of pairs) {
    const [i, k] = key.split(":").map(Number)
    abs[i].v[k] += dx
    abs[i].v[k + 1] += dy
  }
  for (const i of xs) abs[i].v[0] += dx
  for (const i of ys) abs[i].v[0] += dy
  return withCase(abs, (i) => isRel(segs[i].c))
}

/** Where a point is, absolute */
export function pointAt(geo: SegGeometry[], p: PointRef): Pt | undefined {
  const g = geo[p.seg]
  return g ? (p.kind === "end" ? g.to : p.kind === "c1" ? g.c1 : g.c2) : undefined
}
