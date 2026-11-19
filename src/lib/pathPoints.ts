// ── Point tools: convert, add, delete ─────────────────────────────────────────
// What the point menu runs on the selected path's points. Each works on the
// segment that ends at a point. Everything happens in absolute coordinates and
// is written back in the case each segment had, so later segments stay put.

import { absolutise, geometry, withCase, type PointRef, type Seg, type SegGeometry } from "./pathData"

type Pt = [number, number]

/** Point types the menu can turn a segment into */
export type SegType = "L" | "H" | "V" | "C" | "S" | "Q" | "T"

export const SEG_TYPES: { type: SegType, label: string }[] = [
  { type: "L", label: "Line" },
  { type: "H", label: "Horizontal line" },
  { type: "V", label: "Vertical line" },
  { type: "C", label: "Curve" },
  { type: "S", label: "Smooth curve" },
  { type: "Q", label: "Quadratic curve" },
  { type: "T", label: "Smooth quadratic" }
]

const isRel = (c: string) => c >= "a"
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const reflect = (p: Pt, about: Pt): Pt => [2 * about[0] - p[0], 2 * about[1] - p[1]]

/** Segments that end at a point you can select (not moves or closes) */
const editable = (s: Seg | undefined) => !!s && !/[MmZz]/.test(s.c)

/**
 * Both control points of segment i as a cubic, whatever it was written as.
 * Arcs come back as null: they don't have handles to keep.
 */
function cubicOf(abs: Seg[], geo: SegGeometry[], i: number): [Pt, Pt] | null {
  const s = abs[i], g = geo[i]
  switch (s.c) {
    case "C": return [g.c1!, g.c2!]
    case "S": return [smoothHandle(abs, geo, i), g.c2!]
    case "Q": return [lerp(g.from, g.c1!, 2 / 3), lerp(g.to, g.c1!, 2 / 3)]
    case "T": { const q = quadHandle(abs, geo, i); return [lerp(g.from, q, 2 / 3), lerp(g.to, q, 2 / 3)] }
    case "A": return null
    default: return [lerp(g.from, g.to, 1 / 3), lerp(g.from, g.to, 2 / 3)]
  }
}

/** S's first handle: the previous cubic's last handle mirrored, or the start point */
function smoothHandle(abs: Seg[], geo: SegGeometry[], i: number): Pt {
  const p = abs[i - 1]
  if (p && (p.c === "C" || p.c === "S")) return reflect(geo[i - 1].c2!, geo[i].from)
  return geo[i].from
}

/** T's handle: the previous quadratic's handle mirrored, or the start point */
function quadHandle(abs: Seg[], geo: SegGeometry[], i: number): Pt {
  const p = abs[i - 1]
  if (p?.c === "Q") return reflect(geo[i - 1].c1!, geo[i].from)
  if (p?.c === "T") return reflect(quadHandle(abs, geo, i - 1), geo[i].from)
  return geo[i].from
}

/** S and T borrow from the segment before; write it out in full first so changing that one can't bend it */
function standAlone(abs: Seg[], geo: SegGeometry[], i: number) {
  const s = abs[i]
  if (!s) return
  if (s.c === "S") abs[i] = { c: "C", v: [...smoothHandle(abs, geo, i), ...geo[i].c2!, ...geo[i].to] }
  else if (s.c === "T") abs[i] = { c: "Q", v: [...quadHandle(abs, geo, i), ...geo[i].to] }
}

function asType(abs: Seg[], geo: SegGeometry[], i: number, type: SegType): Seg | null {
  const g = geo[i]
  const cubic = cubicOf(abs, geo, i)
  switch (type) {
    case "L": return { c: "L", v: [...g.to] }
    case "H": return { c: "H", v: [g.to[0]] }
    case "V": return { c: "V", v: [g.to[1]] }
    case "C": return cubic ? { c: "C", v: [...cubic[0], ...cubic[1], ...g.to] } : null
    case "S": return cubic ? { c: "S", v: [...cubic[1], ...g.to] } : null
    case "Q": {
      if (!cubic) return null
      // The closest single handle to the cubic's two
      const q: Pt = [(3 * (cubic[0][0] + cubic[1][0]) - g.from[0] - g.to[0]) / 4, (3 * (cubic[0][1] + cubic[1][1]) - g.from[1] - g.to[1]) / 4]
      return { c: "Q", v: [...q, ...g.to] }
    }
    case "T": return { c: "T", v: [...g.to] }
  }
}

/** Turns the segments ending at the given points into another type */
export function convertPoints(segs: Seg[], points: PointRef[], type: SegType): Seg[] {
  const idx = [...new Set(points.map((p) => p.seg))].filter((i) => editable(segs[i])).sort((a, b) => a - b)
  if (!idx.length) return segs
  const abs = absolutise(segs).map((s) => ({ c: s.c, v: [...s.v] }))
  const geo = geometry(segs)
  // Later S/T segments lean on these, so free them first
  for (const i of idx) standAlone(abs, geo, i + 1)
  // Work out every new segment from the untouched geometry, then swap them in
  const next = idx.map((i) => asType(abs, geo, i, type))
  idx.forEach((i, k) => { if (next[k]) abs[i] = next[k]! })
  return withCase(abs, (i) => isRel(segs[i].c))
}

/** Corner points become curves with handles to pull; curves become corners */
export function toggleCorner(segs: Seg[], points: PointRef[]): Seg[] {
  const abs = absolutise(segs)
  const curved = (i: number) => /[CSQT]/.test(abs[i]?.c ?? "")
  const ends = [...new Set(points.map((p) => p.seg))].filter((i) => editable(segs[i]))
  // A point is a curve point if either side of it bends
  const anyCurve = ends.some((i) => curved(i) || curved(i + 1))
  const touch = [...new Set(ends.flatMap((i) => [i, i + 1]))].filter((i) => editable(segs[i]) && segs[i].c.toLowerCase() !== "a")
  return convertPoints(segs, touch.map((seg) => ({ seg, kind: "end" })), anyCurve ? "L" : "C")
}

/** The point halfway along segment i+1 (the one leaving this point) becomes a new point */
export function addPointAfter(segs: Seg[], seg: number): Seg[] {
  const abs = absolutise(segs).map((s) => ({ c: s.c, v: [...s.v] }))
  const geo = geometry(segs)
  const i = seg + 1
  const s = abs[i]
  if (!s || s.c === "M") return segs
  standAlone(abs, geo, i + 1)
  standAlone(abs, geo, i)
  const g = geo[i]
  const t = abs[i]
  let parts: Seg[]
  if (t.c === "C") {
    // de Casteljau at the middle
    const p0 = g.from, p1: Pt = [t.v[0], t.v[1]], p2: Pt = [t.v[2], t.v[3]], p3 = g.to
    const a = lerp(p0, p1, .5), b = lerp(p1, p2, .5), c = lerp(p2, p3, .5)
    const d = lerp(a, b, .5), e = lerp(b, c, .5), m = lerp(d, e, .5)
    parts = [{ c: "C", v: [...a, ...d, ...m] }, { c: "C", v: [...e, ...c, ...p3] }]
  } else if (t.c === "Q") {
    const p1: Pt = [t.v[0], t.v[1]]
    const a = lerp(g.from, p1, .5), b = lerp(p1, g.to, .5), m = lerp(a, b, .5)
    parts = [{ c: "Q", v: [...a, ...m] }, { c: "Q", v: [...b, ...g.to] }]
  } else if (t.c === "A") {
    // Splitting an arc exactly is a job of its own, so arcs are left alone
    return segs
  } else if (t.c === "Z") {
    parts = [{ c: "L", v: [...lerp(g.from, g.to, .5)] }, t]
  } else {
    parts = [{ c: "L", v: [...lerp(g.from, g.to, .5)] }, { c: "L", v: [...g.to] }]
  }
  abs.splice(i, 1, ...parts)
  // The new segment takes the case of the one it came from
  const rel = (k: number) => (k <= i ? isRel(segs[Math.min(k, segs.length - 1)].c) : isRel(segs[k - 1].c))
  return withCase(abs, rel)
}

/** Removes points; the path joins straight across the gap's neighbours */
export function deletePoints(segs: Seg[], points: PointRef[]): Seg[] {
  const idx = [...new Set(points.map((p) => p.seg))].filter((i) => segs[i] && !/[Zz]/.test(segs[i].c)).sort((a, b) => b - a)
  if (!idx.length) return segs
  const abs = absolutise(segs).map((s) => ({ c: s.c, v: [...s.v] }))
  const geo = geometry(segs)
  const rel = segs.map((s) => isRel(s.c))
  for (const i of idx) {
    standAlone(abs, geo, i + 1)
    if (abs[i].c === "M") {
      // The path now starts where the next segment ended
      const n = abs[i + 1]
      if (n && n.c !== "M" && n.c !== "Z") abs[i + 1] = { c: "M", v: [...geo[i + 1].to] }
    }
    abs.splice(i, 1)
    rel.splice(i, 1)
  }
  // A path that's only moves and closes draws nothing; drop the leftovers
  const out = abs.length && abs[0].c !== "M" ? [{ c: "M", v: [...geo[0].to] }, ...abs] : abs
  if (out !== abs) rel.unshift(isRel(segs[0].c))
  return withCase(out, (k) => rel[k] ?? false)
}

/** Turns segment i between absolute and relative for every selected point */
export function setPointsCase(segs: Seg[], points: PointRef[], relative: boolean): Seg[] {
  const set = new Set(points.map((p) => p.seg))
  return withCase(absolutise(segs), (i) => (set.has(i) ? relative : isRel(segs[i].c)))
}

/**
 * The path drawn through a 2D matrix (a b c d e f). Null for arcs, which
 * can't take a skew or uneven scale as plain numbers: those keep a transform.
 */
export function transformPath(segs: Seg[], m: { a: number, b: number, c: number, d: number, e: number, f: number }): Seg[] | null {
  const abs = absolutise(segs)
  if (abs.some((s) => s.c === "A")) return null
  const geo = geometry(segs)
  const pt = (x: number, y: number) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]
  const out = abs.map((s, i): Seg => {
    switch (s.c) {
      case "Z": return s
      case "H": case "V": return { c: "L", v: pt(...geo[i].to) }
      default: {
        const v: number[] = []
        for (let k = 0; k < s.v.length; k += 2) v.push(...pt(s.v[k], s.v[k + 1]))
        return { c: s.c, v }
      }
    }
  })
  return withCase(out, (i) => isRel(segs[i].c))
}
