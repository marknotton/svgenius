import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import {
  adjustFromText, adjustToText, applyAffine, composeAffine, diffAdjust, fromAffine, fromScales, IDENTITY, isIdentity, normAngle, scalesOf, toAffine, type Affine
} from "@marknotton/svgenius-core/designPrinciples"
import { svgDataUrl } from "@marknotton/svgenius-core/format"
import { dpShapeFrame, shapeMaskUrl, type GuideShape } from "@marknotton/svgenius-core/shapes"
import { fmtNum, getAttr, parseLength, parseViewBox, rootTag, type ViewBox } from "@marknotton/svgenius-core/svgRoot"
import { affineSvg, artworkBounds, unadjustSvg } from "@marknotton/svgenius-core/trim"
import type { ArtAdjust, Backdrop, DesignPrinciple, Keyline, SvgItem } from "@marknotton/svgenius-core/types"
import { adapter } from "../host"
import { IconArrowSolid, IconChevronDown, IconChevronLeft, IconChevronRight, IconCopy, IconMagnet, IconRedo, IconReset, IconUndo, IconX } from "../icons"
import { useCommands } from "../lib/commands"
import { EditorTabs } from "./EditorTabs"
import { GridGuides, gridStep } from "./GridGuides"
import { usePreviewCss, withPreviewCss } from "./PreviewCss"
import { ShapeGuide, ShapeOptions } from "./ShapeGuide"

// ── Quick Edit ────────────────────────────────────────────────────────────────
// One file at a time, big, over a design principle's grid, for placing it by
// exact steps or by hand: move, scale, stretch, rotate, fit and align. The
// placement is the file's own and is applied last of all the artwork moves, in
// the finished canvas, so nothing in the preset can move it again. The preview
// moves straight away (a CSS transform of the last result) and settles on the
// real output a moment later.

export interface QuickviewProps {
  /** The files to page through, in order */
  items: SvgItem[]
  startId: string
  backdrop: Backdrop
  /** The design principle's variation for a file (already in its artwork, shown for information) */
  baseFor: (item: SvgItem) => ArtAdjust
  /** What the file's preset does to its placement before Quick Edit, one line each */
  presetNotesFor?: (item: SvgItem) => string[]
  /** The design principle whose guides to draw */
  principleFor: (item: SvgItem) => DesignPrinciple | null
  principles: DesignPrinciple[]
  /** null follows each file's preset, "none" draws no guides, else a principle id */
  principleChoice: string | null
  onPrincipleChoice: (choice: string | null) => void
  onManagePrinciples?: () => void
  /** Sets a file's own placement (undefined clears it) */
  onAdjust: (id: string, adjust: ArtAdjust | undefined) => void
  /** Re-runs a file */
  onRun: (id: string) => void
  /** Re-runs several files at once */
  onRunMany?: (ids: string[]) => void
  /** Whether items are the selected files (else everything listed) */
  selectionScope?: boolean
  /** Asks before something big, true to go ahead */
  confirm?: (opts: { title: string, body?: ReactNode, confirmLabel?: string }) => Promise<boolean>
  /** Switches to the full editor on this file */
  onFullEdit?: (id: string) => void
  /** The guide shape, null when the overlay is off */
  overlay: GuideShape | null
  onOverlay: (shape: GuideShape | null) => void
  clip: boolean
  onClip: (on: boolean) => void
  guides: boolean
  onGuides: (on: boolean) => void
  step: number
  onStep: (step: number) => void
  notify: (text: string, tone?: "info" | "success" | "error") => void
  /** Closes, saying which file it ended on */
  onClose: (lastId: string) => void
}

/** Another dialog (Design principles, a confirmation) is open on top */
const covered = () => document.querySelectorAll(".modal").length > 1

interface Entry { id: string, before: ArtAdjust, after: ArtAdjust, kind: string, t: number, /** Other files changed in the same step */ others?: Array<{ id: string, before: ArtAdjust }> }

const STEPS = [1, 0.1, 0.01]
const TURNS = [1, 5, 15, 45, 90]
const own = (item: SvgItem | undefined) => item?.adjust ?? IDENTITY
const tidy = (a: ArtAdjust): ArtAdjust => {
  const { X, Y } = scalesOf(a)
  return fromScales(+X.toFixed(6), +Y.toFixed(6), +a.x.toFixed(4), +a.y.toFixed(4), +(a.r ?? 0).toFixed(4))
}
const same = (a: ArtAdjust, b: ArtAdjust) => a.scale === b.scale && a.x === b.x && a.y === b.y
  && (a.sx ?? 1) === (b.sx ?? 1) && (a.sy ?? 1) === (b.sy ?? 1) && (a.r ?? 0) === (b.r ?? 0)

export type FitSide = "width" | "height" | "both"
export type Align = "tl" | "t" | "tr" | "l" | "c" | "r" | "bl" | "b" | "br"
const ALIGNS: Array<{ value: Align, label: string, glyph: string }> = [
  { value: "tl", label: "Top left", glyph: "↖" }, { value: "t", label: "Top", glyph: "↑" }, { value: "tr", label: "Top right", glyph: "↗" },
  { value: "l", label: "Left", glyph: "←" }, { value: "c", label: "Centre, both ways", glyph: "•" }, { value: "r", label: "Right", glyph: "→" },
  { value: "bl", label: "Bottom left", glyph: "↙" }, { value: "b", label: "Bottom", glyph: "↓" }, { value: "br", label: "Bottom right", glyph: "↘" }
]
/** Where an align point sits in a box, 0 to 1 each way */
const ALIGN_AT: Record<Align, [number, number]> = { tl: [0, 0], t: [0.5, 0], tr: [1, 0], l: [0, 0.5], c: [0.5, 0.5], r: [1, 0.5], bl: [0, 1], b: [0.5, 1], br: [1, 1] }

type Tool = "move" | "rotate"
/** The transform origin for scale and rotate */
type Pivot = "art" | "canvas" | Exclude<Align, "c"> | "custom"
const PIVOTS: Array<{ value: Pivot, label: string }> = [
  { value: "art", label: "Artwork centre" }, { value: "canvas", label: "Canvas centre" },
  { value: "tl", label: "Artwork top left" }, { value: "t", label: "Artwork top" }, { value: "tr", label: "Artwork top right" },
  { value: "l", label: "Artwork left" }, { value: "r", label: "Artwork right" },
  { value: "bl", label: "Artwork bottom left" }, { value: "b", label: "Artwork bottom" }, { value: "br", label: "Artwork bottom right" }
]
/** What fit, align and snapping measure against: the canvas, the live area, or one keyline (by index) */
type Reference = "canvas" | "live" | `key:${number}`

// ── Preferences on this device ────────────────────────────────────────────────
const PREF = "svgenius:quickedit:"
const readPref = (key: string, d: string) => { try { return localStorage.getItem(PREF + key) ?? d } catch { return d } }
const writePref = (key: string, v: string) => { try { localStorage.setItem(PREF + key, v) } catch { /* unavailable */ } }
function usePref<T extends string | number | boolean>(key: string, d: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    const raw = readPref(key, String(d))
    return (typeof d === "number" ? (Number.isFinite(Number(raw)) ? Number(raw) : d) : typeof d === "boolean" ? raw === "true" : raw) as T
  })
  useEffect(() => writePref(key, String(v)), [key, v])
  return [v, setV]
}

function viewBoxOf(svg: string | undefined): ViewBox | null {
  const tag = svg ? rootTag(svg) : null
  if (!tag) return null
  const vb = parseViewBox(getAttr(tag, "viewBox"))
  if (vb) return vb
  const w = parseLength(getAttr(tag, "width")), h = parseLength(getAttr(tag, "height"))
  return w && h ? { x: 0, y: 0, w, h } : null
}

const centreOf = (vb: ViewBox): [number, number] => [vb.x + vb.w / 2, vb.y + vb.h / 2]

/** The bounding box of a box after an adjustment (exact unless it's turned by something other than quarter turns) */
function boxAfter(b: ViewBox, a: ArtAdjust, vb: ViewBox): ViewBox {
  const m = toAffine(a)
  const [cx, cy] = centreOf(vb)
  const pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].map(([x, y]) => applyAffine(m, cx, cy, x, y))
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1])
  const x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** A design principle's canvas, centred and fitted inside the viewBox like its guides are drawn */
function dpFrame(dp: DesignPrinciple, vb: ViewBox) {
  const s = Math.min(vb.w / dp.width, vb.h / dp.height)
  const ox = vb.x + (vb.w - dp.width * s) / 2, oy = vb.y + (vb.h - dp.height * s) / 2
  return { s, box: (x: number, y: number, w: number, h: number): ViewBox => ({ x: ox + x * s, y: oy + y * s, w: w * s, h: h * s }) }
}
const keylineBox = (dp: DesignPrinciple, k: Keyline, vb: ViewBox) => dpFrame(dp, vb).box((dp.width - k.w) / 2, (dp.height - k.h) / 2, k.w, k.h)
const liveBox = (dp: DesignPrinciple, vb: ViewBox) => dpFrame(dp, vb).box(dp.padding, dp.padding, Math.max(1e-6, dp.width - dp.padding * 2), Math.max(1e-6, dp.height - dp.padding * 2))

function referenceBox(ref: Reference, dp: DesignPrinciple | null, vb: ViewBox): ViewBox {
  if (!dp || ref === "canvas") return vb
  if (ref === "live") return liveBox(dp, vb)
  const k = dp.keylines[Number(ref.slice(4))]
  return k ? keylineBox(dp, k, vb) : liveBox(dp, vb)
}
const keylineLabel = (k: Keyline) => `${k.kind[0].toUpperCase()}${k.kind.slice(1)} ${fmtNum(k.w, 2)}${k.w === k.h && k.kind !== "portrait" && k.kind !== "landscape" ? "" : ` × ${fmtNum(k.h, 2)}`}`

/** A keyline or the live area as markup in viewBox units, for the outline and the mask */
function keyShapeMarkup(mask: string, dp: DesignPrinciple, vb: ViewBox, attrs: string) {
  const s = dpFrame(dp, vb).s
  if (mask === "live") {
    const b = liveBox(dp, vb)
    return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" ${attrs}/>`
  }
  const k = dp.keylines[Number(mask.slice(4))]
  if (!k) return ""
  const b = keylineBox(dp, k, vb)
  if (k.kind === "circle") return `<ellipse cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" rx="${b.w / 2}" ry="${b.h / 2}" ${attrs}/>`
  const rx = Math.min(dp.radius * s, b.w / 2, b.h / 2)
  return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${rx}" ${attrs}/>`
}

/** delta after a, with delta's linear part L working around point P (absolute) */
function aroundPoint(a: ArtAdjust, L: Affine["L"], P: [number, number], vb: ViewBox): ArtAdjust {
  const [cx, cy] = centreOf(vb)
  const dx = P[0] - cx, dy = P[1] - cy
  const delta: Affine = { L, t: [dx - (L[0] * dx + L[2] * dy), dy - (L[1] * dx + L[3] * dy)] }
  return fromAffine(composeAffine(toAffine(a), delta))
}
const turnL = (deg: number): Affine["L"] => {
  const th = (deg * Math.PI) / 180
  return [Math.cos(th), Math.sin(th), -Math.sin(th), Math.cos(th)]
}

/** Snaps a value to the nearest candidate within reach, returning the shift and the line it snapped to */
function snapAxis(points: number[], candidates: number[], reach: number): { shift: number, line: number | null } {
  let best: { shift: number, line: number | null } = { shift: 0, line: null }
  let dist = reach
  for (const p of points) for (const c of candidates) {
    const d = Math.abs(c - p)
    if (d < dist) { dist = d; best = { shift: c - p, line: c } }
  }
  return best
}

export function Quickview(p: QuickviewProps) {
  const [id, setId] = useState(p.startId)
  const [dir, setDir] = useState<"next" | "prev" | null>(null)
  const index = Math.max(0, p.items.findIndex((i) => i.id === id))
  const item = p.items[index] as SvgItem | undefined
  const [peek, setPeek] = useState(false)
  const [hideOverlay, setHideOverlay] = useState(false)
  const [customStep, setCustomStep] = useState(() => (STEPS.includes(p.step) ? "" : String(p.step)))
  const [stretch, setStretch] = usePref<boolean>("stretch", false)
  const [reference, setReference] = usePref<string>("reference", "live")
  const [gridSteps, setGridSteps] = usePref<boolean>("grid-steps", false)
  const [turnStep, setTurnStep] = usePref<number>("turn-step", 1)
  const [customTurn, setCustomTurn] = useState(() => (TURNS.includes(turnStep) ? "" : String(turnStep)))
  const [pivot, setPivot] = usePref<string>("pivot", "art")
  const [customPivot, setCustomPivot] = useState<[number, number] | null>(null)
  const [tool, setTool] = usePref<string>("tool", "move")
  const [snapMove, setSnapMove] = usePref<boolean>("snap-move", true)
  const [snapTurn, setSnapTurn] = usePref<boolean>("snap-turn", true)
  /** A keyline or the live area used as the overlay and mask, instead of a guide shape */
  const [keyMask, setKeyMask] = useState<string | null>(null)
  const [snapLines, setSnapLines] = useState<{ x: number | null, y: number | null }>({ x: null, y: null })
  const [dragging, setDragging] = useState<Tool | "pivot" | null>(null)

  // Latest props for the key handler and timers
  const live = useRef(p)
  live.current = p
  const itemRef = useRef(item)
  itemRef.current = item

  // ── Undo and redo ──────────────────────────────────────────────────────────
  const [history, setHistory] = useState<{ undo: Entry[], redo: Entry[] }>({ undo: [], redo: [] })
  const historyRef = useRef(history)
  historyRef.current = history

  // Re-run shortly after the last change, so held keys and drags don't queue up runs
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const schedule = useCallback((fileId: string) => {
    clearTimeout(timers.current.get(fileId))
    timers.current.set(fileId, setTimeout(() => { timers.current.delete(fileId); live.current.onRun(fileId) }, 140))
  }, [])
  useEffect(() => () => { for (const t of timers.current.values()) clearTimeout(t) }, [])

  const runMany = useCallback((ids: string[]) => {
    const q = live.current
    if (q.onRunMany) q.onRunMany(ids)
    else for (const fileId of ids) schedule(fileId)
  }, [schedule])

  const commit = useCallback((fileId: string, a: ArtAdjust) => {
    live.current.onAdjust(fileId, isIdentity(a) ? undefined : a)
    schedule(fileId)
  }, [schedule])

  /** Changes the open file's placement, as one undo step (quick repeats of the same kind, and whole drags, merge) */
  const change = useCallback((fn: (a: ArtAdjust) => ArtAdjust, kind: string) => {
    const it = itemRef.current
    if (!it) return
    const before = own(it)
    const after = tidy(fn(before))
    if (!(after.scale > 0) || !Number.isFinite(after.x) || !Number.isFinite(after.y) || same(before, after)) return
    const now = Date.now()
    setHistory((h) => {
      const last = h.undo[h.undo.length - 1]
      if (last && last.id === it.id && last.kind === kind && kind !== "set" && (kind.startsWith("drag:") || now - last.t < 700)) {
        return { undo: [...h.undo.slice(0, -1), { ...last, after, t: now }], redo: [] }
      }
      return { undo: [...h.undo.slice(-199), { id: it.id, before, after, kind, t: now }], redo: [] }
    })
    commit(it.id, after)
  }, [commit])

  const travel = useCallback((back: boolean) => {
    const h = historyRef.current
    const entry = back ? h.undo[h.undo.length - 1] : h.redo[h.redo.length - 1]
    if (!entry) return false
    setHistory(back
      ? { undo: h.undo.slice(0, -1), redo: [...h.redo, entry] }
      : { undo: [...h.undo, entry], redo: h.redo.slice(0, -1) })
    commit(entry.id, back ? entry.before : entry.after)
    if (entry.others) {
      for (const o of entry.others) live.current.onAdjust(o.id, back ? (isIdentity(o.before) ? undefined : o.before) : (isIdentity(entry.after) ? undefined : entry.after))
      runMany(entry.others.map((o) => o.id))
    }
    // Show the file the step belongs to
    if (entry.id !== itemRef.current?.id && live.current.items.some((i) => i.id === entry.id)) { setDir(null); setId(entry.id) }
    return true
  }, [commit, runMany])

  useCommands((cmd) => {
    if (covered()) return false
    if (cmd === "undo" || cmd === "redo") { travel(cmd === "undo"); return true }
    // Nothing else reaches the app beneath while Quick Edit is open
    return cmd === "selectAll" || cmd === "duplicate" || cmd === "group" || cmd === "ungroup" || cmd === "breakApart"
  })

  // ── Paging ─────────────────────────────────────────────────────────────────
  const go = useCallback((delta: 1 | -1) => {
    const list = live.current.items
    if (list.length < 2) return
    const at = Math.max(0, list.findIndex((i) => i.id === itemRef.current?.id))
    setDir(delta > 0 ? "next" : "prev")
    setId(list[(at + delta + list.length) % list.length].id)
  }, [])

  // Each file gets a fresh run when it's shown (skipped when already up to date)
  useEffect(() => { if (item) live.current.onRun(item.id) }, [item?.id])  // eslint-disable-line react-hooks/exhaustive-deps
  // A custom pivot belongs to the file it was set on
  useEffect(() => { setCustomPivot(null); if (pivot === "custom") setPivot("art") }, [item?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── The artwork without its placement ──────────────────────────────────────
  // Measured once per result: the markup with the baked placement taken off,
  // and its bounds. Everything else is worked out from these.
  const output = item?.result?.output
  const svg = output ?? item?.source
  const vb = useMemo(() => viewBoxOf(svg), [svg])
  const [pre, setPre] = useState<{ svg: string, b0: ViewBox } | null>(null)
  const preRef = useRef(pre)
  preRef.current = pre
  useEffect(() => {
    if (!output || !item) { setPre(null); return }
    let cancelled = false
    const bare = unadjustSvg(output, item.result?.adjust)
    artworkBounds(bare).then((b0) => { if (!cancelled) setPre(b0 ? { svg: bare, b0 } : null) }).catch(() => {})
    return () => { cancelled = true }
  }, [output])  // eslint-disable-line react-hooks/exhaustive-deps
  /** Exact bounds of the artwork with a placement */
  const exactBox = useCallback(async (a: ArtAdjust) => {
    const pr = preRef.current
    if (!pr) return null
    return await artworkBounds(affineSvg(pr.svg, toAffine(a))).catch(() => null)
  }, [])

  const dp = item ? p.principleFor(item) : null
  const vbRef = useRef(vb)
  vbRef.current = vb
  const refBox = useCallback(() => {
    const v = vbRef.current
    return v ? referenceBox(reference as Reference, itemRef.current ? live.current.principleFor(itemRef.current) : null, v) : null
  }, [reference])
  // A keyline picked from another principle falls back to the live area
  useEffect(() => {
    if (reference.startsWith("key:") && !dp?.keylines[Number(reference.slice(4))]) setReference(dp ? "live" : "canvas")
    if (keyMask?.startsWith("key:") && !dp?.keylines[Number(keyMask.slice(4))]) setKeyMask(null)
    if (keyMask === "live" && !dp) setKeyMask(null)
  }, [dp?.id])  // eslint-disable-line react-hooks/exhaustive-deps

  /** One grid cell of the design principle, in viewBox units */
  const gridUnit = dp && vb ? gridStep(Math.max(dp.width, dp.height)) * dpFrame(dp, vb).s : null
  const step = gridSteps && gridUnit ? gridUnit : p.step
  const stepRef = useRef(step)
  stepRef.current = step

  /** The transform origin, in viewBox units, for a placement */
  const pivotPoint = useCallback((a: ArtAdjust): [number, number] => {
    const v = vbRef.current
    if (!v) return [0, 0]
    const [cx, cy] = centreOf(v)
    if (pivot === "canvas") return [cx, cy]
    if (pivot === "custom") return customPivot ?? [cx, cy]
    const b0 = preRef.current?.b0
    if (!b0) return [cx, cy]
    const [fx, fy] = pivot === "art" ? [0.5, 0.5] : ALIGN_AT[pivot as Align] ?? [0.5, 0.5]
    return applyAffine(toAffine(a), cx, cy, b0.x + b0.w * fx, b0.y + b0.h * fy)
  }, [pivot, customPivot])

  // ── Moves ──────────────────────────────────────────────────────────────────
  const move = useCallback((dx: number, dy: number, mult = 1) => {
    const s = stepRef.current * mult
    change((a) => ({ ...a, x: a.x + dx * s, y: a.y + dy * s }), "move")
  }, [change])

  /** Grows or shrinks the artwork's longest side by the step, around the pivot */
  const scaleBy = useCallback((sign: 1 | -1, mult = 1) => {
    const s = stepRef.current * mult
    const b0 = preRef.current?.b0, v = vbRef.current
    if (!v) return
    change((a) => {
      const { X, Y } = scalesOf(a)
      const size = b0 ? Math.max(b0.w * X, b0.h * Y) : Math.max(v.w, v.h) * X
      const k = Math.max(size * 0.01, size + sign * s) / size
      return aroundPoint(a, [k, 0, 0, k], pivotPoint(a), v)
    }, "scale")
  }, [change, pivotPoint])

  const turnBy = useCallback((deg: number, kind = "turn") => {
    const v = vbRef.current
    if (!v) return
    change((a) => aroundPoint(a, turnL(deg), pivotPoint(a), v), kind)
  }, [change, pivotPoint])

  const reset = useCallback(() => change(() => IDENTITY, "set"), [change])

  // ── Fit and align ──────────────────────────────────────────────────────────
  const fit = useCallback(async (side: FitSide) => {
    const it = itemRef.current, t = refBox(), v = vbRef.current
    if (!it || !t || !v) return
    const a = own(it)
    const now = await exactBox(a)
    if (!now) return
    let { X, Y } = scalesOf(a)
    const r = normAngle(a.r ?? 0)
    const quarter = Math.abs(r / 90 - Math.round(r / 90)) < 1e-6
    const swapped = quarter && Math.abs(Math.round(r / 90)) % 2 === 1
    if (stretch && quarter) {
      const kx = side !== "height" ? t.w / now.w : 1, ky = side !== "width" ? t.h / now.h : 1
      if (swapped) { X *= ky; Y *= kx } else { X *= kx; Y *= ky }
    } else {
      if (stretch) live.current.notify("Stretch fits straight or quarter-turned artwork, so this kept the aspect ratio", "info")
      const k = side === "width" ? t.w / now.w : side === "height" ? t.h / now.h : Math.min(t.w / now.w, t.h / now.h)
      X *= k; Y *= k
    }
    const sized = fromScales(X, Y, a.x, a.y, a.r ?? 0)
    const at = await exactBox(sized)
    if (!at) return
    // Centred on the reference along the side(s) it filled, kept where it was the other way
    const cx = side === "height" ? now.x + now.w / 2 : t.x + t.w / 2
    const cy = side === "width" ? now.y + now.h / 2 : t.y + t.h / 2
    if (itemRef.current?.id !== it.id) return
    change(() => ({ ...sized, x: sized.x + cx - (at.x + at.w / 2), y: sized.y + cy - (at.y + at.h / 2) }), "set")
  }, [change, exactBox, refBox, stretch])

  const align = useCallback(async (where: Align) => {
    const it = itemRef.current, t = refBox()
    if (!it || !t) return
    const a = own(it)
    const now = await exactBox(a)
    if (!now || itemRef.current?.id !== it.id) return
    const [fx, fy] = ALIGN_AT[where]
    change((cur) => ({ ...cur, x: cur.x + (t.x + t.w * fx) - (now.x + now.w * fx), y: cur.y + (t.y + t.h * fy) - (now.y + now.h * fy) }), "set")
  }, [change, exactBox, refBox])

  // ── Copying ────────────────────────────────────────────────────────────────
  const previous = index > 0 ? p.items[index - 1] : null
  const copyPrevious = useCallback(() => {
    const list = live.current.items
    const at = list.findIndex((i) => i.id === itemRef.current?.id)
    const prev = at > 0 ? list[at - 1] : null
    if (!prev) return
    change(() => own(prev), "set")
    live.current.notify(`Copied ${prev.name}'s placement`, "info")
  }, [change])

  const describe = (a: ArtAdjust) => {
    const { X, Y } = scalesOf(a)
    const scale = X === Y ? `×${fmtNum(X, 4)}` : `×${fmtNum(X, 4)} across, ×${fmtNum(Y, 4)} down`
    return `X ${fmtNum(a.x, 4)}, Y ${fmtNum(a.y, 4)}, scale ${scale}${a.r ? `, ${fmtNum(a.r, 2)}°` : ""}`
  }

  /** Gives every file in the list the open file's placement, after asking */
  const applyToAll = useCallback(async () => {
    const it = itemRef.current
    const q = live.current
    if (!it) return
    const a = own(it)
    const others = q.items.filter((i) => i.id !== it.id && !same(own(i), a))
    const n = q.items.length
    const what = q.selectionScope ? `all ${n} selected SVGs` : `all ${n} SVGs in the list`
    const summary = describe(a)
    if (!others.length) { q.notify(`Every file already has ${summary}`, "info"); return }
    const ok = q.confirm
      ? await q.confirm({
        title: `Apply ${summary} to ${what}?`,
        body: <>
          <p>{others.length === n - 1 ? `This replaces the placement of the other ${n - 1}.` : `${others.length} of them will change; the rest already match.`} Each file's preset still runs first.</p>
          <p className="text-3">⌘Z undoes it while Quick Edit is open.</p>
        </>,
        confirmLabel: `Apply to ${n}`
      })
      : true
    if (!ok) return
    const now = Date.now()
    setHistory((h) => ({ undo: [...h.undo.slice(-199), { id: it.id, before: a, after: a, kind: "all", t: now, others: others.map((o) => ({ id: o.id, before: own(o) })) }], redo: [] }))
    for (const o of others) q.onAdjust(o.id, isIdentity(a) ? undefined : a)
    runMany(others.map((o) => o.id))
    q.notify(`Applied to ${others.length === 1 ? "1 other file" : `${others.length} other files`}`, "success")
  }, [runMany])  // eslint-disable-line react-hooks/exhaustive-deps

  const copyText = useCallback(async () => {
    const text = adjustToText(own(itemRef.current))
    try {
      await navigator.clipboard.writeText(text)
      live.current.notify("Copied the placement", "success")
    } catch {
      live.current.notify("Couldn't reach the clipboard", "error")
    }
  }, [])
  const pasteText = useCallback((text: string) => {
    const a = adjustFromText(text)
    if (!a) { live.current.notify("The clipboard doesn't hold a placement", "info"); return }
    change(() => a, "set")
    live.current.notify("Pasted the placement", "success")
  }, [change])
  const pasteFromClipboard = useCallback(async () => {
    try { pasteText(await adapter().readClipboardText()) } catch { live.current.notify("Couldn't reach the clipboard", "error") }
  }, [pasteText])

  // ⌘C / ⌘V (the menu's Copy and Paste too) copy and paste the placement as JSON
  useEffect(() => {
    const typing = () => {
      const el = document.activeElement as HTMLElement | null
      return !!el?.closest("input, textarea, select, [contenteditable]") || !!window.getSelection()?.toString()
    }
    const onCopy = (e: ClipboardEvent) => {
      if (covered() || typing() || !e.clipboardData) return
      e.preventDefault(); e.stopImmediatePropagation()
      e.clipboardData.setData("text/plain", adjustToText(own(itemRef.current)))
      live.current.notify("Copied the placement", "success")
    }
    const onPaste = (e: ClipboardEvent) => {
      if (covered() || typing()) return
      e.preventDefault(); e.stopImmediatePropagation()
      pasteText(e.clipboardData?.getData("text/plain") ?? "")
    }
    window.addEventListener("copy", onCopy, true)
    window.addEventListener("paste", onPaste, true)
    return () => { window.removeEventListener("copy", onCopy, true); window.removeEventListener("paste", onPaste, true) }
  }, [pasteText])

  // ── Keys ───────────────────────────────────────────────────────────────────
  const turnStepRef = useRef(turnStep)
  turnStepRef.current = turnStep
  useEffect(() => {
    const MOVES: Record<string, [number, number]> = {
      ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
      Numpad8: [0, -1], Numpad2: [0, 1], Numpad4: [-1, 0], Numpad6: [1, 0]
    }
    const down = (e: KeyboardEvent) => {
      if (covered()) return
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); live.current.onClose(itemRef.current?.id ?? live.current.startId); return }
      const t = e.target as HTMLElement
      if (t.closest?.("input, textarea, select, [contenteditable]")) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const mult = e.shiftKey ? 10 : 1
      const handled = (() => {
        const mv = MOVES[e.code] ?? MOVES[e.key]
        if (mv) { move(mv[0], mv[1], mult); return true }
        if (e.key === "+" || e.key === "=" || e.code === "NumpadAdd") { scaleBy(1, mult); return true }
        if (e.key === "-" || e.key === "_" || e.code === "NumpadSubtract") { scaleBy(-1, mult); return true }
        if (e.code === "BracketLeft") { turnBy(-turnStepRef.current * mult); return true }
        if (e.code === "BracketRight") { turnBy(turnStepRef.current * mult); return true }
        const k = e.key.toLowerCase()
        if (k === "q") { if (!e.repeat) go(-1); return true }
        if (k === "w") { if (!e.repeat) go(1); return true }
        if (k === "r") { if (!e.repeat) reset(); return true }
        if (k === "v") { setTool("move"); return true }
        if (k === "o") { setTool("rotate"); return true }
        if (k === "e") { setPeek(true); return true }
        if (k === "t") { setHideOverlay(true); return true }
        return false
      })()
      if (handled) { e.preventDefault(); e.stopPropagation() }
      // Keep everything else (Delete and so on) away from the list beneath
      else if (e.key === "Delete" || e.key === "Backspace" || e.key === " ") { e.preventDefault(); e.stopPropagation() }
    }
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === "e") setPeek(false)
      if (k === "t") setHideOverlay(false)
    }
    const blur = () => { setPeek(false); setHideOverlay(false) }
    window.addEventListener("keydown", down, true)
    window.addEventListener("keyup", up, true)
    window.addEventListener("blur", blur)
    return () => { window.removeEventListener("keydown", down, true); window.removeEventListener("keyup", up, true); window.removeEventListener("blur", blur) }
  }, [move, scaleBy, turnBy, go, reset, setTool])

  // ── Dragging on the preview ────────────────────────────────────────────────
  const canvasRef = useRef<HTMLDivElement>(null)
  const dragSeq = useRef(0)
  /** Lines the artwork snaps to: the reference box's edges and middle, the canvas middle and the grid */
  const snapTargets = useCallback((axis: "x" | "y") => {
    const v = vbRef.current, t = refBox()
    if (!v || !t) return []
    const out = axis === "x" ? [t.x, t.x + t.w / 2, t.x + t.w, v.x + v.w / 2] : [t.y, t.y + t.h / 2, t.y + t.h, v.y + v.h / 2]
    const it = itemRef.current
    const d = it ? live.current.principleFor(it) : null
    if (d) {
      const f = dpFrame(d, v)
      const g = gridStep(Math.max(d.width, d.height))
      const size = axis === "x" ? d.width : d.height
      for (let u = 0; u <= size + 1e-9; u += g) out.push(axis === "x" ? f.box(u, 0, 0, 0).x : f.box(0, u, 0, 0).y)
    }
    return out
  }, [refBox])

  const onStageDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !item || !vb || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    if (!rect.width) return
    const per = vb.w / rect.width
    const start = own(item)
    const kind = `drag:${++dragSeq.current}`
    const x0 = e.clientX, y0 = e.clientY
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const toVb = (cx: number, cy: number): [number, number] => [vb.x + (cx - rect.left) * per, vb.y + (cy - rect.top) * per]

    if (tool === "rotate") {
      const P = pivotPoint(start)
      const [px, py] = [rect.left + (P[0] - vb.x) / per, rect.top + (P[1] - vb.y) / per]
      const a0 = Math.atan2(y0 - py, x0 - px)
      setDragging("rotate")
      const onMove = (ev: PointerEvent) => {
        let deg = ((Math.atan2(ev.clientY - py, ev.clientX - px) - a0) * 180) / Math.PI
        if (snapTurn && !ev.altKey) {
          const unit = turnStepRef.current > 0 ? turnStepRef.current : 1
          const target = Math.round(((start.r ?? 0) + deg) / unit) * unit
          deg = target - (start.r ?? 0)
        }
        change(() => aroundPoint(start, turnL(deg), P, vb), kind)
      }
      const onUp = () => { el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerup", onUp); el.removeEventListener("pointercancel", onUp); setDragging(null) }
      el.addEventListener("pointermove", onMove)
      el.addEventListener("pointerup", onUp)
      el.addEventListener("pointercancel", onUp)
      return
    }

    // Move: the whole artwork follows the pointer
    const b0 = pre?.b0
    const box0 = b0 ? boxAfter(b0, start, vb) : null
    const xs = snapTargets("x"), ys = snapTargets("y")
    setDragging("move")
    const onMove = (ev: PointerEvent) => {
      let dx = (ev.clientX - x0) * per, dy = (ev.clientY - y0) * per
      // Shift keeps it to one axis
      if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0 }
      let lines = { x: null as number | null, y: null as number | null }
      if (snapMove && !ev.altKey && box0) {
        const reach = 7 * per
        const sx = snapAxis([box0.x + dx, box0.x + box0.w / 2 + dx, box0.x + box0.w + dx], xs, reach)
        const sy = snapAxis([box0.y + dy, box0.y + box0.h / 2 + dy, box0.y + box0.h + dy], ys, reach)
        if (!(ev.shiftKey && dx === 0)) { dx += sx.shift; lines.x = sx.line }
        if (!(ev.shiftKey && dy === 0)) { dy += sy.shift; lines.y = sy.line }
      } else lines = { x: null, y: null }
      setSnapLines(lines)
      change(() => ({ ...start, x: start.x + dx, y: start.y + dy }), kind)
    }
    const onUp = () => {
      el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerup", onUp); el.removeEventListener("pointercancel", onUp)
      setSnapLines({ x: null, y: null }); setDragging(null)
    }
    el.addEventListener("pointermove", onMove)
    el.addEventListener("pointerup", onUp)
    el.addEventListener("pointercancel", onUp)
    void toVb
  }

  /** Dragging the pivot sets a custom one, snapping to the artwork's corners, edges and centre */
  const onPivotDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !item || !vb || !canvasRef.current) return
    e.stopPropagation()
    const rect = canvasRef.current.getBoundingClientRect()
    const per = vb.w / rect.width
    const a = own(item)
    const [cx, cy] = centreOf(vb)
    const b0 = pre?.b0
    const points: Array<[number, number]> = [[cx, cy]]
    if (b0) for (const [fx, fy] of Object.values(ALIGN_AT)) points.push(applyAffine(toAffine(a), cx, cy, b0.x + b0.w * fx, b0.y + b0.h * fy))
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    setDragging("pivot")
    const onMove = (ev: PointerEvent) => {
      let pt: [number, number] = [vb.x + (ev.clientX - rect.left) * per, vb.y + (ev.clientY - rect.top) * per]
      if (snapMove && !ev.altKey) {
        const near = points.find((q) => Math.hypot(q[0] - pt[0], q[1] - pt[1]) < 8 * per)
        if (near) pt = near
      }
      setCustomPivot(pt)
      setPivot("custom")
    }
    const onUp = () => { el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerup", onUp); el.removeEventListener("pointercancel", onUp); setDragging(null) }
    el.addEventListener("pointermove", onMove)
    el.addEventListener("pointerup", onUp)
    el.addEventListener("pointercancel", onUp)
  }

  // ── Preview ────────────────────────────────────────────────────────────────
  const css = usePreviewCss()
  const src = useMemo(() => (svg ? svgDataUrl(withPreviewCss(svg, css)) : undefined), [svg, css])
  // What the shown markup already has baked in
  const baked = output ? item?.result?.adjust ?? IDENTITY : IDENTITY
  // Swap images only once the new one has decoded, with the placement it was made with
  const [shown, setShown] = useState<{ src: string, baked: ArtAdjust, vb: ViewBox | null, id: string } | null>(null)
  useEffect(() => {
    if (!src || !item) return
    let cancelled = false
    const next = { src, baked, vb: viewBoxOf(svg), id: item.id }
    const img = new Image()
    img.src = src
    img.decode().catch(() => {}).then(() => { if (!cancelled) setShown(next) })
    return () => { cancelled = true }
  }, [src])  // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) return null
  const base = p.baseFor(item)
  const mine = own(item)
  const target = peek ? IDENTITY : mine
  const showing = shown && shown.id === item.id ? shown : null
  const delta = showing ? toAffine(diffAdjust(showing.baked, target)) : null
  const sv = showing?.vb ?? vb
  const ratio = sv && sv.w > 0 && sv.h > 0 ? sv.w / sv.h : 1
  const transform = sv && delta && !isIdentity(fromAffine(delta))
    ? `translate(${(delta.t[0] / sv.w) * 100}%, ${(delta.t[1] / sv.h) * 100}%) matrix(${delta.L.join(", ")}, 0, 0)`
    : undefined
  const ms = scalesOf(mine)
  const notes = p.presetNotesFor?.(item) ?? []

  // Overlay and mask: a guide shape, or one of the design principle's keylines
  const usingKey = keyMask && dp && vb ? keyMask : null
  // Shapes fill the design principle's live area (by height when they aren't 1:1)
  const frame = useMemo(() => (dp ? dpShapeFrame(dp) : null), [dp])
  const overlayShape = !usingKey && p.overlay && !hideOverlay ? p.overlay : null
  const maskOn = p.clip && (usingKey || p.overlay)
  const keyMaskUrl = usingKey && vb && dp
    ? `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" preserveAspectRatio="none">${keyShapeMarkup(usingKey, dp, vb, "")}</svg>`)}")`
    : null
  const artMask: CSSProperties | undefined = !maskOn ? undefined
    : keyMaskUrl ? { WebkitMaskImage: keyMaskUrl, maskImage: keyMaskUrl, WebkitMaskSize: "100% 100%", maskSize: "100% 100%" }
    : p.overlay ? { WebkitMaskImage: shapeMaskUrl(p.overlay, frame), maskImage: shapeMaskUrl(p.overlay, frame) } : undefined
  const overlayValue = usingKey ? `dp:${usingKey}` : p.overlay ?? ""

  const pct = (v: number, axis: "x" | "y") => (vb ? (axis === "x" ? ((v - vb.x) / vb.w) * 100 : ((v - vb.y) / vb.h) * 100) : 0)
  const P = vb ? pivotPoint(mine) : null
  const showPivot = !!P && (tool === "rotate" || dragging === "pivot" || pivot === "custom")
  const liveRef = dp ? reference : "canvas"
  const hasPlacement = !isIdentity(mine)

  return (
    <div className="modal-backdrop quickview-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) p.onClose(item.id) }}>
      <div className="modal quickview" role="dialog" aria-modal="true" aria-label={`Quick Edit: ${item.name}`}>
        <header className="quickview__head">
          {p.onFullEdit && <EditorTabs value="quick" onFull={() => p.onFullEdit?.(item.id)} />}
          <div className="file-nav">
            <button className="btn btn--icon" title="Previous file (Q)" aria-label="Previous file" disabled={p.items.length < 2} onClick={() => go(-1)}><IconChevronLeft /></button>
            <span className="file-nav__pos text-3">{index + 1} / {p.items.length}</span>
            <button className="btn btn--icon" title="Next file (W)" aria-label="Next file" disabled={p.items.length < 2} onClick={() => go(1)}><IconChevronRight /></button>
          </div>
          <h2 className="quickview__title" title={item.relPath}>{item.name}</h2>
          <div className="quickview__tools">
            <label className="quickview__pick" title="The design principle whose grid, live area and keylines are drawn">
              <span className="text-3">Guides</span>
              <select className="input input--sm" value={p.principleChoice ?? ""} onChange={(e) => p.onPrincipleChoice(e.target.value || null)}>
                <option value="">Follow the preset</option>
                <option value="none">None</option>
                {p.principles.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            {p.onManagePrinciples && <button className="link" onClick={p.onManagePrinciples}>Manage…</button>}
            <label className="quickview__pick" title="Outline drawn over the artwork, and the shape Mask uses. Hold T to hide it">
              <span className="text-3">Overlay</span>
              <select className="input input--sm" value={overlayValue} onChange={(e) => {
                const v = e.target.value
                if (v.startsWith("dp:")) { setKeyMask(v.slice(3)); return }
                setKeyMask(null)
                // Nothing left to mask with: switch Mask off too, so it never sticks on while disabled
                if (!v && p.clip) p.onClip(false)
                p.onOverlay((v || null) as GuideShape | null)
              }}>
                <option value="">None</option>
                <optgroup label="Shapes"><ShapeOptions /></optgroup>
                {dp && (
                  <optgroup label={dp.name}>
                    {dp.padding > 0 && <option value="dp:live">Live area</option>}
                    {dp.keylines.map((k, i) => <option key={k.id} value={`dp:key:${i}`}>{keylineLabel(k)}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
            <button className={`flag flag--lg${p.clip ? " is-on" : ""}`} aria-pressed={p.clip} disabled={!p.clip && !p.overlay && !usingKey}
              title="Mask the artwork with the overlay" onClick={() => p.onClip(!p.clip)}>Mask</button>
            <button className={`flag flag--lg${p.guides ? " is-on" : ""}`} aria-pressed={p.guides} disabled={!dp}
              title="Show the grid, live area and keylines" onClick={() => p.onGuides(!p.guides)}>Grid</button>
            <button className="btn btn--icon" aria-label="Close Quick Edit" title="Close (Esc)" onClick={() => p.onClose(item.id)}><IconX /></button>
          </div>
        </header>

        <div className="quickview__body">
          <div className={`quickview__stage thumb--${p.backdrop}`}>
            <div className="quickview__toolbar" role="group" aria-label="Drag to">
              <button className={`btn btn--icon${tool === "move" ? " is-on" : ""}`} aria-pressed={tool === "move"} title="Drag to move (V)" onClick={() => setTool("move")}><IconArrowSolid width={14} height={14} /></button>
              <button className={`btn btn--icon${tool === "rotate" ? " is-on" : ""}`} aria-pressed={tool === "rotate"} title="Drag to rotate around the pivot (O)" onClick={() => setTool("rotate")}><IconRotate /></button>
              <span className="quickview__toolbar-sep" />
              <button className={`btn btn--icon${snapMove ? " is-on" : ""}`} aria-pressed={snapMove} title="Snap moves to the reference, the centre and the grid (hold Alt to drag freely)" onClick={() => setSnapMove(!snapMove)}><IconMagnet width={14} height={14} /></button>
              <button className={`btn btn--icon quickview__snap-turn${snapTurn ? " is-on" : ""}`} aria-pressed={snapTurn} title={`Snap turns to ${fmtNum(turnStep, 2)}° steps (hold Alt to turn freely)`} onClick={() => setSnapTurn(!snapTurn)}><IconMagnet width={14} height={14} /><span>°</span></button>
            </div>
            <div key={item.id} ref={canvasRef}
              className={`quickview__canvas thumb__canvas${dir ? ` is-${dir}` : ""} is-${tool}${dragging ? " is-dragging" : ""}`}
              style={{ "--r": ratio } as CSSProperties} onPointerDown={onStageDown}>
              <div className="quickview__art" style={artMask}>
                {showing && <img src={showing.src} alt={item.name} draggable={false} style={{ transform }} />}
              </div>
              {p.guides && dp && <GridGuides dp={dp} />}
              {overlayShape && <ShapeGuide shape={overlayShape} frame={frame} forced />}
              {usingKey && !hideOverlay && vb && dp && (
                <svg className="quickview__keymask" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="none" aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: keyShapeMarkup(usingKey, dp, vb, `vector-effect="non-scaling-stroke"`) }} />
              )}
              {snapLines.x !== null && <span className="quickview__snap quickview__snap--x" style={{ left: `${pct(snapLines.x, "x")}%` }} />}
              {snapLines.y !== null && <span className="quickview__snap quickview__snap--y" style={{ top: `${pct(snapLines.y, "y")}%` }} />}
              {showPivot && P && (
                <div className={`quickview__pivot${pivot === "custom" ? " is-custom" : ""}`} style={{ left: `${pct(P[0], "x")}%`, top: `${pct(P[1], "y")}%` }}
                  title="Pivot: drag it to move it" onPointerDown={onPivotDown} />
              )}
              {peek && <span className="peek-badge">Before Quick Edit</span>}
              {item.status === "running" && <span className="thumb__loading" />}
              {item.status === "error" && <span className="quickview__error">{item.error ?? "Couldn't optimise this file"}</span>}
            </div>
          </div>

          <aside className="quickview__side">
            <Section id="move" title="Move">
              <div className="dpad">
                <span />
                <button className="btn btn--secondary dpad__btn" aria-label="Move up" title="Up" onClick={() => move(0, -1)}>↑</button>
                <span />
                <button className="btn btn--secondary dpad__btn" aria-label="Move left" title="Left" onClick={() => move(-1, 0)}>←</button>
                <button className="btn btn--secondary dpad__btn" aria-label="Reset" title="Back to where the preset puts it" onClick={reset}><IconReset /></button>
                <button className="btn btn--secondary dpad__btn" aria-label="Move right" title="Right" onClick={() => move(1, 0)}>→</button>
                <span />
                <button className="btn btn--secondary dpad__btn" aria-label="Move down" title="Down" onClick={() => move(0, 1)}>↓</button>
                <span />
              </div>
            </Section>

            <Section id="scale" title="Scale and rotate">
              <div className="quickview__scale">
                <button className="btn btn--secondary dpad__btn" aria-label="Smaller" title="Smaller" onClick={() => scaleBy(-1)}>−</button>
                <button className="btn btn--secondary dpad__btn" aria-label="Bigger" title="Bigger" onClick={() => scaleBy(1)}>+</button>
                <span className="text-3">{pre ? `${fmtNum(pre.b0.w * ms.X, 3)} × ${fmtNum(pre.b0.h * ms.Y, 3)} px artwork` : ""}</span>
              </div>
              <div className="quickview__scale">
                <button className="btn btn--secondary dpad__btn" aria-label="Turn left" title={`Turn left ${fmtNum(turnStep, 2)}°`} onClick={() => turnBy(-turnStep)}>⟲</button>
                <button className="btn btn--secondary dpad__btn" aria-label="Turn right" title={`Turn right ${fmtNum(turnStep, 2)}°`} onClick={() => turnBy(turnStep)}>⟳</button>
                <Value label="Angle °" value={mine.r ?? 0} inline onSet={(deg) => change((a) => aroundPoint(a, turnL(normAngle(deg) - (a.r ?? 0)), pivotPoint(a), vb!), "type:r")} />
              </div>
              <label className="quickview__row">
                <span className="text-3">Pivot</span>
                <select className="input input--sm" value={pivot} onChange={(e) => setPivot(e.target.value as Pivot)}>
                  {PIVOTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  {pivot === "custom" && <option value="custom">Where you put it</option>}
                </select>
              </label>
              <p className="text-3 quickview__note">Scale and rotate work around the pivot. Drag it on the preview with the rotate tool to put it anywhere.</p>
            </Section>

            <Section id="fit" title="Fit and align">
              {dp && (
                <label className="quickview__row" title="What fit, align and snapping measure against">
                  <span className="text-3">Reference</span>
                  <select className="input input--sm" value={liveRef} onChange={(e) => setReference(e.target.value)}>
                    <option value="canvas">Canvas</option>
                    {dp.padding > 0 && <option value="live">Live area</option>}
                    {dp.keylines.map((k, i) => <option key={k.id} value={`key:${i}`}>Keyline: {keylineLabel(k)}</option>)}
                  </select>
                </label>
              )}
              <div className="quickview__fit">
                <button className="btn btn--secondary btn--sm" disabled={!pre} title="Fill the reference's width" onClick={() => fit("width")}>Width</button>
                <button className="btn btn--secondary btn--sm" disabled={!pre} title="Fill the reference's height" onClick={() => fit("height")}>Height</button>
                <button className="btn btn--secondary btn--sm" disabled={!pre} title={stretch ? "Fill the reference's width and height" : "As big as fits the reference both ways"} onClick={() => fit("both")}>Both</button>
              </div>
              <div className="quickview__fit-opts">
                <button className={`flag${stretch ? " is-on" : ""}`} aria-pressed={stretch} onClick={() => setStretch(!stretch)}
                  title={stretch ? "Stretching: width and height change separately" : "Keeping the aspect ratio"}>Stretch</button>
              </div>
              <div className="quickview__align">
                {ALIGNS.map((a) => (
                  <button key={a.value} className="btn btn--secondary dpad__btn" disabled={!pre} aria-label={`Align ${a.label.toLowerCase()}`} title={a.label} onClick={() => align(a.value)}>{a.glyph}</button>
                ))}
              </div>
            </Section>

            <Section id="steps" title="Steps">
              <div className="pills">
                {STEPS.map((s) => (
                  <button key={s} className={`pill-btn${!gridSteps && p.step === s && !customStep ? " is-on" : ""}`} onClick={() => { setGridSteps(false); setCustomStep(""); p.onStep(s) }}>{s}</button>
                ))}
                {gridUnit && <button className={`pill-btn${gridSteps ? " is-on" : ""}`} title={`One grid cell of ${dp!.name}: ${fmtNum(gridUnit, 4)} here`} onClick={() => setGridSteps(true)}>Grid</button>}
                <input className={`input input--sm pills__custom${customStep && !gridSteps ? " is-on" : ""}`} type="number" min={0} step="any" placeholder="Custom"
                  aria-label="Custom step" value={customStep}
                  onChange={(e) => {
                    setCustomStep(e.target.value)
                    const n = Number(e.target.value)
                    if (e.target.value && Number.isFinite(n) && n > 0) { setGridSteps(false); p.onStep(n) }
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }} />
              </div>
              <p className="text-3 quickview__note">
                {gridSteps && gridUnit ? "Moves and scales by one grid cell. " : `In viewBox units (${vb ? `${fmtNum(vb.w, 2)} × ${fmtNum(vb.h, 2)}` : "unknown"}). `}
                Scale steps grow the artwork's longest side.
              </p>
              <div className="pills">
                {TURNS.map((s) => (
                  <button key={s} className={`pill-btn${turnStep === s && !customTurn ? " is-on" : ""}`} onClick={() => { setCustomTurn(""); setTurnStep(s) }}>{s}°</button>
                ))}
                <input className={`input input--sm pills__custom${customTurn ? " is-on" : ""}`} type="number" min={0} step="any" placeholder="Custom °"
                  aria-label="Custom turn step" value={customTurn}
                  onChange={(e) => {
                    setCustomTurn(e.target.value)
                    const n = Number(e.target.value)
                    if (e.target.value && Number.isFinite(n) && n > 0) setTurnStep(n)
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }} />
              </div>
            </Section>

            <Section id="file" title="This file">
              <div className="quickview__values">
                <Value label="X" value={mine.x} onSet={(x) => change((a) => ({ ...a, x }), "type:x")} />
                <Value label="Y" value={mine.y} onSet={(y) => change((a) => ({ ...a, y }), "type:y")} />
                <Value label={ms.X === ms.Y ? "Scale ×" : "Scale × (W)"} value={ms.X} min={0.0001}
                  onSet={(X) => change((a) => { const s0 = scalesOf(a); const k = X / s0.X; return aroundPoint(a, [k, 0, 0, k], pivotPoint(a), vb!) }, "type:scale")} />
              </div>
              {ms.X !== ms.Y && <p className="text-3 quickview__note">Stretched: ×{fmtNum(ms.X, 4)} across, ×{fmtNum(ms.Y, 4)} down. Fit with Stretch off, or Reset, to bring back the aspect ratio.</p>}
              <div className="quickview__actions">
                <button className="btn btn--ghost btn--sm" title="Undo (⌘Z)" disabled={!history.undo.length} onClick={() => travel(true)}><IconUndo /> Undo</button>
                <button className="btn btn--ghost btn--sm" title="Redo (⇧⌘Z)" disabled={!history.redo.length} onClick={() => travel(false)}><IconRedo /> Redo</button>
                <button className="btn btn--ghost btn--sm" title="Back to where the preset puts it" disabled={!hasPlacement} onClick={reset}><IconReset /> Reset</button>
              </div>
              <div className="quickview__actions">
                <button className="btn btn--ghost btn--sm" disabled={!previous} onClick={copyPrevious}
                  title={previous ? `Use ${previous.name}'s placement` : "This is the first file"}>Copy from previous</button>
                <button className="btn btn--ghost btn--sm" title="Copy this file's placement as JSON (⌘C)" onClick={copyText}><IconCopy /> Copy</button>
                <button className="btn btn--ghost btn--sm" title="Paste a placement (⌘V)" onClick={pasteFromClipboard}>Paste</button>
              </div>
              <button className="btn btn--secondary btn--sm quickview__apply" disabled={p.items.length < 2} onClick={applyToAll}
                title={p.selectionScope ? "Give every selected file this placement" : "Give every file in the list this placement"}>
                {p.selectionScope ? "Apply to all selected" : "Apply to all"} <span className="count">{p.items.length}</span>
              </button>
            </Section>

            {(notes.length > 0 || !isIdentity(base)) && (
              <Section id="preset" title="From the preset" badge={hasPlacement ? "Runs first" : undefined}>
                <ul className="quickview__notes text-3">
                  {notes.map((n) => <li key={n}>{n}</li>)}
                  {!isIdentity(base) && <li>{dp?.name ?? "The design principle"} variation: ×{fmtNum(base.scale, 4)}, moved {fmtNum(base.x, 3)}, {fmtNum(base.y, 3)}</li>}
                </ul>
                <p className="text-3 quickview__note">These all run before Quick Edit. Your placement here is applied last, in the finished canvas, so the preset can't move it again. Reset goes back to where the preset puts it.</p>
              </Section>
            )}

            <Section id="keys" title="Shortcuts">
              <dl className="quickview__keys text-3">
                <dt><kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd></dt><dd>Move (or numpad 4 8 6 2)</dd>
                <dt><kbd>+</kbd> <kbd>−</kbd></dt><dd>Bigger and smaller</dd>
                <dt><kbd>[</kbd> <kbd>]</kbd></dt><dd>Turn left and right</dd>
                <dt><kbd>⇧</kbd></dt><dd>With any of those, 10 × the step</dd>
                <dt><kbd>V</kbd> <kbd>O</kbd></dt><dd>Drag to move, drag to rotate</dd>
                <dt>Drag <kbd>⇧</kbd></dt><dd>Move along one axis</dd>
                <dt>Drag <kbd>⌥</kbd></dt><dd>No snapping</dd>
                <dt><kbd>Q</kbd> <kbd>W</kbd></dt><dd>Previous and next file</dd>
                <dt><kbd>R</kbd></dt><dd>Reset this file</dd>
                <dt>Hold <kbd>E</kbd></dt><dd>See it before Quick Edit</dd>
                <dt>Hold <kbd>T</kbd></dt><dd>Hide the overlay</dd>
                <dt><kbd>⌘Z</kbd> <kbd>⇧⌘Z</kbd></dt><dd>Undo and redo</dd>
                <dt><kbd>⌘C</kbd> <kbd>⌘V</kbd></dt><dd>Copy and paste the placement</dd>
                <dt><kbd>Esc</kbd></dt><dd>Close</dd>
              </dl>
            </Section>
          </aside>
        </div>
      </div>
    </div>
  )
}

function IconRotate() {
  return (
    <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 8a5 5 0 1 1-1.5-3.6" /><path d="M11.8 1.8v2.8H9" />
    </svg>
  )
}

// ── Sidebar sections ──────────────────────────────────────────────────────────
// Each opens and closes with a short slide, and remembers how it was left.

const SECTIONS_KEY = "svgenius:quickedit:sections"
const readSections = (): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? "{}") } catch { return {} } }

function Section({ id, title, badge, children }: { id: string, title: string, badge?: string, children: ReactNode }) {
  const [open, setOpen] = useState(() => readSections()[id] ?? true)
  const toggle = () => {
    const next = !open
    setOpen(next)
    try { localStorage.setItem(SECTIONS_KEY, JSON.stringify({ ...readSections(), [id]: next })) } catch { /* unavailable */ }
  }
  return (
    <section className={`quickview__group${open ? " is-open" : ""}`}>
      <button className="quickview__group-head" aria-expanded={open} aria-controls={`qe-${id}`} onClick={toggle}>
        <span className="panel__label">{title}</span>
        {badge && <span className="quickview__badge">{badge}</span>}
        <IconChevronDown width={12} height={12} className="quickview__chevron" />
      </button>
      <div className="quickview__group-body" id={`qe-${id}`} inert={!open}>
        <div className="quickview__group-inner">{children}</div>
      </div>
    </section>
  )
}

/** A number that applies as you type, and tidies up on Enter or blur */
function Value({ label, value, onSet, min = -1e6, inline }: { label: string, value: number, onSet: (n: number) => void, min?: number, inline?: boolean }) {
  const [text, setText] = useState<string | null>(null)
  const apply = (t: string) => {
    const n = Number(t)
    if (t.trim() !== "" && Number.isFinite(n) && n >= min) onSet(n)
  }
  return (
    <label className={`quickview__value${inline ? " is-inline" : ""}`}>
      <span className="text-3">{label}</span>
      <input className="input input--sm" type="number" step="any" value={text ?? String(+value.toFixed(4))}
        onChange={(e) => { setText(e.target.value); apply(e.target.value) }} onBlur={() => setText(null)}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }} />
    </label>
  )
}
