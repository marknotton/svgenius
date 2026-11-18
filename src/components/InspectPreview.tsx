import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { Backdrop } from "../lib/types"
import { geometry, movePoint, serialisePath, type PointKind, type Seg } from "../lib/pathData"
import { usePreviewCss, withPreviewCss } from "./PreviewCss"

// ── Inspectable preview ───────────────────────────────────────────────────────
// Renders the SVG inline (scripts and event handlers stripped) so elements can
// be hovered and clicked, like a browser's element picker. Elements are
// numbered in tree order, which matches their order in the markup.

interface Props {
  markup: string
  backdrop: Backdrop
  /** Tree-order index of the picked element */
  selected: number
  onPick: (index: number) => void
  onHover: (index: number) => void
  /** The selected path's points, drawn as draggable handles */
  path?: PathEdit | null
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

export function InspectPreview({ markup, backdrop, selected, onPick, onHover, path }: Props) {
  const stage = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(-1)
  const [boxes, setBoxes] = useState<{ sel: DOMRect | null, hov: DOMRect | null }>({ sel: null, hov: null })
  const css = usePreviewCss()
  // Preview CSS goes in last, so element numbers still match the markup
  const root = useMemo(() => prepare(withPreviewCss(markup, css)), [markup, css])

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
      setBoxes({ sel: box(selected), hov: hover !== selected ? box(hover) : null })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (stage.current) ro.observe(stage.current)
    return () => ro.disconnect()
  }, [selected, hover, root])

  // Events from inside the shadow root are retargeted, so use the real target
  const indexOf = (e: { nativeEvent: Event }) => {
    const target = e.nativeEvent.composedPath()[0] as Element | undefined
    const el = target?.closest?.(`[${ATTR}]`)
    return el ? Number(el.getAttribute(ATTR)) : -1
  }

  return (
    <div className={`inspect thumb--${backdrop}`}>
      <div ref={stage} className="inspect__stage"
        onMouseMove={(e) => { const i = indexOf(e); if (i !== hover) { setHover(i); onHover(i) } }}
        onMouseLeave={() => { setHover(-1); onHover(-1) }}
        onClick={(e) => { const i = indexOf(e); if (i >= 0) onPick(i) }} />
      {boxes.hov && <div className="inspect__box inspect__box--hover" style={rect(boxes.hov)} />}
      {boxes.sel && !path && <div className="inspect__box" style={rect(boxes.sel)} />}
      {path && root && <PathOverlay stage={stage} root={root} edit={path} />}
      {!root && <p className="inspect__error text-3">This markup doesn't parse, so it can't be previewed.</p>}
    </div>
  )
}

const rect = (r: DOMRect) => ({ left: r.x, top: r.y, width: Math.max(r.width, 1), height: Math.max(r.height, 1) })

// ── Draggable points for a path ───────────────────────────────────────────────

interface Drag { seg: number, kind: PointKind, pointer: number }

function PathOverlay({ stage, root, edit }: { stage: React.RefObject<HTMLDivElement | null>, root: Element, edit: PathEdit }) {
  // Maps the path's own coordinates to the stage's pixels
  const [ctm, setCtm] = useState<DOMMatrix | null>(null)
  const [draft, setDraft] = useState<Seg[] | null>(null)
  const drag = useRef<Drag | null>(null)
  const segs = draft ?? edit.segs
  const target = () => stage.current?.shadowRoot?.querySelector(`[${ATTR}="${edit.index}"]`) as SVGGraphicsElement | null

  // A commit comes back as new segments, so the draft can go
  useEffect(() => setDraft(null), [edit.segs])

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

  const geo = useMemo(() => geometry(segs), [segs])
  const d = useMemo(() => serialisePath(segs), [segs])
  if (!ctm) return null
  const at = (p: [number, number]) => { const q = new DOMPoint(p[0], p[1]).matrixTransform(ctm); return [q.x, q.y] as const }
  const showHandles = !edit.readOnly && segs.length <= MAX_HANDLES

  const down = (e: React.PointerEvent, seg: number, kind: PointKind) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    drag.current = { seg, kind, pointer: e.pointerId }
    edit.onActive(seg)
  }
  const move = (e: React.PointerEvent) => {
    const g = drag.current
    if (!g || g.pointer !== e.pointerId) return
    const base = stage.current?.getBoundingClientRect()
    if (!base) return
    const p = new DOMPoint(e.clientX - base.x, e.clientY - base.y).matrixTransform(ctm.inverse())
    // Shift snaps to whole numbers
    const x = e.shiftKey ? Math.round(p.x) : p.x, y = e.shiftKey ? Math.round(p.y) : p.y
    const next = movePoint(segs, g.seg, g.kind, x, y)
    setDraft(next)
    // Straight onto the preview, the markup catches up on release
    target()?.setAttribute("d", serialisePath(next))
  }
  const up = (e: React.PointerEvent) => {
    if (!drag.current || drag.current.pointer !== e.pointerId) return
    drag.current = null
    if (draft) edit.onCommit(draft)
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
        handles.push(<circle key={`${i}${kind}`} className={`po__ctrl${on ? " is-active" : ""}`} cx={q[0]} cy={q[1]} r={4}
          onPointerDown={(e) => down(e, i, kind)} onPointerEnter={() => edit.onActive(i)} />)
      }
      ctrl(g.c1, g.from, "c1")
      ctrl(g.c2, g.to, "c2")
      if (c === "q" && g.c1) handles.push(<line key={`${i}q2`} className="po__arm" x1={at(g.c1)[0]} y1={at(g.c1)[1]} x2={anchor[0]} y2={anchor[1]} />)
      handles.push(<rect key={`${i}e`} className={`po__anchor${on ? " is-active" : ""}${c === "m" ? " is-start" : ""}`}
        x={anchor[0] - 4} y={anchor[1] - 4} width={8} height={8}
        onPointerDown={(e) => down(e, i, "end")} onPointerEnter={() => edit.onActive(i)} />)
    })
  }
  // The active segment, drawn on its own so it stands out
  const g = edit.active >= 0 ? geo[edit.active] : undefined
  const activeD = g && segs[edit.active] ? segmentD(segs, edit.active, geo) : ""

  return (
    <svg className="po" onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <path className="po__outline" d={d} transform={`matrix(${ctm.a} ${ctm.b} ${ctm.c} ${ctm.d} ${ctm.e} ${ctm.f})`} />
      {activeD && <path className="po__segment" d={activeD} transform={`matrix(${ctm.a} ${ctm.b} ${ctm.c} ${ctm.d} ${ctm.e} ${ctm.f})`} />}
      {handles}
    </svg>
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
