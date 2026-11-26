import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { Backdrop, DesignPrinciple } from "@marknotton/svgenius-core/types"
import { svgSize } from "@marknotton/svgenius-core/svgRoot"
import { allAnchors, geometry, pointAt, pointKey, serialisePath, shiftPoints, type PointKind, type PointRef, type Seg } from "@marknotton/svgenius-core/pathData"
import { deletePoints, toggleCorner } from "@marknotton/svgenius-core/pathPoints"
import { usePreviewCss, withPreviewCss } from "./PreviewCss"
import { ShapeGuide } from "./ShapeGuide"
import { checkerSize } from "./GridGuides"

// ── Inspectable preview ───────────────────────────────────────────────────────
// Renders the SVG inline (scripts and event handlers stripped) so elements can
// be hovered and clicked, like a browser's element picker. Elements are
// numbered in tree order, which matches their order in the markup.

interface Props {
  markup: string
  backdrop: Backdrop
  /** Tree-order indices of the selected elements */
  selection: number[]
  /** A click: plain replaces the selection, add toggles the element in it */
  onPick: (index: number, add: boolean) => void
  /** A box drawn over empty canvas */
  onSelect?: (indices: number[], add: boolean) => void
  /** Elements dragged across the canvas, by (dx, dy) in each one's parent units */
  onMoveBy?: (moves: ElementMove[]) => void
  onContextMenu?: (index: number, e: React.MouseEvent) => void
  readOnly?: boolean
  onHover: (index: number) => void
  /** Hovered element, from here or from the layers list */
  hover?: number
  /** The selected path's points, drawn as draggable handles */
  path?: PathEdit | null
  /** Locked elements: clicks and boxes go straight through them */
  locked?: Set<number>
  /** Hidden in the editor only (the eye in the layers) */
  hidden?: Set<number>
  /** When set, the selection gets a box with scale and rotate handles */
  onTransform?: (changes: ElementTransform[]) => void
  /** Dragged items snap to other items' edges and centres, and to the viewBox. ⌘ while dragging skips it */
  snap?: boolean
  /** Zoom, where 1 fits the canvas in the view. ⌘ or Ctrl with the wheel (or a pinch) zooms at the pointer */
  zoom?: number
  onZoom?: (zoom: number) => void
  /** The zoom that shows the artwork at its real size (100%) */
  onActual?: (zoom: number) => void
  /** The design principle whose grid the checkerboard follows */
  checker?: DesignPrinciple | null
}

export const ZOOM_MIN = 0.1, ZOOM_MAX = 64
export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))

/** How close (screen px) an edge or centre has to come before it snaps */
const SNAP_PX = 8

export interface ElementMove { index: number, dx: number, dy: number }
/** A scale or rotate, as a matrix in the element's parent units, to go in front of its own transform */
export interface ElementTransform { index: number, m: DOMMatrix }

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rot"
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
const mat = (m: DOMMatrix) => `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`

/** Shapes a selection box picks up (not groups, not things in <defs>) */
const PICKABLE = "path, rect, circle, ellipse, line, polyline, polygon, text, image, use"
const UNPAINTED = "defs, clipPath, mask, symbol, marker, pattern"

/** The box around several boxes */
const outerBox = (rs: DOMRect[]) => rs.length ? rs.reduce((u, r) => {
  const l = Math.min(u.left, r.left), t = Math.min(u.top, r.top)
  return new DOMRect(l, t, Math.max(u.right, r.right) - l, Math.max(u.bottom, r.bottom) - t)
}) : null

/**
 * Snapping, like a drawing app. A dragged box's edges and centre pull onto
 * other items' edges and centres and the viewBox's, within SNAP_PX. Its own
 * starting lines count too, so a mostly sideways drag sticks to its row (and
 * an up-and-down one to its column) until you pull clear. Returns the snapped
 * screen distance and the guide lines to draw, in stage pixels
 */
function snapper(shadow: ShadowRoot, skip: Element[], moving: DOMRect | null, base: DOMRect) {
  const lines = { x: [] as number[], y: [] as number[] }
  if (moving) {
    const add = (r: DOMRect) => {
      if (r.width + r.height <= 0 && !(r.width === 0 && r.height === 0)) return
      lines.x.push(r.left, (r.left + r.right) / 2, r.right)
      lines.y.push(r.top, (r.top + r.bottom) / 2, r.bottom)
    }
    const svg = shadow.querySelector("svg")
    if (svg) add(svg.getBoundingClientRect())
    for (const other of shadow.querySelectorAll(PICKABLE)) {
      if (other.closest(UNPAINTED) || skip.some((x) => x === other || x.contains(other))) continue
      if (getComputedStyle(other).pointerEvents === "none" || getComputedStyle(other).display === "none") continue
      const r = other.getBoundingClientRect()
      if (r.width + r.height > 0) add(r)
    }
    add(moving)
  }
  return (dx: number, dy: number, on: boolean) => {
    const gx: number[] = [], gy: number[] = []
    if (moving && on) {
      const pull = (own: number[], to: number[], d: number, hit: number[]) => {
        let best: number | null = null
        for (const o of own) for (const t of to) {
          const diff = t - (o + d)
          if (Math.abs(diff) <= SNAP_PX && (best === null || Math.abs(diff) < Math.abs(best))) best = diff
        }
        if (best === null) return d
        const nd = d + best
        for (const o of own) for (const t of to) if (Math.abs(t - (o + nd)) < 0.5 && !hit.includes(t)) hit.push(t)
        return nd
      }
      dx = pull([moving.left, (moving.left + moving.right) / 2, moving.right], lines.x, dx, gx)
      dy = pull([moving.top, (moving.top + moving.bottom) / 2, moving.bottom], lines.y, dy, gy)
    }
    return { dx, dy, gx: gx.map((x) => x - base.x), gy: gy.map((y) => y - base.y) }
  }
}

export interface PathEdit {
  index: number
  segs: Seg[]
  readOnly: boolean
  /** Segment being pointed at, here or in the command list */
  active: number
  onActive: (index: number) => void
  /** A drag finished */
  onCommit: (segs: Seg[]) => void
  /** Right-click on a point: the points it applies to (the selection, if it's in it) */
  onPointMenu?: (points: PointRef[], e: React.MouseEvent) => void
}

/** More than this and only the outline is drawn, handles would be a carpet */
const MAX_HANDLES = 2000

const ATTR = "data-svgenius-i"

function prepare(markup: string) {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml")
  const root = doc.documentElement
  if (root.localName !== "svg" || doc.querySelector("parsererror")) return null
  const all = [root, ...root.querySelectorAll("*")]
  all.forEach((el, i) => el.setAttribute(ATTR, String(i)))
  // Nothing in the preview gets to run
  for (const el of all) {
    if (el.localName === "script" || el.localName === "foreignObject") { el.remove(); continue }
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name) || (/href$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name)
    }
  }
  root.setAttribute("width", "100%")
  root.setAttribute("height", "100%")
  return root
}

export function InspectPreview({ markup, backdrop, selection, onPick, onSelect, onMoveBy, onContextMenu, readOnly, onHover, hover = -1, path, onTransform, locked, hidden, snap = true, zoom = 1, onZoom, onActual, checker }: Props) {
  const stage = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  // Set by the path overlay when a press was a drag, not a click
  const swallowClick = useRef(false)
  const [boxes, setBoxes] = useState<{ sel: DOMRect[], hov: DOMRect | null }>({ sel: [], hov: null })
  const [marquee, setMarquee] = useState<{ x0: number, y0: number, x1: number, y1: number } | null>(null)
  const live = useRef({ selection, path, readOnly, onSelect, onMoveBy, snap })
  live.current = { selection, path, readOnly, onSelect, onMoveBy, snap }
  // While items are dragged: how far they've gone on screen, so their boxes
  // go with them, and the snap guides to draw (stage coordinates)
  const [shift, setShift] = useState<{ x: number, y: number } | null>(null)
  const [guides, setGuides] = useState<{ x: number[], y: number[] }>({ x: [], y: [] })
  const selKey = selection.join(",")
  const css = usePreviewCss()
  // Preview CSS goes in last, so element numbers still match the markup. In
  // a shadow root :root means the page, so it becomes :host, which the SVG
  // inherits from like it would from its own root
  const root = useMemo(() => prepare(withPreviewCss(markup, css.replace(/:root\b/g, ":host"))), [markup, css])
  const ratio = useMemo(() => {
    const d = svgSize(markup)
    return d && d.w > 0 && d.h > 0 ? d.w / d.h : 1
  }, [markup])

  // ── Zoom and pan ────────────────────────────────────────────────────────
  // The canvas grows past the view and scrolls. Zooming keeps whatever is under
  // the pointer (or the middle of the view) where it was
  const canvasRef = useRef<HTMLDivElement>(null)
  const zoomAt = useRef<{ fx: number, fy: number, cx: number, cy: number } | null>(null)
  const zoomLive = useRef({ zoom, onZoom })
  zoomLive.current = { zoom, onZoom }
  const realW = useMemo(() => svgSize(markup)?.w ?? 0, [markup])
  useEffect(() => {
    const host = box.current
    if (!host || !onActual) return
    const tell = () => {
      const fitW = Math.min(host.clientWidth, host.clientHeight * ratio)
      if (fitW > 0 && realW > 0) onActual(realW / fitW)
    }
    tell()
    const ro = new ResizeObserver(tell)
    ro.observe(host)
    return () => ro.disconnect()
  }, [ratio, realW, onActual])
  /** Remembers where to hold still, then asks for the new zoom */
  const zoomTo = (z: number, clientX?: number, clientY?: number) => {
    const host = box.current, c = canvasRef.current
    const { zoom: cur, onZoom: set } = zoomLive.current
    if (!host || !c || !set) return
    const next = clampZoom(z)
    if (Math.abs(next - cur) < 1e-6) return
    const h = host.getBoundingClientRect(), r = c.getBoundingClientRect()
    const cx = clientX ?? h.left + h.width / 2, cy = clientY ?? h.top + h.height / 2
    zoomAt.current = { fx: (cx - r.left) / r.width, fy: (cy - r.top) / r.height, cx, cy }
    set(next)
  }
  const zoomToRef = useRef(zoomTo)
  zoomToRef.current = zoomTo
  useLayoutEffect(() => {
    const at = zoomAt.current, host = box.current, c = canvasRef.current
    zoomAt.current = null
    if (!at || !host || !c) return
    const r = c.getBoundingClientRect()
    host.scrollLeft += r.left + at.fx * r.width - at.cx
    host.scrollTop += r.top + at.fy * r.height - at.cy
  }, [zoom])
  useEffect(() => {
    const host = box.current
    if (!host) return
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !zoomLive.current.onZoom) return
      e.preventDefault()
      // A pinch sends small steps, a mouse wheel big ones
      const step = Math.max(-0.5, Math.min(0.5, -e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025)))
      zoomToRef.current(zoomLive.current.zoom * Math.exp(step), e.clientX, e.clientY)
    }
    host.addEventListener("wheel", wheel, { passive: false })
    return () => host.removeEventListener("wheel", wheel)
  }, [])
  // Hold Space and drag to pan, like most design apps. The middle button pans too
  const [panReady, setPanReady] = useState(false)
  useEffect(() => {
    const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable=true], .monaco-editor")
    const down = (e: KeyboardEvent) => { if (e.code === "Space" && !typing(e.target)) { e.preventDefault(); setPanReady(true) } }
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setPanReady(false) }
    const blur = () => setPanReady(false)
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    window.addEventListener("blur", blur)
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur) }
  }, [])
  const panLive = useRef(panReady)
  panLive.current = panReady
  useEffect(() => {
    const host = box.current
    if (!host) return
    const down = (e: PointerEvent) => {
      if (!(e.button === 1 || (e.button === 0 && panLive.current))) return
      e.preventDefault()
      e.stopImmediatePropagation()
      const x0 = e.clientX, y0 = e.clientY, sl = host.scrollLeft, st = host.scrollTop
      host.classList.add("is-panning")
      const move = (ev: PointerEvent) => { host.scrollLeft = sl - (ev.clientX - x0); host.scrollTop = st - (ev.clientY - y0) }
      const end = () => {
        host.classList.remove("is-panning")
        swallowClick.current = true
        setTimeout(() => { swallowClick.current = false }, 0)
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", end)
      }
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", end)
    }
    // Capture, ahead of the selection and point drags
    host.addEventListener("pointerdown", down, true)
    return () => host.removeEventListener("pointerdown", down, true)
  }, [])

  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    // A shadow root keeps the SVG's own <style> from leaking into the app
    const shadow = el.shadowRoot ?? el.attachShadow({ mode: "open" })
    const base = document.createElement("style")
    base.textContent = ":host{display:block}svg{display:block;width:100%;height:100%}"
    shadow.replaceChildren(base)
    if (root) shadow.appendChild(document.importNode(root, true))
  }, [root])

  // Locked elements (and what's in them) ignore the pointer, so whatever is
  // underneath gets the click instead
  const lockKey = locked ? [...locked].sort().join(",") : ""
  const hideKey = hidden ? [...hidden].sort().join(",") : ""
  useLayoutEffect(() => {
    const shadow = stage.current?.shadowRoot
    if (!shadow) return
    let style = shadow.getElementById("svgenius-hides")
    if (!style) { style = document.createElement("style"); style.id = "svgenius-hides"; shadow.appendChild(style) }
    style.textContent = hideKey ? hideKey.split(",").map((k) => `[${ATTR}="${k}"]`).join(",") + "{display:none!important}" : ""
  }, [hideKey, root])
  useLayoutEffect(() => {
    const shadow = stage.current?.shadowRoot
    if (!shadow) return
    let style = shadow.getElementById("svgenius-locks")
    if (!style) { style = document.createElement("style"); style.id = "svgenius-locks"; shadow.appendChild(style) }
    style.textContent = lockKey ? lockKey.split(",").map((k) => `[${ATTR}="${k}"],[${ATTR}="${k}"] *`).join(",") + "{pointer-events:none}" : ""
  }, [lockKey, root])

  // Outline boxes follow the picked and hovered elements
  useEffect(() => {
    const measure = () => {
      const el = stage.current
      if (!el) return
      const base = el.getBoundingClientRect()
      const box = (i: number) => {
        if (i < 0) return null
        const t = el.shadowRoot?.querySelector(`[${ATTR}="${i}"]`)
        if (!t) return null
        const r = t.getBoundingClientRect()
        return new DOMRect(r.x - base.x, r.y - base.y, r.width, r.height)
      }
      setBoxes({ sel: selection.map(box).filter((b): b is DOMRect => !!b), hov: !selection.includes(hover) ? box(hover) : null })
      setShift(null)
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (stage.current) ro.observe(stage.current)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey, hover, root])

  // Element mode (no path's points showing): drag shapes to move them, or
  // drag over empty canvas to select everything the box touches
  useEffect(() => {
    const host = box.current
    if (!host) return
    const swallow = () => { swallowClick.current = true; setTimeout(() => { swallowClick.current = false }, 0) }
    const down = (e: PointerEvent) => {
      const cur = live.current
      if (e.button !== 0 || cur.path) return
      const shadow = stage.current?.shadowRoot
      const base = stage.current?.getBoundingClientRect()
      if (!shadow || !base) return
      const t = e.composedPath()[0] as Element | undefined
      // The transform box's handles run their own drags
      if (t?.closest?.(".xf")) return
      const hit = t?.closest?.(`[${ATTR}]`)
      const index = hit ? Number(hit.getAttribute(ATTR)) : -1
      const listen = (move: (ev: PointerEvent) => void, up: (ev: PointerEvent) => void) => {
        const end = (ev: PointerEvent) => {
          if (ev.pointerId !== e.pointerId) return
          window.removeEventListener("pointermove", mv)
          window.removeEventListener("pointerup", end)
          window.removeEventListener("pointercancel", end)
          up(ev)
        }
        const mv = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) move(ev) }
        window.addEventListener("pointermove", mv)
        window.addEventListener("pointerup", end)
        window.addEventListener("pointercancel", end)
      }

      if (index > 0) {
        // Modifier clicks add to the selection, they don't drag
        if (cur.readOnly || !cur.onMoveBy || e.shiftKey || e.metaKey || e.ctrlKey) return
        const ids = cur.selection.includes(index) ? cur.selection.filter((i) => i > 0) : [index]
        const els = ids.map((i) => shadow.querySelector(`[${ATTR}="${i}"]`) as SVGGraphicsElement | null)
        // Screen pixels → each element's parent units
        const inv = els.map((el) => {
          const m = (el?.parentNode as SVGGraphicsElement | null)?.getScreenCTM?.()
          return m ? new DOMMatrix([m.a, m.b, m.c, m.d, 0, 0]).inverse() : null
        })
        const orig = els.map((el) => el?.getAttribute("transform") ?? null)
        let moved = false

        const moving = outerBox(els.filter((x): x is SVGGraphicsElement => !!x).map((x) => x.getBoundingClientRect()))
        const snapTo = snapper(shadow, els.filter((x): x is SVGGraphicsElement => !!x), moving, base)
        const snapped = (ev: PointerEvent) =>
          snapTo(ev.clientX - e.clientX, ev.clientY - e.clientY, live.current.snap && !ev.metaKey && !ev.ctrlKey)
        const delta = (s: { dx: number, dy: number }, ev: PointerEvent, k: number) => {
          const p = new DOMPoint(s.dx, s.dy).matrixTransform(inv[k] ?? new DOMMatrix())
          return ev.shiftKey ? { x: Math.round(p.x), y: Math.round(p.y) } : { x: p.x, y: p.y }
        }
        listen((ev) => {
          if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 3) return
          if (!moved && !cur.selection.includes(index)) cur.onSelect?.([index], false)
          moved = true
          const s = snapped(ev)
          els.forEach((el, k) => {
            const d = delta(s, ev, k)
            el?.setAttribute("transform", `translate(${d.x} ${d.y})${orig[k] ? ` ${orig[k]}` : ""}`)
          })
          setShift({ x: s.dx, y: s.dy })
          setGuides({ x: s.gx, y: s.gy })
        }, (ev) => {
          setGuides({ x: [], y: [] })
          if (!moved) return
          swallow()
          const s = snapped(ev)
          live.current.onMoveBy?.(ids.map((i, k) => ({ index: i, dx: delta(s, ev, k).x, dy: delta(s, ev, k).y })))
        })
        return
      }

      // Empty canvas: a selection box
      if (!cur.onSelect) return
      const x0 = e.clientX - base.x, y0 = e.clientY - base.y
      let started = false
      let box1 = { x0, y0, x1: x0, y1: y0 }
      listen((ev) => {
        box1 = { x0, y0, x1: ev.clientX - base.x, y1: ev.clientY - base.y }
        if (!started && Math.hypot(box1.x1 - x0, box1.y1 - y0) < 4) return
        started = true
        setMarquee(box1)
      }, () => {
        setMarquee(null)
        if (!started) return
        swallow()
        const l = Math.min(box1.x0, box1.x1) + base.x, r = Math.max(box1.x0, box1.x1) + base.x
        const tp = Math.min(box1.y0, box1.y1) + base.y, b = Math.max(box1.y0, box1.y1) + base.y
        const found = [...shadow.querySelectorAll(PICKABLE)].filter((el) => {
          if (el.closest(UNPAINTED)) return false
          // Locked: pointer-events are off on it or a group it's in
          if (getComputedStyle(el).pointerEvents === "none") return false
          const q = el.getBoundingClientRect()
          return q.width + q.height > 0 && q.right >= l && q.left <= r && q.bottom >= tp && q.top <= b
        }).map((el) => Number(el.getAttribute(ATTR)))
        live.current.onSelect?.(found, e.shiftKey)
      })
    }
    host.addEventListener("pointerdown", down)
    return () => host.removeEventListener("pointerdown", down)
  }, [])

  // ── Transform box: scale from the handles, rotate from the top one ──
  // Shift keeps proportions (and snaps rotation to 15°), Alt scales from the centre
  const [xf, setXf] = useState<DOMMatrix | null>(null)
  const union = boxes.sel.length ? boxes.sel.reduce((u, b) => {
    const l = Math.min(u.x, b.x), t = Math.min(u.y, b.y)
    return new DOMRect(l, t, Math.max(u.right, b.right) - l, Math.max(u.bottom, b.bottom) - t)
  }) : null
  const startTransform = (e: React.PointerEvent, kind: Handle) => {
    if (e.button !== 0 || !union || !onTransform) return
    e.preventDefault()
    e.stopPropagation()
    const shadow = stage.current?.shadowRoot
    const base = stage.current?.getBoundingClientRect()
    if (!shadow || !base) return
    const ids = selection.filter((i) => i > 0)
    const els = ids.map((i) => shadow.querySelector(`[${ATTR}="${i}"]`) as SVGGraphicsElement | null)
    const parents = els.map((el) => {
      const c = (el?.parentNode as SVGGraphicsElement | null)?.getScreenCTM?.()
      return c ? new DOMMatrix([c.a, c.b, c.c, c.d, c.e, c.f]) : null
    })
    const orig = els.map((el) => el?.getAttribute("transform") ?? null)
    const L = union.x + base.x, T = union.y + base.y, R = L + union.width, B = T + union.height
    const cx = (L + R) / 2, cy = (T + B) / 2
    const hasX = /[ew]/.test(kind) && kind !== "rot", hasY = /[ns]/.test(kind) && kind !== "rot"
    const hx = kind.includes("w") ? L : kind.includes("e") ? R : cx
    const hy = kind.includes("n") ? T : kind.includes("s") ? B : cy
    const ax = kind.includes("w") ? R : kind.includes("e") ? L : cx
    const ay = kind.includes("n") ? B : kind.includes("s") ? T : cy
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx)
    let m = new DOMMatrix()
    let moved = false
    const inParent = (k: number) => parents[k] ? parents[k]!.inverse().multiply(m).multiply(parents[k]!) : null
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 2) return
      moved = true
      if (kind === "rot") {
        let deg = (Math.atan2(ev.clientY - cy, ev.clientX - cx) - a0) * 180 / Math.PI
        if (ev.shiftKey) deg = Math.round(deg / 15) * 15
        m = new DOMMatrix().translate(cx, cy).rotate(deg).translate(-cx, -cy)
      } else {
        const [ox, oy] = ev.altKey ? [cx, cy] : [ax, ay]
        const ratio = (p: number, h: number, o: number) => {
          const r = Math.abs(h - o) < 1e-6 ? 1 : (p - o) / (h - o)
          return Math.abs(r) < 0.01 ? (r < 0 ? -0.01 : 0.01) : r
        }
        let sx = hasX ? ratio(ev.clientX, hx, ox) : 1
        let sy = hasY ? ratio(ev.clientY, hy, oy) : 1
        if (ev.shiftKey) {
          // Same scale both ways: corners follow the larger pull, edges take the other axis along
          const u = hasX && hasY ? (Math.abs(sx) > Math.abs(sy) ? sx : sy) : hasX ? sx : sy
          sx = hasX ? u : Math.abs(u)
          sy = hasY ? u : Math.abs(u)
        }
        m = new DOMMatrix().translate(ox, oy).scale(sx, sy).translate(-ox, -oy)
      }
      els.forEach((el, k) => {
        const t = inParent(k)
        if (el && t) el.setAttribute("transform", `${mat(t)}${orig[k] ? ` ${orig[k]}` : ""}`)
      })
      setXf(new DOMMatrix().translate(-base.x, -base.y).multiply(m).translate(base.x, base.y))
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      setXf(null)
      if (!moved) return
      swallowClick.current = true
      setTimeout(() => { swallowClick.current = false }, 0)
      const changes = ids.map((index, k) => ({ index, m: inParent(k) })).filter((c): c is ElementTransform => !!c.m)
      onTransform(changes)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
  }
  const showXf = !!onTransform && !path && !readOnly && !!union && selection.some((i) => i > 0)

  // Events from inside the shadow root are retargeted, so use the real target
  const indexOf = (e: { nativeEvent: Event }) => {
    const target = e.nativeEvent.composedPath()[0] as Element | undefined
    const el = target?.closest?.(`[${ATTR}]`)
    return el ? Number(el.getAttribute(ATTR)) : -1
  }

  return (
    <div ref={box} className={`inspect thumb--${backdrop}${zoom > 1 ? " is-zoomed" : ""}${panReady ? " is-pan-ready" : ""}`}>
      {/* The SVG's own canvas, at its real shape, with nothing around it */}
      <div ref={canvasRef} className="inspect__canvas" style={{ "--r": ratio, "--z": zoom, "--checker": checkerSize(checker, ratio) } as React.CSSProperties}>
      <div ref={stage} className="inspect__stage"
        onMouseMove={(e) => { const i = Math.max(indexOf(e), 0) || -1; if (i !== hover) onHover(i) }}
        onMouseLeave={() => onHover(-1)}
        onClick={(e) => {
          if (swallowClick.current) { swallowClick.current = false; return }
          // The svg itself isn't pickable here, so empty canvas clears the selection
          const i = indexOf(e)
          onPick(i > 0 ? i : -1, e.shiftKey || e.metaKey || e.ctrlKey)
        }}
        onContextMenu={(e) => { if (onContextMenu) { const i = indexOf(e); onContextMenu(i > 0 ? i : -1, e) } }} />
      <ShapeGuide />
      {boxes.hov && <div className="inspect__box inspect__box--hover" style={rect(boxes.hov)} />}
      {!path && boxes.sel.map((b, k) => <div key={k} className="inspect__box" style={shifted(rect(b), shift)} />)}
      {showXf && union && (
        <div className={`xf${xf ? " is-dragging" : ""}`} style={{ ...shifted(rect(union), shift), transform: xf ? mat(xf) : undefined, transformOrigin: `${-union.x}px ${-union.y}px` }}>
          {HANDLES.map((h) => <span key={h} className={`xf__h xf__h--${h}`} onPointerDown={(e) => startTransform(e, h)} />)}
          <span className="xf__rot" title="Drag to rotate. Shift snaps to 15°" onPointerDown={(e) => startTransform(e, "rot")} />
        </div>
      )}
      {guides.x.map((x) => <div key={`x${x}`} className="inspect__guide inspect__guide--v" style={{ left: x }} />)}
      {guides.y.map((y) => <div key={`y${y}`} className="inspect__guide inspect__guide--h" style={{ top: y }} />)}
      {marquee && <div className="inspect__marquee" style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }} />}
      {path && root && <PathOverlay stage={stage} box={box} root={root} edit={path} swallowClick={swallowClick}
        snap={() => live.current.snap} onGuides={setGuides} />}
      </div>
      {!root && <p className="inspect__error text-3">This markup doesn't parse, so it can't be previewed.</p>}
    </div>
  )
}

const rect = (r: DOMRect) => ({ left: r.x, top: r.y, width: Math.max(r.width, 1), height: Math.max(r.height, 1) })
/** A box moved along with a drag in progress */
const shifted = (r: ReturnType<typeof rect>, d: { x: number, y: number } | null) => (d ? { ...r, left: r.left + d.x, top: r.top + d.y } : r)

// ── Draggable points for a path ───────────────────────────────────────────────
// Click a point to select it (Shift adds), drag across the canvas to select
// several, or press on the path itself to grab all of it. Arrow keys nudge.

interface Drag { pointer: number, from: DOMPoint, base: Seg[], points: PointRef[], grab?: [number, number], moved: boolean, last?: Seg[], whole?: boolean }
interface Marquee { pointer: number, x0: number, y0: number, x1: number, y1: number, add: boolean }

interface OverlayProps {
  /** Snapping on (and not held off with ⌘), and where to draw its guides */
  snap: () => boolean
  onGuides: (g: { x: number[], y: number[] }) => void
  stage: React.RefObject<HTMLDivElement | null>
  box: React.RefObject<HTMLDivElement | null>
  root: Element
  edit: PathEdit
  swallowClick: React.MutableRefObject<boolean>
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el?.closest?.("input, textarea, select, [contenteditable=true], .monaco-editor")
}

function PathOverlay({ stage, box, root, edit, swallowClick, snap, onGuides }: OverlayProps) {
  // Maps the path's own coordinates to the stage's pixels
  const [ctm, setCtm] = useState<DOMMatrix | null>(null)
  const [draft, setDraft] = useState<Seg[] | null>(null)
  const [picked, setPicked] = useState<PointRef[]>([])
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const segs = draft ?? edit.segs
  const target = () => stage.current?.shadowRoot?.querySelector(`[${ATTR}="${edit.index}"]`) as SVGGraphicsElement | null
  const live = useRef({ segs, picked, ctm, edit })
  live.current = { segs, picked, ctm, edit }

  // A commit comes back as new segments, so the draft can go
  useEffect(() => setDraft(null), [edit.segs])
  // A different path, a different set of points
  useEffect(() => setPicked([]), [edit.index])
  useEffect(() => setPicked((p) => p.filter((x) => x.seg < edit.segs.length)), [edit.segs.length])

  useEffect(() => {
    const measure = () => {
      const el = target()
      const m = el?.getScreenCTM?.()
      const base = stage.current?.getBoundingClientRect()
      if (!m || !base) { setCtm(null); return }
      setCtm(new DOMMatrix([m.a, m.b, m.c, m.d, m.e - base.x, m.f - base.y]))
    }
    // After the preview has rendered
    const raf = requestAnimationFrame(measure)
    const ro = new ResizeObserver(measure)
    if (stage.current) ro.observe(stage.current)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, edit.index])

  // The click that follows a drag isn't a pick. Cleared after this event
  // loop turn in case that click lands somewhere else
  const swallow = () => { swallowClick.current = true; setTimeout(() => { swallowClick.current = false }, 0) }

  /** Pointer position in the path's own units */
  const toUser = (e: { clientX: number, clientY: number }) => {
    const base = stage.current?.getBoundingClientRect()
    const m = live.current.ctm
    if (!base || !m) return null
    return new DOMPoint(e.clientX - base.x, e.clientY - base.y).matrixTransform(m.inverse())
  }

  const startDrag = (e: PointerEvent | React.PointerEvent, points: PointRef[], grab?: [number, number], whole = false, done?: () => void) => {
    const from = toUser(e)
    if (!from || live.current.edit.readOnly) return
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    const d: Drag = { pointer: e.pointerId, from, base: live.current.segs, points, grab, moved: false, whole }
    // What snaps: the whole path's box, or the grabbed point
    const shadow = stage.current?.shadowRoot, stageBox = stage.current?.getBoundingClientRect()
    const self = target()
    const m0 = live.current.ctm
    const pointRect = d.grab && m0 && stageBox ? (() => { const q = new DOMPoint(d.grab![0], d.grab![1]).matrixTransform(m0); return new DOMRect(q.x + stageBox.x, q.y + stageBox.y, 0, 0) })() : null
    const snapTo = shadow && stageBox
      ? snapper(shadow, whole && self ? [self] : [], whole ? self?.getBoundingClientRect() ?? null : pointRect, stageBox)
      : null
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== d.pointer) return
      let cx = ev.clientX, cy = ev.clientY
      if (snapTo) {
        const sn = snapTo(ev.clientX - e.clientX, ev.clientY - e.clientY, snap() && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey)
        cx = e.clientX + sn.dx
        cy = e.clientY + sn.dy
        onGuides({ x: sn.gx, y: sn.gy })
      }
      const p = toUser({ clientX: cx, clientY: cy })
      if (!p) return
      let dx = p.x - d.from.x, dy = p.y - d.from.y
      if (!d.moved && Math.hypot(ev.clientX - (e.clientX), ev.clientY - (e.clientY)) < 2) return
      d.moved = true
      // Shift snaps the grabbed point to whole numbers
      if (ev.shiftKey && d.grab) { dx = Math.round(d.grab[0] + dx) - d.grab[0]; dy = Math.round(d.grab[1] + dy) - d.grab[1] }
      const next = shiftPoints(d.base, d.points, dx, dy)
      d.last = next
      setDraft(next)
      // Straight onto the preview, the markup catches up on release
      target()?.setAttribute("d", serialisePath(next))
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== d.pointer) return
      onGuides({ x: [], y: [] })
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      if (d.moved || d.whole) swallow()
      done?.()
      if (!d.moved || !d.last) return
      live.current.edit.onCommit(d.last)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
  }

  // Presses on the canvas: on the path grabs all of it, elsewhere starts a
  // selection box. A press that doesn't move is still a normal click
  useEffect(() => {
    const el = box.current
    if (!el) return
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !live.current.ctm) return
      const t = e.composedPath()[0] as Element | undefined
      if (t?.closest?.(".po__anchor, .po__ctrl")) return
      const hit = t?.closest?.(`[${ATTR}]`)
      const index = hit ? Number(hit.getAttribute(ATTR)) : -1
      const { edit: ed, segs: cur } = live.current
      if (index === ed.index && !ed.readOnly) {
        // Grabbing the path moves every point, but only for this drag: the
        // selection goes back after, so a later right-click or Delete
        // doesn't act on the whole path by surprise
        const all = allAnchors(cur)
        const before = live.current.picked
        startDrag(e, all, undefined, true, () => setPicked(before))
        return
      }
      const base = stage.current?.getBoundingClientRect()
      if (!base) return
      const x = e.clientX - base.x, y = e.clientY - base.y
      const m: Marquee = { pointer: e.pointerId, x0: x, y0: y, x1: x, y1: y, add: e.shiftKey }
      let started = false
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== m.pointer) return
        m.x1 = ev.clientX - base.x
        m.y1 = ev.clientY - base.y
        if (!started && Math.hypot(m.x1 - m.x0, m.y1 - m.y0) < 4) return
        started = true
        setMarquee({ ...m })
      }
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== m.pointer) return
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", up)
        window.removeEventListener("pointercancel", up)
        setMarquee(null)
        if (!started) return
        swallow()
        const { segs: now, ctm: mat } = live.current
        if (!mat) return
        const left = Math.min(m.x0, m.x1), right = Math.max(m.x0, m.x1)
        const top = Math.min(m.y0, m.y1), bottom = Math.max(m.y0, m.y1)
        const geo = geometry(now)
        const inside = allAnchors(now).filter((p) => {
          const q = pointAt(geo, p)
          if (!q) return false
          const s = new DOMPoint(q[0], q[1]).matrixTransform(mat)
          return s.x >= left && s.x <= right && s.y >= top && s.y <= bottom
        })
        setPicked((prev) => {
          if (!m.add) return inside
          const keys = new Set(prev.map(pointKey))
          return [...prev, ...inside.filter((p) => !keys.has(pointKey(p)))]
        })
      }
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up)
      window.addEventListener("pointercancel", up)
    }
    el.addEventListener("pointerdown", down)
    return () => el.removeEventListener("pointerdown", down)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Arrow keys nudge the selected points, Escape lets go of them
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const { picked: sel, segs: cur, edit: ed } = live.current
      if (!sel.length || isTyping(e.target) || e.metaKey || e.ctrlKey) return
      if (e.key === "Escape") { e.preventDefault(); setPicked([]); return }
      if ((e.key === "Delete" || e.key === "Backspace") && !ed.readOnly) {
        // Points go, not the whole path
        const ends = sel.filter((p) => p.kind === "end")
        if (!ends.length) return
        e.preventDefault()
        e.stopImmediatePropagation()
        const next = deletePoints(cur, ends)
        // The point that followed the first one deleted is picked next, so
        // Delete can be pressed again and again until the shape is gone
        const first = Math.min(...ends.map((p) => p.seg))
        const ok = (i: number) => !!next[i] && !/[Zz]/.test(next[i].c)
        const after = ok(first) ? first : ok(first - 1) ? first - 1 : -1
        setPicked(after >= 0 ? [{ seg: after, kind: "end" }] : [])
        ed.onCommit(next)
        return
      }
      const dir: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      const d = dir[e.key]
      if (!d || ed.readOnly) return
      e.preventDefault()
      const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1
      ed.onCommit(shiftPoints(cur, sel, d[0] * step, d[1] * step))
    }
    // Capture phase: this overlay mounts after the dialog's own arrow handler,
    // so it has to get in first or the whole shape moves instead of the points
    window.addEventListener("keydown", key, true)
    return () => window.removeEventListener("keydown", key, true)
  }, [])

  const geo = useMemo(() => geometry(segs), [segs])
  const d = useMemo(() => serialisePath(segs), [segs])
  const pickedKeys = useMemo(() => new Set(picked.map(pointKey)), [picked])
  if (!ctm) return null
  const at = (p: [number, number]) => { const q = new DOMPoint(p[0], p[1]).matrixTransform(ctm); return [q.x, q.y] as const }
  const showHandles = !edit.readOnly && segs.length <= MAX_HANDLES

  const down = (e: React.PointerEvent, seg: number, kind: PointKind) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const ref = { seg, kind }
    const key = pointKey(ref)
    let sel = picked
    // Alt- or ⌘-click flips a point (or the selected points) between corner and curve
    if ((e.altKey || e.metaKey) && kind === "end" && !edit.readOnly) {
      const pts = pickedKeys.has(key) ? picked : [ref]
      if (!pickedKeys.has(key)) setPicked([ref])
      swallow()
      edit.onCommit(toggleCorner(segs, pts))
      return
    }
    if (e.shiftKey) {
      sel = pickedKeys.has(key) ? picked.filter((p) => pointKey(p) !== key) : [...picked, ref]
      setPicked(sel)
      if (pickedKeys.has(key)) return
    } else if (!pickedKeys.has(key)) {
      sel = [ref]
      setPicked(sel)
    }
    edit.onActive(seg)
    startDrag(e, sel, pointAt(geo, ref))
  }

  // Right-click: the menu acts on the selected points if this is one of them
  const pointMenu = (e: React.MouseEvent, seg: number) => {
    e.preventDefault()
    e.stopPropagation()
    if (!edit.onPointMenu || edit.readOnly) return
    const ref: PointRef = { seg, kind: "end" }
    const inSel = pickedKeys.has(pointKey(ref))
    if (!inSel) setPicked([ref])
    edit.onPointMenu(inSel ? picked.filter((p) => p.kind === "end") : [ref], e)
  }

  const handles: React.ReactNode[] = []
  if (showHandles) {
    geo.forEach((g, i) => {
      const c = segs[i].c.toLowerCase()
      if (c === "z") return
      const on = i === edit.active
      const anchor = at(g.to)
      const ctrl = (p: [number, number] | undefined, from: [number, number], kind: PointKind) => {
        if (!p) return
        const q = at(p), f = at(from)
        handles.push(<line key={`${i}${kind}l`} className="po__arm" x1={f[0]} y1={f[1]} x2={q[0]} y2={q[1]} />)
        handles.push(<circle key={`${i}${kind}`} className={`po__ctrl${on ? " is-active" : ""}${pickedKeys.has(`${i}:${kind}`) ? " is-picked" : ""}`} cx={q[0]} cy={q[1]} r={4}
          onPointerDown={(e) => down(e, i, kind)} onPointerEnter={() => edit.onActive(i)} />)
      }
      ctrl(g.c1, g.from, "c1")
      ctrl(g.c2, g.to, "c2")
      if (c === "q" && g.c1) handles.push(<line key={`${i}q2`} className="po__arm" x1={at(g.c1)[0]} y1={at(g.c1)[1]} x2={anchor[0]} y2={anchor[1]} />)
      handles.push(<rect key={`${i}e`} className={`po__anchor${on ? " is-active" : ""}${c === "m" ? " is-start" : ""}${pickedKeys.has(`${i}:end`) ? " is-picked" : ""}`}
        x={anchor[0] - 4} y={anchor[1] - 4} width={8} height={8}
        onPointerDown={(e) => down(e, i, "end")} onPointerEnter={() => edit.onActive(i)} onContextMenu={(e) => pointMenu(e, i)} />)
    })
  }
  // The active segment, drawn on its own so it stands out
  const activeD = edit.active >= 0 && segs[edit.active] ? segmentD(segs, edit.active, geo) : ""
  const matrix = `matrix(${ctm.a} ${ctm.b} ${ctm.c} ${ctm.d} ${ctm.e} ${ctm.f})`

  return (
    <>
      <svg className="po">
        <path className="po__outline" d={d} transform={matrix} />
        {activeD && <path className="po__segment" d={activeD} transform={matrix} />}
        {handles}
        {marquee && <rect className="po__marquee" x={Math.min(marquee.x0, marquee.x1)} y={Math.min(marquee.y0, marquee.y1)}
          width={Math.abs(marquee.x1 - marquee.x0)} height={Math.abs(marquee.y1 - marquee.y0)} />}
      </svg>
      {!edit.readOnly && (
        <p className="po__hint text-3">
          {picked.length
            ? `${picked.length} ${picked.length === 1 ? "point" : "points"} selected. Drag or use the arrow keys to move (Shift for 10), Esc to let go`
            : "Drag across points to select them, or press on the path to move all of it"}
        </p>
      )}
    </>
  )
}

/** One segment on its own, as absolute path data */
function segmentD(segs: Seg[], i: number, geo: ReturnType<typeof geometry>) {
  const g = geo[i]
  const s = segs[i]
  const c = s.c.toLowerCase()
  const from = `M${g.from[0]} ${g.from[1]}`
  const to = `${g.to[0]} ${g.to[1]}`
  switch (c) {
    case "m": return ""
    case "c": return `${from}C${g.c1} ${g.c2} ${to}`.replace(/,/g, " ")
    case "s": {
      // Its first handle is the reflection of the one before, if that was a curve
      const p = geo[i - 1]
      const pc = segs[i - 1]?.c.toLowerCase()
      const c1 = p?.c2 && (pc === "c" || pc === "s") ? [2 * g.from[0] - p.c2[0], 2 * g.from[1] - p.c2[1]] : g.from
      return `${from}C${c1} ${g.c2} ${to}`.replace(/,/g, " ")
    }
    case "q": return `${from}Q${g.c1} ${to}`.replace(/,/g, " ")
    case "a": return `${from}A${s.v.slice(0, 5).join(" ")} ${to}`
    default: return `${from}L${to}`
  }
}
