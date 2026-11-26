import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { EditorTabs } from "./EditorTabs"
import { IconGridLines, IconKeylines, IconEye, IconEyeOff, IconLock, IconUnlock, IconChevronDown, IconChevronLeft, IconChevronRight, IconZoomIn, IconZoomOut, IconBreakApart, IconDuplicate, IconGroup, IconStrokeToPath, IconToPath, IconTrash, IconUngroup, IconArrowHollow, IconArrowSolid, IconCopy, IconPanelBottom, IconPanelRight, IconRedo, IconReset, IconUndo, IconX } from "../icons"
import { ShapeIcon, ShapeOptions, useGuideShape } from "./ShapeGuide"
import { SnapTools, useSnap } from "./SnapTools"
import { GUIDE_SHAPES, type GuideShape } from "@marknotton/svgenius-core/shapes"
import { Resizer } from "./Resizer"
import { elementRanges, rangeAt } from "@marknotton/svgenius-core/markupMap"
import { moveElement, pasteAfter, removeElement, setAttr, setAttrs, translateAttrs, type DropPlace } from "@marknotton/svgenius-core/markupEdit"
import { parsePath, serialisePath, type PointRef, type Seg } from "@marknotton/svgenius-core/pathData"
import { addPointAfter, convertPoints, deletePoints, SEG_TYPES, setPointsCase, toggleCorner, transformPath } from "@marknotton/svgenius-core/pathPoints"
import { ACTIONS, topLevel, type ActionContext, type EditorAction } from "@marknotton/svgenius-core/editorActions"
import { ContextMenu, type MenuItem, type MenuState } from "./ContextMenu"
import { textFocus, useCommands } from "../lib/commands"
import type { Backdrop, DesignPrinciple, SvgItem } from "@marknotton/svgenius-core/types"
import { CodeEditor } from "./CodeEditor"
import { adapter } from "../host"
import { CanvasBackground } from "./CanvasBackground"
import { ArrangeTools } from "./ArrangePanel"
import { dpAreas, dpToViewBox } from "@marknotton/svgenius-core/designPrinciples"
import { alignTarget } from "@marknotton/svgenius-core/arrange"
import { parseViewBox } from "@marknotton/svgenius-core/svgRoot"
import { PaintTools } from "./PaintTools"
import { applyGradient, applyPaint, readPaint, type Gradient } from "@marknotton/svgenius-core/paint"
import { InspectPreview, type ElementMove, type ElementTransform } from "./InspectPreview"
import { LayersTree } from "./LayersTree"
import vectorcraftIcon from "../assets/vectorcraft.png"
import { PathPanel } from "./PathPanel"

/** Elements in tree order, the numbering everything here shares */
function parseElements(markup: string) {
  if (!markup) return null
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml")
  const root = doc.documentElement
  if (root.localName !== "svg" || doc.querySelector("parsererror")) return null
  return [root, ...root.querySelectorAll("*")]
}

// ── Big markup editor, with an element picker ─────────────────────────────────
// Edits go straight to the file, same as the sidebar editor, so closing keeps
// everything.

export type MarkupTab = "source" | "output"

interface Props {
  item: SvgItem
  tab: MarkupTab
  onTab: (t: MarkupTab) => void
  backdrop: Backdrop
  /** Where the editor's tools sit: a full-width row on top, or a column down the left */
  toolbarSide?: "top" | "left"
  onEdit: (source: string) => void
  onRevert: () => void
  onClose: () => void
  /** Previous and next file in the list, and where this one sits */
  nav?: { pos: number, total: number, go: (step: 1 | -1) => void }
  /** The circle guide and clip, shared with the list's previews */
  circle?: { on: boolean, clip: boolean, onToggle: () => void, onClip: () => void, onShape?: (shape: GuideShape) => void }
  /** Extra buttons from the host (Symbols puts its Save button here) */
  actions?: React.ReactNode
  /** Switches to Quick Edit on this file */
  onQuickEdit?: () => void
  /** The file's design principle: the checkerboard follows its grid, and its grid and keylines can be shown, snapped and aligned to */
  principle?: DesignPrinciple | null
}

// Zoom steps for + and −, and the zoom menu's presets (as real-size percentages)
const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64]
const ZOOM_PRESETS = [25, 50, 100, 200, 400, 800]

// ── Editor layout ─────────────────────────────────────────────────────────────
// Code and path tools sit on the right or along the bottom (handy for wide
// artwork). Panel sizes are in pixels and kept between sessions.

interface EditorLayout { bottom: boolean, sideW: number, sideH: number, toolsH: number, toolsW: number, layersW: number }
const LAYOUT_DEFAULTS: EditorLayout = { bottom: false, sideW: 520, sideH: 300, toolsH: 240, toolsW: 420, layersW: 210 }
const LAYOUT_KEY = "svgenius:editor-layout"

function useEditorLayout() {
  const [layout, setLayout] = useState<EditorLayout>(() => {
    try { return { ...LAYOUT_DEFAULTS, ...JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? "{}") } } catch { return LAYOUT_DEFAULTS }
  })
  useEffect(() => { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)) } catch { /* unavailable */ } }, [layout])
  const set = useCallback((p: Partial<EditorLayout>) => setLayout((l) => ({ ...l, ...p })), [])
  return [layout, set] as const
}

/** Icons for the editor toolbar's actions; anything without one shows its name */
const TOOLBAR_ICONS: Record<string, React.ReactNode> = {
  duplicate: <IconDuplicate width={14} height={14} />, delete: <IconTrash width={14} height={14} />,
  group: <IconGroup width={14} height={14} />, ungroup: <IconUngroup width={14} height={14} />,
  breakApart: <IconBreakApart width={14} height={14} />, toPath: <IconToPath width={14} height={14} />,
  strokeToPath: <IconStrokeToPath width={14} height={14} />
}

/** Why a toolbar action is greyed out when something is selected */
const WHY_OFF: Record<string, string> = {
  group: "Select the items to group",
  ungroup: "Select a group to ungroup it",
  breakApart: "Select a path made of more than one shape",
  toPath: "Select a rect, circle, ellipse, line, polyline or polygon",
  strokeToPath: "Select a path or shape with a stroke"
}

// ── Layer locks ───────────────────────────────────────────────────────────────
// A lock remembers the element's opening tag (which can't change while it's
// locked) and roughly where it was, so it survives edits that renumber things.
// Kept per file for this visit, and never written into the markup.
interface LockRef { tag: string, near: number }
const LOCKS = new Map<string, LockRef[]>()
/** Layers hidden in the editor, kept the same way. The file isn't changed */
const HIDES = new Map<string, LockRef[]>()

export function MarkupDialog({ item, tab, onTab, backdrop, toolbarSide = "top", onEdit, onRevert, onClose, nav, circle, actions: hostActions, onQuickEdit, principle }: Props) {
  // Switching files paints an empty editor first, then fills it in on the next
  // frame, so the arrows feel instant even when a big file takes a moment
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let b = 0
    const a = requestAnimationFrame(() => { b = requestAnimationFrame(() => setReady(true)) })
    return () => { cancelAnimationFrame(a); cancelAnimationFrame(b) }
  }, [])
  const markup = ready ? (tab === "source" ? item.source : item.result?.output) ?? "" : ""
  const [layout, setLayout] = useEditorLayout()
  const bodyRef = useRef<HTMLDivElement>(null)
  // Panels can grow until the canvas is down to about a quarter of the space
  const room = (axis: "w" | "h") => {
    const r = bodyRef.current?.getBoundingClientRect()
    return Math.max(240, ((axis === "w" ? r?.width : r?.height) ?? 800) * 0.75)
  }
  const ranges = useMemo(() => elementRanges(markup), [markup])
  // Several elements can be selected; path tools show when it's just one path
  const [selection, setSelection] = useState<number[]>([])
  const selected = selection.length === 1 ? selection[0] : -1
  const setSelected = (i: number) => setSelection(i >= 0 ? [i] : [])
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [locks, setLocks] = useState<LockRef[]>(() => LOCKS.get(item.id) ?? [])
  useEffect(() => { LOCKS.set(item.id, locks) }, [item.id, locks])
  const [hides, setHides] = useState<LockRef[]>(() => HIDES.get(item.id) ?? [])
  useEffect(() => { HIDES.set(item.id, hides) }, [item.id, hides])
  // The VectorCraft note, until it's dismissed on this device
  const [nodDismissed, setNodDismissed] = useState(() => { try { return localStorage.getItem("svgenius:nod-dismissed") === "1" } catch { return false } })
  const dismissNod = () => { setNodDismissed(true); try { localStorage.setItem("svgenius:nod-dismissed", "1") } catch { /* unavailable */ } }
  // Select (black arrow) works on whole elements, Direct select (white arrow) on a path's points
  const [tool, setToolState] = useState<"select" | "direct">(() => {
    try { return localStorage.getItem("svgenius:tool") === "select" ? "select" : "direct" } catch { return "direct" }
  })
  const setTool = useCallback((t: "select" | "direct") => {
    setToolState(t)
    try { localStorage.setItem("svgenius:tool", t) } catch { /* unavailable */ }
  }, [])
  // Zoom: 1 fits the canvas in the view; `actual` is the zoom that shows it at its real size
  const [zoom, setZoom] = useState(1)
  const [actual, setActual] = useState(1)
  const zoomRef = useRef({ zoom, actual })
  zoomRef.current = { zoom, actual }
  const stepZoom = (dir: 1 | -1) => {
    const { zoom: z } = zoomRef.current
    const next = dir > 0 ? ZOOM_STEPS.find((s) => s > z * 1.001) : [...ZOOM_STEPS].reverse().find((s) => s < z / 1.001)
    if (next) setZoom(next)
  }
  // Hold C to peek at the optimised result, let go to come back
  const [peek, setPeek] = useState(false)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "c" || e.metaKey || e.ctrlKey || e.altKey || textFocus()) return
      e.preventDefault()
      if (!e.repeat) setPeek(true)
    }
    const up = (e: KeyboardEvent) => { if (e.key.toLowerCase() === "c") setPeek(false) }
    const off = () => setPeek(false)
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    window.addEventListener("blur", off)
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", off) }
  }, [])
  const peekMarkup = peek && tab === "source" ? item.result?.output ?? null : null
  const [note, setNote] = useState("")
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(""), 5000); return () => clearTimeout(t) }, [note])
  const [hover, setHover] = useState(-1)
  const [reveal, setReveal] = useState<{ start: number, end: number, n: number, focus?: boolean } | null>(null)
  const [copied, setCopied] = useState(false)
  const edited = item.fileSource !== undefined && item.source !== item.fileSource

  // Esc closes, unless Monaco is using it (find box, suggestions)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      if ((e.target as Element | null)?.closest?.(".monaco-editor")) return
      // A right-click menu closes first, then the selection goes
      if (document.querySelector(".context-menu")) return
      if (selRef.current.length) { setSelection([]); return }
      onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  const selRef = useRef(selection)
  selRef.current = selection

  // A new tab or a hand edit changes what the element numbers point at. Edits
  // made here (dragging points, deleting) keep track themselves
  const own = useRef(false)
  useEffect(() => { setSelected(-1); setHover(-1) }, [tab])
  useEffect(() => {
    if (own.current) { own.current = false; return }
    setSelected(-1)
    setHover(-1)
  }, [markup])
  const commit = (next: string) => {
    if (next === markup) return
    own.current = true
    // What was selected before this edit, so undo can put it back
    hist.current.sel = selRef.current
    onEdit(next)
  }

  // ── Undo and redo ─────────────────────────────────────────────────────────
  // One history for every kind of edit here: typing, dragging points,
  // nudging, layers. Quick runs of changes (typing, arrow nudges) are grouped.
  // Each step remembers what was selected, so undo and redo bring it back
  // (after a Pathfinder or group, say, the shapes are selected again)
  interface Step { m: string, sel: number[] }
  const source = item.source ?? ""
  const hist = useRef({ past: [] as Step[], future: [] as Step[], prev: source, at: 0, restoring: false, sel: null as number[] | null })
  const [, setHistTick] = useState(0)
  useEffect(() => {
    const h = hist.current
    if (source === h.prev) return
    if (h.restoring) h.restoring = false
    else {
      const now = Date.now()
      if (now - h.at > 600) { h.past.push({ m: h.prev, sel: h.sel ?? [] }); h.at = now }
      if (h.past.length > 300) h.past.shift()
      h.future = []
    }
    h.sel = null
    h.prev = source
    setHistTick((n) => n + 1)
  }, [source])
  const travel = (back: boolean) => {
    const h = hist.current
    const to = back ? h.past.pop() : h.future.pop()
    if (to === undefined) return
    ;(back ? h.future : h.past).push({ m: source, sel: selRef.current })
    h.restoring = true
    h.at = 0
    if (tab === "source") {
      // The selection belongs to that exact markup, so it lines up
      own.current = true
      const count = elementRanges(to.m).length
      setSelection(to.sel.filter((k) => k > 0 && k < count))
    }
    onEdit(to.m)
  }
  const travelRef = useRef(travel)
  travelRef.current = travel
  const canUndo = hist.current.past.length > 0, canRedo = hist.current.future.length > 0

  const elements = useMemo(() => parseElements(markup), [markup])
  // Each lock (or hide), matched to the element with the same opening tag nearest where it was
  const matchRefs = (refs: LockRef[]) => refs.map((l) => {
    let best = -1
    ranges.forEach((r, k) => {
      if (k > 0 && markup.slice(r.start, r.tagEnd) === l.tag && (best < 0 || Math.abs(k - l.near) < Math.abs(best - l.near))) best = k
    })
    return best
  })
  // A group's lock or hide covers what's in it
  const spread = (own: Set<number>) => {
    const out = new Set<number>()
    if (!elements || !own.size) return out
    const els = new Set([...own].map((k) => elements[k]))
    elements.forEach((el, k) => { for (let p: Element | null = el; p; p = p.parentElement) if (els.has(p)) { out.add(k); break } })
    return out
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lockAt = useMemo(() => matchRefs(locks), [locks, ranges, markup])
  const ownLocked = useMemo(() => new Set(lockAt.filter((k) => k > 0)), [lockAt])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const locked = useMemo(() => spread(ownLocked), [elements, ownLocked])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hideAt = useMemo(() => matchRefs(hides), [hides, ranges, markup])
  const ownHidden = useMemo(() => new Set(hideAt.filter((k) => k > 0)), [hideAt])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hidden = useMemo(() => spread(ownHidden), [elements, ownHidden])
  const toggleRef = (at: number[], set: React.Dispatch<React.SetStateAction<LockRef[]>>, k: number) => {
    const n = at.indexOf(k)
    if (n >= 0) { set((l) => l.filter((_, x) => x !== n)); return }
    const r = ranges[k]
    if (r && k > 0) set((l) => [...l, { tag: markup.slice(r.start, r.tagEnd), near: k }])
  }
  const toggleLock = (k: number) => toggleRef(lockAt, setLocks, k)
  const toggleHide = (k: number) => toggleRef(hideAt, setHides, k)
  // Locked and hidden things can't be in the selection, however they got there
  useEffect(() => {
    if (selection.some((k) => locked.has(k) || hidden.has(k))) setSelection((s) => s.filter((k) => !locked.has(k) && !hidden.has(k)))
  }, [selection, locked, hidden])
  const editable = tab === "source"
  const el = selected >= 0 ? elements?.[selected] : undefined
  const [active, setActive] = useState(-1)
  useEffect(() => setActive(-1), [selected])

  const path = useMemo((): { segs: Seg[] } | { error: string } | null => {
    if (el?.localName !== "path") return null
    try { return { segs: parsePath(el.getAttribute("d") ?? "") } } catch (e) { return { error: (e as Error).message } }
  }, [el])
  const segs = path && "segs" in path ? path.segs : null

  const writePath = useCallback((next: Seg[]) => {
    const r = ranges[selected]
    if (r) commit(setAttr(markup, r, "d", serialisePath(next)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranges, selected, markup])

  // ── Direct select across paths ────────────────────────────────────────────
  // A box that catches points in several paths keeps them all picked, so they
  // move together. One path's worth opens that path with those points picked
  const [multiPicked, setMultiPicked] = useState<Map<number, PointRef[]> | null>(null)
  const [pointSeed, setPointSeed] = useState<{ index: number, points: PointRef[], n: number } | null>(null)
  const pointPick = (found: Map<number, PointRef[]>, add: boolean) => {
    let next = found
    if (add && multiPicked) {
      next = new Map(multiPicked)
      for (const [i, refs] of found) {
        const have = new Set((next.get(i) ?? []).map((p) => `${p.seg}:${p.kind}`))
        next.set(i, [...(next.get(i) ?? []), ...refs.filter((p) => !have.has(`${p.seg}:${p.kind}`))])
      }
    }
    if (next.size === 0) { if (!add) { setMultiPicked(null); setSelection([]) } return }
    if (next.size === 1) {
      const [[i, points]] = [...next]
      setMultiPicked(null)
      setSelected(i)
      setPointSeed({ index: i, points, n: Date.now() })
      return
    }
    setSelection([...next.keys()].sort((a, b) => a - b))
    setMultiPicked(next)
  }
  // Only while the selection is still those paths
  const multiOn = !!multiPicked && tool === "direct" && selection.length === multiPicked.size && selection.every((i) => multiPicked.has(i))
  useEffect(() => { if (multiPicked && !multiOn) setMultiPicked(null) }, [multiOn, multiPicked])
  const writePaths = (changes: { index: number, segs: Seg[] }[]) => {
    // Last in the file first, so the earlier ranges still line up
    let next = markup
    for (const c of [...changes].sort((a, b) => (ranges[b.index]?.start ?? 0) - (ranges[a.index]?.start ?? 0))) {
      const r = ranges[c.index]
      if (r) next = setAttr(next, r, "d", serialisePath(c.segs))
    }
    if (next !== markup) commit(next)
  }

  // Selects whatever now starts at `start` in the new markup
  const commitAndSelect = (next: { markup: string, start: number } | null) => {
    if (!next) return
    commit(next.markup)
    const i = elementRanges(next.markup).findIndex((r) => r.start === next.start)
    setSelected(i)
    setHover(-1)
  }

  // ── Actions on the selection ──────────────────────────────────────────────
  // A design principle's live area and keylines to align to, in this file's viewBox units
  const areas = useMemo(() => (principle ? dpAreas(principle) : []), [principle])
  const alignArea = () => {
    const a = areas.find((x) => x.id === alignTarget.get())
    const root = elements?.[0]
    if (!a || !principle || !root) return null
    const vb = parseViewBox(root.getAttribute("viewBox"))
      ?? { x: 0, y: 0, w: Number.parseFloat(root.getAttribute("width") ?? "") || 0, h: Number.parseFloat(root.getAttribute("height") ?? "") || 0 }
    if (!(vb.w > 0 && vb.h > 0)) return null
    const f = dpToViewBox(principle, vb)
    return { x: f.x(a.x), y: f.y(a.y), w: a.w * f.k, h: a.h * f.k }
  }
  const ctx = (): ActionContext | null => elements && editable
    ? { markup, ranges, elements, selection: topLevel(selection, elements), alignArea: alignArea() }
    : null
  const available = (pick = selection) => {
    if (!elements || !editable) return []
    const c = { markup, ranges, elements, selection: topLevel(pick, elements) }
    return ACTIONS.filter((a) => a.applies(c))
  }
  const run = async (action: EditorAction, c = ctx()) => {
    if (!c) return
    try {
      const out = await action.run(c)
      if (!out) return
      if ("error" in out) { setNote(out.error); return }
      commit(out.markup)
      if (out.select) setSelection(out.select)
      setHover(-1)
      if (out.note) setNote(out.note)
    } catch (e) {
      setNote((e as Error).message)
    }
  }
  const runRef = useRef({ run, ctx, available })
  runRef.current = { run, ctx, available }

  /** Moves elements by (dx, dy) in their parents' units */
  const moveBy = (moves: ElementMove[]) => {
    if (!elements || !editable) return
    let next = markup
    // Back to front, so earlier offsets stay put
    for (const m of [...moves].sort((a, b) => b.index - a.index)) {
      const r = elementRanges(next)[m.index], el = elements[m.index]
      if (r && el && m.index > 0) next = setAttrs(next, r, translateAttrs(el, m.dx, m.dy))
    }
    commit(next)
  }
  // Scale and rotate from the transform box. A plain path takes it into its
  // own points; anything else gets a matrix in front of its transform
  const transformBy = (changes: ElementTransform[]) => {
    if (!elements || !editable) return
    const n6 = (x: number) => String(Math.round(x * 1e6) / 1e6)
    let next = markup
    for (const c of [...changes].sort((a, b) => b.index - a.index)) {
      const r = elementRanges(next)[c.index], el = elements[c.index]
      if (!r || !el || c.index === 0) continue
      const tf = el.getAttribute("transform")
      if (el.localName === "path" && !tf) {
        try {
          const baked = transformPath(parsePath(el.getAttribute("d") ?? ""), c.m)
          if (baked) { next = setAttr(next, r, "d", serialisePath(baked)); continue }
        } catch { /* falls through to a transform */ }
      }
      const m = c.m
      next = setAttr(next, r, "transform", `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(n6).join(" ")})${tf ? ` ${tf.trim()}` : ""}`)
    }
    commit(next)
  }

  // ── Fill and stroke ───────────────────────────────────────────────────────
  // For the top-level selected items; values come from the first of them
  const painted = elements && editable ? topLevel(selection, elements).filter((i) => i > 0) : []
  const paint = painted.length && elements ? readPaint(elements[painted[0]]) : null
  const differs = (name: "fill" | "stroke") => !!elements && painted.some((i) => readPaint(elements[i])[name] !== paint?.[name])
  const setPaint = (patch: Record<string, string | null>) => {
    if (elements && painted.length) commit(applyPaint(markup, elements, painted, patch))
  }
  const setGradient = (g: Gradient) => {
    if (!elements || !painted.length) return
    const out = applyGradient(markup, elements, painted, g, paint?.gradientId ?? null)
    commit(out.markup)
    // Adding the gradient can renumber things; keep the same items selected
    setSelection(out.select)
  }

  // Snapping while dragging, remembered on this device
  const snapping = useSnap()
  const guideShape = useGuideShape()
  const shapeName = (GUIDE_SHAPES.find((x) => x.value === guideShape)?.label ?? "Circle").toLowerCase()
  // The design principle's grid and keylines over the canvas. Shown ones are snapped to as well
  const [dpGrid, setDpGridState] = useState(() => { try { return localStorage.getItem("svgenius:editor-dp-grid") !== "0" } catch { return true } })
  const [dpKeylines, setDpKeylinesState] = useState(() => { try { return localStorage.getItem("svgenius:editor-dp-keylines") !== "0" } catch { return true } })
  const setDpGrid = (v: boolean) => { setDpGridState(v); try { localStorage.setItem("svgenius:editor-dp-grid", v ? "1" : "0") } catch { /* unavailable */ } }
  const setDpKeylines = (v: boolean) => { setDpKeylinesState(v); try { localStorage.setItem("svgenius:editor-dp-keylines", v ? "1" : "0") } catch { /* unavailable */ } }

  // Right-click on points: change their type, add or remove points
  const pointMenu = (points: PointRef[], e: React.MouseEvent) => {
    if (!segs || !editable) return
    const n = points.length
    const what = n > 1 ? `${n} points` : "point"
    const run = (f: (s: Seg[]) => Seg[]) => () => writePath(f(segs))
    const curved = points.some((p) => /[CcSsQqTt]/.test(segs[p.seg]?.c ?? "") || /[CcSsQqTt]/.test(segs[p.seg + 1]?.c ?? ""))
    const allRel = points.every((p) => segs[p.seg] && segs[p.seg].c >= "a")
    setMenu({
      x: e.clientX, y: e.clientY,
      items: [
        // Say how many points this will touch, so a big selection is no surprise
        ...(n > 1 ? [{ label: `${n} points selected`, disabled: true, run: () => {} }, "-" as const] : []),
        { label: `${curved ? "Make corner" : "Make smooth"} (⌥-click)`, run: run((s) => toggleCorner(s, points)) },
        "-",
        ...SEG_TYPES.filter((t) => t.type !== "T").map((t) => ({ label: `Convert ${what} to ${t.label.toLowerCase()} (${t.type})`, run: run((s) => convertPoints(s, points, t.type)) })),
        "-",
        { label: "Add a point after this one", run: run((s) => addPointAfter(s, Math.max(...points.map((p) => p.seg)))), disabled: n > 1 },
        { label: allRel ? `Make ${what} absolute` : `Make ${what} relative`, run: run((s) => setPointsCase(s, points, !allRel)) },
        "-",
        { label: `Delete ${what}`, danger: true, run: run((s) => deletePoints(s, points)) }
      ]
    })
  }

  const moveRef = useRef(moveBy)
  moveRef.current = moveBy
  const stepZoomRef = useRef(stepZoom)
  stepZoomRef.current = stepZoom
  const zoomMenu = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect()
    setMenu({
      x: r.left, y: r.bottom + 4,
      items: [
        { label: "Zoom in    ⌘+", run: () => stepZoom(1) },
        { label: "Zoom out    ⌘−", run: () => stepZoom(-1) },
        "-",
        { label: `${Math.abs(zoom - 1) < 1e-3 ? "✓ " : ""}Fit to screen    ⌘0`, run: () => setZoom(1) },
        ...ZOOM_PRESETS.map((pc) => ({ label: `${Math.abs(zoom / actual * 100 - pc) < 0.5 ? "✓ " : ""}${pc}%${pc === 100 ? " (actual size)    ⌘1" : ""}`, run: () => setZoom(actual * pc / 100) }))
      ]
    })
  }

  // ⌘-shortcuts arrive as commands (the desktop menu sends them, the browser
  // turns key presses into them). One undo history here, even in Monaco
  useCommands((cmd) => {
    if (cmd === "undo" || cmd === "redo") { travelRef.current(cmd === "undo"); return true }
    // Zoom is the canvas's, wherever the focus is
    if (cmd === "zoomIn" || cmd === "zoomOut") { stepZoomRef.current(cmd === "zoomIn" ? 1 : -1); return true }
    if (cmd === "zoomFit") { setZoom(1); return true }
    if (cmd === "zoomActual") { setZoom(zoomRef.current.actual); return true }
    const focus = textFocus()
    if (focus) return false
    const c = runRef.current.ctx()
    if (!c) return false
    if (cmd === "selectAll") {
      setSelection(c.elements.map((el, i) => (i > 0 && /^(path|rect|circle|ellipse|line|polyline|polygon|text|image|use)$/.test(el.localName) && !el.closest("defs, clipPath, mask, symbol, marker, pattern") ? i : -1)).filter((i) => i > 0))
      return true
    }
    const action = ACTIONS.find((a) => a.command === cmd)
    if (action && action.applies(c)) runRef.current.run(action, c)
    // Taken either way, so ⌘D doesn't fall through to Monaco or the page
    return true
  })

  // Plain keys: arrows nudge, Delete removes
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey) return
      if (textFocus()) return
      // V and A pick the tools, like most vector apps
      if (!e.altKey && (e.key === "v" || e.key === "a")) { e.preventDefault(); setTool(e.key === "v" ? "select" : "direct"); return }
      const c = runRef.current.ctx()
      if (!c) return
      const dir: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      if (dir[e.key] && c.selection.length) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1
        moveRef.current(c.selection.map((index) => ({ index, dx: dir[e.key][0] * step, dy: dir[e.key][1] * step })))
        return
      }
      const action = ACTIONS.find((a) => a.keys?.(e) && a.applies(c))
      if (!action) return
      e.preventDefault()
      runRef.current.run(action, c)
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [])

  // ── Copy, cut and paste ───────────────────────────────────────────────────
  // The clipboard's own events, so the desktop's Edit menu and the keys both
  // work. Copies are plain markup; pasting puts them straight after the
  // selection (the same parent, so they land in place) and flashes them in Layers
  const [flash, setFlash] = useState<{ indices: number[], n: number } | null>(null)
  const clipLive = useRef({ markup, ranges, elements, selection, editable, commit })
  clipLive.current = { markup, ranges, elements, selection, editable, commit }
  useEffect(() => {
    const parses = (text: string) => {
      const t = text.trim()
      if (!t.startsWith("<") || /^<\?xml|^<!doctype|^<svg[\s>]/i.test(t)) return false
      const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${t}</svg>`, "image/svg+xml")
      return !doc.querySelector("parsererror") && doc.documentElement.children.length > 0
    }
    const copied = () => {
      const c = clipLive.current
      if (!c.elements || textFocus()) return null
      const tops = topLevel(c.selection.filter((k) => k > 0), c.elements).sort((a, b) => a - b)
      return tops.length ? { tops, text: tops.map((k) => c.markup.slice(c.ranges[k].start, c.ranges[k].end)).join("\n") } : null
    }
    const copy = (e: ClipboardEvent) => {
      const got = copied()
      if (!got || !e.clipboardData) return
      e.preventDefault()
      e.clipboardData.setData("text/plain", got.text)
    }
    const cut = (e: ClipboardEvent) => {
      const c = clipLive.current
      const got = copied()
      if (!got || !e.clipboardData || !c.editable) return
      e.preventDefault()
      e.clipboardData.setData("text/plain", got.text)
      let next = c.markup
      for (const k of [...got.tops].sort((a, b) => b - a)) next = removeElement(next, elementRanges(next)[k])
      c.commit(next)
      setSelection([])
    }
    const paste = (e: ClipboardEvent) => {
      const c = clipLive.current
      if (!c.editable || textFocus() || !c.elements) return
      const text = e.clipboardData?.getData("text/plain") ?? ""
      if (!parses(text)) return
      e.preventDefault()
      const sel = c.selection.filter((k) => k > 0)
      const after = sel.length ? Math.max(...topLevel(sel, c.elements)) : -1
      // After the last selected element and everything inside it
      const out = pasteAfter(c.markup, after > 0 ? c.ranges[after] : null, c.ranges[0], text)
      c.commit(out.markup)
      const nr = elementRanges(out.markup)
      // The pasted top-level elements: inside the pasted span, not inside each other
      const inside = nr.map((r, k) => (r.start >= out.start && r.end <= out.end ? k : -1)).filter((k) => k > 0)
      const tops = inside.filter((k) => !inside.some((o) => o !== k && nr[o].start <= nr[k].start && nr[o].end >= nr[k].end))
      setSelection(tops)
      setFlash((f) => ({ indices: tops, n: (f?.n ?? 0) + 1 }))
    }
    document.addEventListener("copy", copy)
    document.addEventListener("cut", cut)
    document.addEventListener("paste", paste)
    return () => { document.removeEventListener("copy", copy); document.removeEventListener("cut", cut); document.removeEventListener("paste", paste) }
  }, [])

  const openMenu = (i: number, e: React.MouseEvent) => {
    e.preventDefault()
    if (!editable) return
    // Right-clicking outside the selection selects that one thing
    const lockItem: MenuItem = { label: ownLocked.has(i) ? "Unlock" : "Lock", run: () => toggleLock(i), disabled: !ownLocked.has(i) && locked.has(i) }
    if (locked.has(i)) { setMenu({ x: e.clientX, y: e.clientY, items: [lockItem] }); return }
    const pick = i > 0 && !selection.includes(i) ? [i] : selection
    if (pick !== selection) setSelection(pick)
    const acts = available(pick).filter((a) => !a.panel)
    if (!acts.length) return
    const c = elements ? { markup, ranges, elements, selection: topLevel(pick, elements) } : null
    const items: Array<MenuItem | "-"> = []
    let last = ""
    for (const a of acts) {
      if (last && a.group !== last) items.push("-")
      last = a.group
      items.push({ label: a.shortcut ? `${a.label}    ${a.shortcut}` : a.label, danger: a.danger, run: () => { if (c) run(a, c) } })
    }
    if (i > 0) items.push("-", lockItem, { label: ownHidden.has(i) ? "Show" : "Hide", run: () => toggleHide(i), disabled: !ownHidden.has(i) && hidden.has(i) })
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  const move = (from: number, to: number, place: DropPlace) => {
    const a = ranges[from], b = ranges[to]
    if (a && b && from > 0 && from !== to) commitAndSelect(moveElement(markup, a, b, place))
  }

  // Where Shift-click ranges start from
  const anchor = useRef(-1)
  const pick = (i: number, mode: "only" | "add" | "range" = "only") => {
    if (i < 0) { if (mode === "only") setSelection([]); return }
    if (mode === "add") setSelection((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))
    else if (mode === "range" && anchor.current >= 0) {
      const [a, b] = anchor.current < i ? [anchor.current, i] : [i, anchor.current]
      setSelection([...Array.from({ length: b - a + 1 }, (_, k) => a + k).filter((k) => k !== i && k > 0), i])
    } else setSelection([i])
    if (mode !== "range") anchor.current = i
    // Show it in the markup, without taking the keyboard away from shortcuts
    const r = ranges[i]
    if (r) setReveal((x) => ({ start: r.start, end: r.end, n: (x?.n ?? 0) + 1, focus: false }))
  }
  const last = selection.length ? selection[selection.length - 1] : -1
  const markRange = hover >= 0 ? ranges[hover] : last >= 0 ? ranges[last] : null
  const actions = available()

  // The optimised markup becomes the editable source; Revert still has the original
  const applyOptimised = () => {
    const out = item.result?.output
    if (!out) return
    onEdit(out)
    onTab("source")
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(markup); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* unavailable */ }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal markup-dialog" role="dialog" aria-modal="true" aria-label={`Markup for ${item.name}`}>
        <div className="markup-dialog__head">
          {onQuickEdit && <EditorTabs value="full" onQuick={onQuickEdit} />}
          <h2 className="modal__title markup-dialog__title" title={item.relPath}>{item.name}</h2>
          <CodeTabs value={tab} onChange={onTab} peek />
          <div className="markup-dialog__spacer" />
          {nav && nav.total > 1 && (
            <div className="file-nav" role="group" aria-label="Files">
              <span className="text-3 file-nav__pos">{nav.pos} of {nav.total}</span>
              <div className="btn-join">
                <button className="btn btn--secondary btn--sm" onClick={() => nav.go(-1)} title="Previous file" aria-label="Previous file"><IconChevronLeft width={14} height={14} /></button>
                <button className="btn btn--secondary btn--sm" onClick={() => nav.go(1)} title="Next file" aria-label="Next file"><IconChevronRight width={14} height={14} /></button>
              </div>
            </div>
          )}
          {/* The desktop app has Undo and Redo in the Edit menu, so the buttons are for the browser */}
          {!adapter().isDesktop && (
          <div className="btn-join" role="group" aria-label="History">
            <button className="btn btn--secondary btn--sm" onClick={() => travel(true)} disabled={!canUndo} title="Undo (⌘Z)" aria-label="Undo"><IconUndo width={12} height={12} /></button>
            <button className="btn btn--secondary btn--sm" onClick={() => travel(false)} disabled={!canRedo} title="Redo (⇧⌘Z)" aria-label="Redo"><IconRedo width={12} height={12} /></button>
          </div>
          )}
          {hostActions}
          {tab === "source" && edited && <button className="link" onClick={onRevert} title="Throw away edits and reload the file's markup"><IconReset width={11} height={11} /> Revert</button>}
          {tab === "output" && <button className="link" onClick={copy} disabled={!markup}><IconCopy width={11} height={11} /> {copied ? "Copied" : "Copy"}</button>}
          {tab === "output" && item.result && (
            <button className="btn btn--primary btn--sm" onClick={applyOptimised}
              title="Make the optimised markup the file's markup and carry on editing it in Before. Revert brings back the original">
              Apply optimisation
            </button>
          )}
          <div className="btn-join layout-switch" role="group" aria-label="Layout">
            <button className={`btn btn--secondary btn--sm${!layout.bottom ? " is-on" : ""}`} aria-pressed={!layout.bottom}
              onClick={() => setLayout({ bottom: false })} title="Code and path tools on the right" aria-label="Code on the right"><IconPanelRight width={13} height={13} /></button>
            <button className={`btn btn--secondary btn--sm${layout.bottom ? " is-on" : ""}`} aria-pressed={layout.bottom}
              onClick={() => setLayout({ bottom: true })} title="Code and path tools along the bottom, for wide artwork" aria-label="Code along the bottom"><IconPanelBottom width={13} height={13} /></button>
          </div>
          <button className="btn btn--icon" onClick={onClose} title="Close (Esc)" aria-label="Close"><IconX /></button>
        </div>
        {/* Tools: a full-width row on top, or a column down the left (Settings) */}
        <div className={`markup-dialog__work is-${toolbarSide}`}>
        <div className={`edit-toolbar edit-toolbar--${toolbarSide}`} role="toolbar" aria-label="Editor tools" aria-orientation={toolbarSide === "left" ? "vertical" : "horizontal"}>
          {editable && <>
            <div className="btn-join tool-switch" role="group" aria-label="Tool">
              <button className={`btn btn--secondary btn--sm${tool === "select" ? " is-on" : ""}`} aria-pressed={tool === "select"} onClick={() => setTool("select")}
                title="Select (V): pick whole elements, then drag to move, or use the box's handles to scale and rotate"><IconArrowSolid width={13} height={13} /></button>
              <button className={`btn btn--secondary btn--sm${tool === "direct" ? " is-on" : ""}`} aria-pressed={tool === "direct"} onClick={() => setTool("direct")}
                title="Direct select (A): edit a path's points. Drag a box to pick several, right-click a point for more"><IconArrowHollow width={13} height={13} /></button>
            </div>
            <span className="edit-toolbar__sep" />
            <PaintTools paint={paint} mixed={{ fill: differs("fill"), stroke: differs("stroke") }} onPaint={setPaint} onGradient={setGradient} side={toolbarSide} />
            <span className="edit-toolbar__sep" />
            <ArrangeTools all={ACTIONS.filter((a) => a.panel)} applies={(a) => actions.includes(a)} run={(a) => run(a)}
              count={selection.filter((i) => i > 0).length} onMenu={setMenu} side={toolbarSide} areas={areas} />
            <span className="edit-toolbar__sep" />
            {/* Delete goes last. A disabled button still says what it does, and why it's off */}
            {[...ACTIONS.filter((a) => a.toolbar && a.id !== "delete"), ...ACTIONS.filter((a) => a.toolbar && a.id === "delete")].map((a) => {
              const on = actions.includes(a)
              const what = `${a.label}${a.shortcut ? ` (${a.shortcut})` : ""}: ${a.hint ?? ""}`.replace(/: $/, "")
              const why = selection.some((k) => k > 0) ? WHY_OFF[a.id] ?? "It doesn't apply to what's selected" : "Select something first"
              return (
                <span key={a.id} className="tip-wrap" data-tip={on ? what : `${what}. ${why}.`}>
                  <button className={`btn btn--secondary btn--sm edit-toolbar__btn${a.danger ? " is-danger" : ""}`} onClick={() => run(a)} aria-label={a.label}
                    disabled={!on}>{TOOLBAR_ICONS[a.id] ?? a.label}</button>
                </span>
              )
            })}
            <span className="edit-toolbar__sep" />
            <SnapTools snap={snapping} side={toolbarSide} hasDp={!!principle} />
          </>}
          <span className="edit-toolbar__spacer" />
          <div className="btn-join zoom-control" role="group" aria-label="Zoom">
            <button className="btn btn--secondary btn--sm edit-toolbar__btn" onClick={() => stepZoom(-1)} title="Zoom out (⌘−). ⌘ and the wheel, or a pinch, zooms at the pointer" aria-label="Zoom out"><IconZoomOut width={14} height={14} /></button>
            <button className="btn btn--secondary btn--sm zoom-control__level" onClick={zoomMenu} title="Zoom: fit to screen (⌘0), or 100% (⌘1), which is the SVG's actual size: one unit to one screen pixel. Hold Space and drag to pan" aria-label="Zoom level">
              {zoomLabel(zoom, actual)}<IconChevronDown width={10} height={10} />
            </button>
            <button className="btn btn--secondary btn--sm edit-toolbar__btn" onClick={() => stepZoom(1)} title="Zoom in (⌘+)" aria-label="Zoom in"><IconZoomIn width={14} height={14} /></button>
          </div>
          {principle && (
            <div className="btn-join" role="group" aria-label={`${principle.name} guides`}>
              <button className={`btn btn--secondary btn--sm edit-toolbar__btn${dpGrid ? " is-on" : ""}`} aria-pressed={dpGrid} onClick={() => setDpGrid(!dpGrid)}
                title={`Grid: ${principle.name}`} aria-label="Grid"><IconGridLines width={14} height={14} /></button>
              <button className={`btn btn--secondary btn--sm edit-toolbar__btn${dpKeylines ? " is-on" : ""}`} aria-pressed={dpKeylines} onClick={() => setDpKeylines(!dpKeylines)}
                title={`Live area and keylines: ${principle.name}`} aria-label="Keylines"><IconKeylines width={14} height={14} /></button>
            </div>
          )}
          {circle && (
            <div className="btn-join" role="group" aria-label="Shape guide">
              <button className={`btn btn--secondary btn--sm edit-toolbar__btn${circle.on ? " is-on" : ""}`} aria-pressed={circle.on} onClick={circle.onToggle}
                title={`Shape guide: shows what survives a ${shapeName} crop, e.g. avatars and app icons`} aria-label="Shape guide"><ShapeIcon size={14} dashed /></button>
              <button className={`btn btn--secondary btn--sm edit-toolbar__btn${circle.clip ? " is-on" : ""}`} aria-pressed={circle.clip} onClick={circle.onClip}
                title={`Clip the preview to the ${shapeName}`} aria-label="Clip to the shape"><ShapeIcon size={14} /></button>
              {circle.onShape && (
                <select className="btn btn--secondary btn--sm shape-select edit-toolbar__shape" aria-label="Guide shape" title="The shape the guide and clip use, everywhere"
                  value={guideShape} onChange={(e) => circle.onShape?.(e.target.value as GuideShape)}>
                  <ShapeOptions />
                </select>
              )}
            </div>
          )}
          <CanvasBackground />
        </div>
        <div ref={bodyRef} className={`markup-dialog__body is-inspecting${layout.bottom ? " is-bottom" : ""}`}
          style={{ "--layers-w": `${layout.layersW}px`, "--side-w": `${layout.sideW}px`, "--side-h": `${layout.sideH}px`, "--tools-h": `${layout.toolsH}px`, "--tools-w": `${layout.toolsW}px` } as React.CSSProperties}>
          <div className="markup-dialog__layers">
            <Resizer edge="right" label="Resize the layers panel" value={layout.layersW} min={160} max={520}
              onChange={(layersW) => setLayout({ layersW })} onReset={() => setLayout({ layersW: LAYOUT_DEFAULTS.layersW })} />
            <div className="layers-head">
              <span className="panel__label">Layers</span>
              {editable && elements && elements.length > 1 && (() => {
                // Everything at the top level of the drawing: groups carry what's inside them
                const tops = elements.map((el, k) => (k > 0 && el.parentElement === elements[0] && !/^(defs|style|title|desc|metadata|script)$/.test(el.localName) ? k : -1)).filter((k) => k > 0)
                const anyHidden = ownHidden.size > 0, anyLocked = ownLocked.size > 0
                return (
                  <span className="layers-head__acts">
                    <button className="layer__act" title={anyHidden ? "Show every layer" : "Hide every layer (in the editor only)"} aria-label={anyHidden ? "Show all" : "Hide all"}
                      onClick={() => setHides(anyHidden ? [] : tops.map((k) => ({ tag: markup.slice(ranges[k].start, ranges[k].tagEnd), near: k })))}>
                      {anyHidden ? <IconEyeOff width={14} height={14} /> : <IconEye width={14} height={14} />}
                    </button>
                    <button className="layer__act" title={anyLocked ? "Unlock every layer" : "Lock every layer"} aria-label={anyLocked ? "Unlock all" : "Lock all"}
                      onClick={() => setLocks(anyLocked ? [] : tops.map((k) => ({ tag: markup.slice(ranges[k].start, ranges[k].tagEnd), near: k })))}>
                      {anyLocked ? <IconLock width={14} height={14} /> : <IconUnlock width={14} height={14} />}
                    </button>
                  </span>
                )
              })()}
            </div>
            {elements
              ? <LayersTree elements={elements} selection={selection} hover={hover}
                  onPick={pick} onSelectSet={(list) => { setSelection(list); const r = ranges[list[list.length - 1]]; if (r) setReveal((x) => ({ start: r.start, end: r.end, n: (x?.n ?? 0) + 1, focus: false })) }}
                  onHover={setHover} onMenu={openMenu}
                  onDelete={editable ? (i) => { const d = ACTIONS.find((a) => a.id === "delete"); const c = elements && { markup, ranges, elements, selection: [i] }; if (d && c) run(d, c) } : undefined}
                  onMove={editable ? move : undefined}
                  locked={locked} ownLocked={ownLocked} onLock={toggleLock}
                  hidden={hidden} ownHidden={ownHidden} onHide={toggleHide} flash={flash} />
              : ready && <p className="text-3">{markup ? "The markup doesn't parse, fix it to see the layers." : "Nothing here yet."}</p>}
          </div>
          {/* Double-click a selected item with Select to dive into its points */}
          <div className="markup-dialog__canvas" onDoubleClick={(e) => {
            if (tool !== "select" || !editable || selRef.current.length !== 1) return
            if ((e.target as HTMLElement).closest(".zoom-control, .nod, button")) return
            setTool("direct")
          }}>
            {/* Floats over the canvas, so it never pushes the preview down */}
            {editable && <EditStatus tool={tool} count={selection.length} note={note} />}
            {peekMarkup !== null && <span className="peek-badge">After</span>}
            <InspectPreview markup={peekMarkup ?? markup} backdrop={backdrop} checker={principle} dpGrid={!!principle && dpGrid} dpKeylines={!!principle && dpKeylines} selection={peekMarkup !== null ? [] : selection} locked={ownLocked} hidden={peekMarkup !== null ? undefined : ownHidden} snap={snapping.on} snapTo={snapping.opts}
              zoom={zoom} onZoom={setZoom} onActual={setActual}
              onPick={(i, add) => { (document.activeElement as HTMLElement | null)?.blur?.(); pick(i, add ? "add" : "only") }}
              onSelect={(found, add) => setSelection((s) => (add ? [...s, ...found.filter((i) => !s.includes(i))] : found))}
              onMoveBy={moveBy} onContextMenu={openMenu} readOnly={!editable || peekMarkup !== null}
              onHover={setHover} hover={hover}
              onTransform={tool === "select" && editable ? transformBy : undefined}
              path={segs && tool === "direct" && peekMarkup === null ? { index: selected, segs, readOnly: !editable, active, onActive: setActive, onCommit: writePath, onPointMenu: pointMenu, seed: pointSeed?.index === selected ? pointSeed : undefined } : null}
              onPointPick={tool === "direct" && editable && peekMarkup === null ? pointPick : undefined}
              multi={multiOn && multiPicked && peekMarkup === null ? { picked: multiPicked, readOnly: !editable, onPick: (m) => pointPick(m, false), onCommit: writePaths } : null} />
            {/* Unaffiliated pointer to a free, fuller vector editor: this one tidies markup, it isn't an art tool */}
            {!nodDismissed && (
              <p className="markup-dialog__nod">
                {/* One run of inline text, so it wraps like a sentence rather than in blocks */}
                <span className="markup-dialog__nod-text">
                  SVGenius offers a very basic SVG editor. For a richer, fuller one, use{" "}
                  <a href="https://getartcraft.com/apps/vectorcraft" target="_blank" rel="noopener"
                    title="VectorCraft: a free, fuller vector editor (we're not affiliated)">
                    <img src={vectorcraftIcon} alt="" width={14} height={14} />
                    <span className="markup-dialog__nod-mark">Vector<b>Craft</b></span>
                  </a>{" "}
                  for free.
                </span>
                <button className="btn btn--icon markup-dialog__nod-close" aria-label="Dismiss" title="Dismiss" onClick={dismissNod}><IconX width={14} height={14} /></button>
              </p>
            )}
          </div>
          <div className="markup-dialog__side">
            {layout.bottom
              ? <Resizer edge="top" label="Resize the code panel" value={layout.sideH} min={140} max={room("h")}
                  onChange={(sideH) => setLayout({ sideH })} onReset={() => setLayout({ sideH: LAYOUT_DEFAULTS.sideH })} />
              : <Resizer edge="left" label="Resize the code panel" value={layout.sideW} min={280} max={room("w")}
                  onChange={(sideW) => setLayout({ sideW })} onReset={() => setLayout({ sideW: LAYOUT_DEFAULTS.sideW })} />}
            {!ready ? <div className="markup-dialog__code markup-dialog__code--blank" /> : <CodeEditor
              key={tab}
              className="markup-dialog__code"
              label={tab === "source" ? "Source markup" : "Optimised markup"}
              value={markup}
              readOnly={tab === "output"}
              onChange={tab === "source" ? onEdit : undefined}
              reveal={reveal}
              mark={markRange ? { start: markRange.start, end: markRange.end } : null}
              selectOnClick={(offset) => {
                // Clicking an element's tag name (<path, </g>) selects all of it, ready to delete or cut
                const i = rangeAt(ranges, offset), r = ranges[i]
                if (!r || i <= 0) return null
                const name = markup.slice(r.start + 1).match(/^[\w:.-]+/)?.[0] ?? ""
                const onOpen = offset >= r.start && offset <= r.start + 1 + name.length
                const close = markup.lastIndexOf("</", r.end)
                const onClose = close > r.tagEnd && offset >= close && offset <= r.end
                return onOpen || onClose ? { start: r.start, end: r.end } : null
              }}
              onCursor={(offset) => {
                // Follow the cursor into an element, but clicking between
                // elements leaves the selection (and the path tools) alone
                const i = rangeAt(ranges, offset)
                if (i > 0 && !selRef.current.includes(i)) setSelected(i)
              }}
            />}
            {/* Always here, the same height, so selecting things doesn't shuffle the code around */}
            <div className="markup-dialog__tools">
              {layout.bottom
                ? <Resizer edge="left" label="Resize the path tools" value={layout.toolsW} min={240} max={room("w") - 200}
                    onChange={(toolsW) => setLayout({ toolsW })} onReset={() => setLayout({ toolsW: LAYOUT_DEFAULTS.toolsW })} />
                : <Resizer edge="top" label="Resize the path tools" value={layout.toolsH} min={120} max={room("h") - 120}
                    onChange={(toolsH) => setLayout({ toolsH })} onReset={() => setLayout({ toolsH: LAYOUT_DEFAULTS.toolsH })} />}
              {segs && <PathPanel segs={segs} readOnly={!editable} active={active} onActive={setActive} onChange={writePath} />}
              {path && "error" in path && <p className="rule__error">This path's data doesn't parse: {path.error}</p>}
              {el && ["rect", "circle", "ellipse", "line", "polyline", "polygon"].includes(el.localName) && (
              <div className="path-panel path-panel--shape">
                <span className="text-2">This is a <code>&lt;{el.localName}&gt;</code>. Convert it to a path to edit its points.</span>
                  {!editable && <span className="text-3">Switch to Before to convert it.</span>}
              </div>
            )}
              {!segs && !(path && "error" in path) && !(el && ["rect", "circle", "ellipse", "line", "polyline", "polygon"].includes(el.localName)) && (
                <p className="text-3 markup-dialog__tools-empty">
                  {selection.length > 1 ? `${selection.length} elements selected. Path tools show when one path is selected.` : "Select a path to see its commands and edit its points here."}
                </p>
              )}
            </div>
          </div>
        </div>
        </div>
        {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
        {tab === "output" && !item.result && <p className="text-3">Not optimised yet.</p>}
        {item.status === "error" && <p className="rule__error">{item.error}</p>}
      </div>
    </div>
  )
}

/** Before / After switch for the markup editors */
export function CodeTabs({ value, onChange, peek }: { value: MarkupTab, onChange: (t: MarkupTab) => void, peek?: boolean }) {
  return (
    <div className="code-tabs" role="tablist" aria-label="Markup">
      <button role="tab" aria-selected={value === "source"} className={value === "source" ? "is-active" : ""}
        title="The file's markup. Edit it here, your original isn't touched" onClick={() => onChange("source")}>Before</button>
      <button role="tab" aria-selected={value === "output"} className={value === "output" ? "is-active" : ""}
        title={`The optimised markup that gets exported${peek ? ". Hold C while in Before to peek at it" : ""}`} onClick={() => onChange("output")}>After</button>
    </div>
  )
}

/** What the tool does and how many things are selected, plus any note from the last action */
/** Short enough for the toolbar: 523%, then 52× past 999% */
function zoomLabel(zoom: number, actual: number) {
  if (Math.abs(zoom - 1) < 1e-3) return "Fit"
  const pc = zoom / actual * 100
  return pc >= 999.5 ? `${Math.round(pc / 100)}×` : `${Math.round(pc)}%`
}

function EditStatus({ tool, count, note }: { tool: "select" | "direct", count: number, note: string }) {
  return (
    <span className="edit-status" aria-live="polite">
      {tool === "select" ? "Select (V)" : "Direct select (A)"}
      {count ? ` · ${count} selected` : tool === "select" ? ": click, ⌘-click or drag a box" : ": click a path, then its points"}
      {note && <span className="edit-toolbar__note"> {note}</span>}
    </span>
  )
}
