import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { adjustFromText, adjustToText, applyAdjustToBox, composeAdjust, diffAdjust, IDENTITY, isIdentity, makeAdjust, syOf, unapplyAdjustToBox } from "@marknotton/svgenius-core/designPrinciples"
import { svgDataUrl } from "@marknotton/svgenius-core/format"
import { shapeMaskUrl, type GuideShape } from "@marknotton/svgenius-core/shapes"
import { fmtNum, getAttr, parseLength, parseViewBox, rootTag, type ViewBox } from "@marknotton/svgenius-core/svgRoot"
import { artworkBounds } from "@marknotton/svgenius-core/trim"
import type { ArtAdjust, Backdrop, DesignPrinciple, SvgItem } from "@marknotton/svgenius-core/types"
import { adapter } from "../host"
import { IconChevronLeft, IconChevronRight, IconCopy, IconRedo, IconReset, IconUndo, IconX } from "../icons"
import { useCommands } from "../lib/commands"
import { GridGuides } from "./GridGuides"
import { usePreviewCss, withPreviewCss } from "./PreviewCss"
import { Segmented } from "./Segmented"
import { ShapeGuide, ShapeOptions } from "./ShapeGuide"

// ── Quickview ─────────────────────────────────────────────────────────────────
// One file at a time, big, over a design principle's grid, for nudging its
// position and scale by exact steps. Changes are the file's own "tuning",
// applied last in the pipeline. The preview moves straight away (a CSS
// transform of the last result) and settles on the real output a moment later.

export interface QuickviewProps {
  /** The files to page through, in order */
  items: SvgItem[]
  startId: string
  backdrop: Backdrop
  /** Adjustments that come before the file's own (its design principle's variations) */
  baseFor: (item: SvgItem) => ArtAdjust
  /** The design principle whose guides to draw */
  principleFor: (item: SvgItem) => DesignPrinciple | null
  principles: DesignPrinciple[]
  /** null follows each file's preset, "none" draws no guides, else a principle id */
  principleChoice: string | null
  onPrincipleChoice: (choice: string | null) => void
  onManagePrinciples?: () => void
  /** Sets a file's own tuning (undefined clears it) */
  onAdjust: (id: string, adjust: ArtAdjust | undefined) => void
  /** Re-runs a file */
  onRun: (id: string) => void
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
  /** Sets many files' tuning at once (Apply to all). Without it, each file is set in turn */
  onAdjustMany?: (changes: Array<{ id: string, adjust: ArtAdjust | undefined }>) => void
  /** Whether the files are the selected ones or everything listed, for the wording */
  scope?: "selected" | "listed"
  /** The host's confirm dialog. Without it Quickview asks in its own */
  confirm?: (opts: { title: string, body: ReactNode, confirmLabel: string }) => Promise<boolean>
}

/** Another dialog (Design principles, say) is open on top */
const covered = () => document.querySelectorAll(".modal").length > 1

interface Change { id: string, before: ArtAdjust, after: ArtAdjust }
interface Entry { changes: Change[], kind: string, t: number }

type Box = { x: number, y: number, w: number, h: number }

/** Remembers whether the shortcuts footer is open, per viewer */
const keysStore = {
  get: () => { try { return localStorage.getItem("svgenius:quickview-keys") !== "closed" } catch { return true } },
  set: (open: boolean) => { try { localStorage.setItem("svgenius:quickview-keys", open ? "open" : "closed") } catch { /* unavailable */ } }
}

const STEPS = [1, 0.1, 0.01]
const own = (item: SvgItem | undefined) => item?.adjust ?? IDENTITY
const tidy = (a: ArtAdjust): ArtAdjust => makeAdjust(+a.scale.toFixed(6), +syOf(a).toFixed(6), +a.x.toFixed(4), +a.y.toFixed(4))
const same = (a: ArtAdjust, b: ArtAdjust) => a.scale === b.scale && syOf(a) === syOf(b) && a.x === b.x && a.y === b.y
const describe = (a: ArtAdjust) => `X ${fmtNum(a.x, 3)}, Y ${fmtNum(a.y, 3)}, scale ×${fmtNum(a.scale, 4)}${a.sy !== undefined ? ` × ${fmtNum(a.sy, 4)}` : ""}`

function viewBoxOf(svg: string | undefined): ViewBox | null {
  const tag = svg ? rootTag(svg) : null
  if (!tag) return null
  const vb = parseViewBox(getAttr(tag, "viewBox"))
  if (vb) return vb
  const w = parseLength(getAttr(tag, "width")), h = parseLength(getAttr(tag, "height"))
  return w && h ? { x: 0, y: 0, w, h } : null
}

export function Quickview(p: QuickviewProps) {
  const [id, setId] = useState(p.startId)
  const [dir, setDir] = useState<"next" | "prev" | null>(null)
  const index = Math.max(0, p.items.findIndex((i) => i.id === id))
  const item = p.items[index] as SvgItem | undefined
  const [peek, setPeek] = useState(false)
  const [hideOverlay, setHideOverlay] = useState(false)
  const [keysOpen, setKeysOpen] = useState(keysStore.get)
  const [customStep, setCustomStep] = useState(() => (STEPS.includes(p.step) ? "" : String(p.step)))

  // Latest props for the key handler and timers
  const live = useRef(p)
  live.current = p
  const itemRef = useRef(item)
  itemRef.current = item

  // ── Undo and redo ──────────────────────────────────────────────────────────
  const [history, setHistory] = useState<{ undo: Entry[], redo: Entry[] }>({ undo: [], redo: [] })
  const historyRef = useRef(history)
  historyRef.current = history

  // Re-run shortly after the last change, so held keys don't queue up runs
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const schedule = useCallback((fileId: string) => {
    clearTimeout(timers.current.get(fileId))
    timers.current.set(fileId, setTimeout(() => { timers.current.delete(fileId); live.current.onRun(fileId) }, 140))
  }, [])
  useEffect(() => () => { for (const t of timers.current.values()) clearTimeout(t) }, [])

  const commit = useCallback((fileId: string, a: ArtAdjust) => {
    live.current.onAdjust(fileId, isIdentity(a) ? undefined : a)
    schedule(fileId)
  }, [schedule])

  /** Changes the open file's tuning, as one undo step (quick repeats of the same kind merge) */
  const change = useCallback((fn: (a: ArtAdjust) => ArtAdjust, kind: string) => {
    const it = itemRef.current
    if (!it) return
    const before = own(it)
    const after = tidy(fn(before))
    if (!(after.scale > 0 && syOf(after) > 0) || same(before, after)) return
    const now = Date.now()
    setHistory((h) => {
      const last = h.undo[h.undo.length - 1]
      if (last && last.changes.length === 1 && last.changes[0].id === it.id && last.kind === kind && kind !== "set" && now - last.t < 700) {
        return { undo: [...h.undo.slice(0, -1), { ...last, changes: [{ ...last.changes[0], after }], t: now }], redo: [] }
      }
      return { undo: [...h.undo.slice(-199), { changes: [{ id: it.id, before, after }], kind, t: now }], redo: [] }
    })
    commit(it.id, after)
  }, [commit])

  /** Sets many files at once, as one undo step */
  const commitMany = useCallback((list: Array<{ id: string, a: ArtAdjust }>) => {
    const p = live.current
    if (p.onAdjustMany) p.onAdjustMany(list.map(({ id, a }) => ({ id, adjust: isIdentity(a) ? undefined : a })))
    else for (const { id, a } of list) p.onAdjust(id, isIdentity(a) ? undefined : a)
    // Only the file on screen re-runs now; the rest catch up as the list shows them
    const here = itemRef.current?.id
    if (here && list.some((c) => c.id === here)) schedule(here)
  }, [schedule])

  const travel = useCallback((back: boolean) => {
    const h = historyRef.current
    const entry = back ? h.undo[h.undo.length - 1] : h.redo[h.redo.length - 1]
    if (!entry) return false
    setHistory(back
      ? { undo: h.undo.slice(0, -1), redo: [...h.redo, entry] }
      : { undo: [...h.undo, entry], redo: h.redo.slice(0, -1) })
    if (entry.changes.length === 1) {
      const c = entry.changes[0]
      commit(c.id, back ? c.before : c.after)
      // Show the file the step belongs to
      if (c.id !== itemRef.current?.id && live.current.items.some((i) => i.id === c.id)) { setDir(null); setId(c.id) }
    } else {
      commitMany(entry.changes.map((c) => ({ id: c.id, a: back ? c.before : c.after })))
      live.current.notify(`${back ? "Undid" : "Redid"} the change to ${entry.changes.length} files`, "info")
    }
    return true
  }, [commit, commitMany])

  useCommands((cmd) => {
    if (covered()) return false
    if (cmd === "undo" || cmd === "redo") { travel(cmd === "undo"); return true }
    // Nothing else reaches the app beneath while Quickview is open
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

  // ── Moves ──────────────────────────────────────────────────────────────────
  const step = p.step
  // The artwork's bounds in the last result, and the tuning baked into it
  const [measured, setMeasured] = useState<{ id: string, box: Box, baked: ArtAdjust, vb: ViewBox } | null>(null)
  const measuredRef = useRef(measured)
  measuredRef.current = measured
  /** The artwork's box before this file's own tuning (variations included), or null until measured */
  const baseBox = useCallback((): { box: Box, vb: ViewBox } | null => {
    const m = measuredRef.current, it = itemRef.current
    if (!m || !it || m.id !== it.id) return null
    const cx = m.vb.x + m.vb.w / 2, cy = m.vb.y + m.vb.h / 2
    const raw = unapplyAdjustToBox(m.baked, m.box, cx, cy)
    return { box: applyAdjustToBox(live.current.baseFor(it), raw, cx, cy), vb: m.vb }
  }, [])
  const move = useCallback((dx: number, dy: number, mult = 1) => {
    const s = live.current.step * mult
    change((a) => ({ ...a, x: a.x + dx * s, y: a.y + dy * s }), "move")
  }, [change])
  /** Grows or shrinks the artwork by the step, in viewBox units of its longest side (stretching is kept) */
  const scaleBy = useCallback((sign: 1 | -1, mult = 1) => {
    const s = live.current.step * mult
    const it = itemRef.current
    const bb = baseBox()
    const vb = viewBoxOf(it?.result?.output ?? it?.source)
    // The artwork's size before this file's own tuning
    const base = bb ? Math.max(bb.box.w, bb.box.h) : vb ? Math.max(vb.w, vb.h) : 100
    change((a) => {
      const size = base * Math.max(a.scale, syOf(a))
      const k = Math.max(0.01, Math.max(size * 0.01, size + sign * s) / size)
      return makeAdjust(a.scale * k, syOf(a) * k, a.x, a.y)
    }, "scale")
  }, [change, baseBox])

  // ── Fit and align ──────────────────────────────────────────────────────────
  const [fitTo, setFitTo] = useState<"canvas" | "live">("live")
  const [stretch, setStretch] = useState(false)
  /** Where fit and align aim: the whole viewBox, or the design principle's live area mapped onto it */
  const targetBox = useCallback((vb: ViewBox): Box => {
    const it = itemRef.current
    const dp = it ? live.current.principleFor(it) : null
    if (fitTo === "canvas" || !dp) return { x: vb.x, y: vb.y, w: vb.w, h: vb.h }
    const k = Math.min(vb.w / dp.width, vb.h / dp.height)
    const ox = vb.x + (vb.w - dp.width * k) / 2, oy = vb.y + (vb.h - dp.height * k) / 2
    return { x: ox + dp.padding * k, y: oy + dp.padding * k, w: Math.max(1e-6, (dp.width - dp.padding * 2) * k), h: Math.max(1e-6, (dp.height - dp.padding * 2) * k) }
  }, [fitTo])
  /** The tuning that puts the base box at (x, y) with scales sx, sy */
  const placing = (b: Box, vb: ViewBox, sx: number, sy: number, x: number, y: number) => {
    const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2
    return makeAdjust(sx, sy, x - cx - sx * (b.x - cx), y - cy - sy * (b.y - cy))
  }
  const notMeasured = () => live.current.notify("Still measuring this file. Try again in a moment", "info")
  const fit = useCallback((mode: "w" | "h" | "both") => {
    const bb = baseBox()
    if (!bb || !(bb.box.w > 0 && bb.box.h > 0)) { notMeasured(); return }
    const { box: b, vb } = bb
    const T = targetBox(vb)
    change((a) => {
      const kw = T.w / b.w, kh = T.h / b.h
      let sx: number, sy: number
      if (stretch) {
        sx = mode === "h" ? a.scale : kw
        sy = mode === "w" ? syOf(a) : kh
      } else {
        sx = sy = mode === "w" ? kw : mode === "h" ? kh : Math.min(kw, kh)
      }
      // The fitted sides line up with the target; the others keep their centre
      const now = applyAdjustToBox(a, b, vb.x + vb.w / 2, vb.y + vb.h / 2)
      const w = b.w * sx, h = b.h * sy
      const x = mode === "h" ? now.x + (now.w - w) / 2 : T.x + (T.w - w) / 2
      const y = mode === "w" ? now.y + (now.h - h) / 2 : T.y + (T.h - h) / 2
      return placing(b, vb, sx, sy, x, y)
    }, "set")
  }, [baseBox, targetBox, stretch, change])  // eslint-disable-line react-hooks/exhaustive-deps
  /** -1, 0 or 1 on each axis: left, centre or right; top, middle or bottom */
  const align = useCallback((h: -1 | 0 | 1, v: -1 | 0 | 1) => {
    const bb = baseBox()
    if (!bb) { notMeasured(); return }
    const { box: b, vb } = bb
    const T = targetBox(vb)
    change((a) => {
      const w = b.w * a.scale, hh = b.h * syOf(a)
      const x = h < 0 ? T.x : h > 0 ? T.x + T.w - w : T.x + (T.w - w) / 2
      const y = v < 0 ? T.y : v > 0 ? T.y + T.h - hh : T.y + (T.h - hh) / 2
      return placing(b, vb, a.scale, syOf(a), x, y)
    }, "set")
  }, [baseBox, targetBox, change])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apply to all ───────────────────────────────────────────────────────────
  const [asking, setAsking] = useState<{ title: string, body: ReactNode, confirmLabel: string, resolve: (ok: boolean) => void } | null>(null)
  const applyAll = useCallback(async () => {
    const it = itemRef.current
    if (!it) return
    const a = own(it)
    const list = live.current.items
    const others = list.filter((i) => i.id !== it.id && !same(own(i), a))
    const n = list.length
    const which = live.current.scope === "selected" ? "selected" : "listed"
    const opts = {
      title: `Apply to all ${n} ${which} SVGs?`,
      body: <p>Applying {describe(a)} to all {n} {which} SVG{n === 1 ? "" : "s"}{others.length < n - 1 ? ` (${n - 1 - others.length} already match)` : ""}. Their own position and scale are replaced. ⌘Z undoes it.</p>,
      confirmLabel: `Apply to ${n}`
    }
    const ok = live.current.confirm
      ? await live.current.confirm(opts)
      : await new Promise<boolean>((resolve) => setAsking({ ...opts, resolve }))
    if (!ok || !others.length) return
    const changes = others.map((i) => ({ id: i.id, before: own(i), after: a }))
    setHistory((h) => ({ undo: [...h.undo.slice(-199), { changes, kind: "all", t: Date.now() }], redo: [] }))
    commitMany(changes.map((c) => ({ id: c.id, a })))
    live.current.notify(`Applied to ${others.length} SVG${others.length === 1 ? "" : "s"}`, "success")
  }, [commitMany])

  const reset = useCallback(() => change(() => IDENTITY, "set"), [change])
  const previous = index > 0 ? p.items[index - 1] : null
  const copyPrevious = useCallback(() => {
    const list = live.current.items
    const at = list.findIndex((i) => i.id === itemRef.current?.id)
    const prev = at > 0 ? list[at - 1] : null
    if (!prev) return
    change(() => own(prev), "set")
    live.current.notify(`Copied ${prev.name}'s position and scale`, "info")
  }, [change])

  const copyText = useCallback(async () => {
    const text = adjustToText(own(itemRef.current))
    try {
      await navigator.clipboard.writeText(text)
      live.current.notify("Copied position and scale", "success")
    } catch {
      live.current.notify("Couldn't reach the clipboard", "error")
    }
  }, [])
  const pasteText = useCallback((text: string) => {
    const a = adjustFromText(text)
    if (!a) { live.current.notify("The clipboard doesn't hold a position and scale", "info"); return }
    change(() => a, "set")
    live.current.notify("Pasted position and scale", "success")
  }, [change])
  const pasteFromClipboard = useCallback(async () => {
    try { pasteText(await adapter().readClipboardText()) } catch { live.current.notify("Couldn't reach the clipboard", "error") }
  }, [pasteText])

  // ⌘C / ⌘V (the menu's Copy and Paste too) copy and paste the tuning as JSON
  useEffect(() => {
    const typing = () => {
      const el = document.activeElement as HTMLElement | null
      return !!el?.closest("input, textarea, select, [contenteditable]") || !!window.getSelection()?.toString()
    }
    const onCopy = (e: ClipboardEvent) => {
      if (covered() || typing() || !e.clipboardData) return
      e.preventDefault(); e.stopImmediatePropagation()
      e.clipboardData.setData("text/plain", adjustToText(own(itemRef.current)))
      live.current.notify("Copied position and scale", "success")
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
        const k = e.key.toLowerCase()
        if (k === "q") { if (!e.repeat) go(-1); return true }
        if (k === "w") { if (!e.repeat) go(1); return true }
        if (k === "r") { if (!e.repeat) reset(); return true }
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
  }, [move, scaleBy, go, reset])

  // ── Preview ────────────────────────────────────────────────────────────────
  const css = usePreviewCss()
  const output = item?.result?.output
  const svg = output ?? item?.source
  const src = useMemo(() => (svg ? svgDataUrl(withPreviewCss(svg, css)) : undefined), [svg, css])
  // What the shown markup already has baked in
  const baked = output ? item?.result?.adjust ?? IDENTITY : IDENTITY
  // Swap images only once the new one has decoded, with the tuning it was made with
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

  // The artwork's bounds in the result, for the px readout, scale steps, fit and align
  useEffect(() => {
    if (!output || !item) { setMeasured(null); return }
    let cancelled = false
    const bakedNow = item.result?.adjust ?? IDENTITY
    const vbNow = viewBoxOf(output)
    const idNow = item.id
    artworkBounds(output).then((b) => {
      if (cancelled) return
      setMeasured(b && vbNow ? { id: idNow, box: b, baked: bakedNow, vb: vbNow } : null)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [output])  // eslint-disable-line react-hooks/exhaustive-deps

  if (!item) return null
  const base = p.baseFor(item)
  const mine = own(item)
  const target = peek ? base : composeAdjust(base, mine)
  const showing = shown && shown.id === item.id ? shown : null
  const delta = showing ? diffAdjust(showing.baked, target) : IDENTITY
  const vb = showing?.vb ?? viewBoxOf(svg)
  const ratio = vb && vb.w > 0 && vb.h > 0 ? vb.w / vb.h : 1
  const transform = vb && !isIdentity(delta)
    ? `translate(${(delta.x / vb.w) * 100}%, ${(delta.y / vb.h) * 100}%) scale(${delta.scale}, ${syOf(delta)})`
    : undefined
  const dp = p.principleFor(item)
  const overlay = p.overlay && !hideOverlay ? p.overlay : null
  const artMask = p.clip && p.overlay ? { WebkitMaskImage: shapeMaskUrl(p.overlay), maskImage: shapeMaskUrl(p.overlay) } as CSSProperties : undefined
  // The artwork's size on screen now, in viewBox units
  const bbNow = baseBox()
  const now = bbNow ? applyAdjustToBox(mine, bbNow.box, bbNow.vb.x + bbNow.vb.w / 2, bbNow.vb.y + bbNow.vb.h / 2) : null

  return (
    <div className="modal-backdrop quickview-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) p.onClose(item.id) }}>
      <div className="modal quickview" role="dialog" aria-modal="true" aria-label={`Quickview: ${item.name}`}>
        <header className="quickview__head">
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
            <label className="quickview__pick" title="Shape overlay, used for the guide and clip everywhere. Hold T to hide it">
              <span className="text-3">Overlay</span>
              <select className="input input--sm" value={p.overlay ?? ""} onChange={(e) => p.onOverlay((e.target.value || null) as GuideShape | null)}>
                <option value="">None</option>
                <ShapeOptions />
              </select>
            </label>
            <button className={`flag flag--lg${p.clip ? " is-on" : ""}`} aria-pressed={p.clip} disabled={!p.overlay}
              title="Mask the artwork with the overlay shape" onClick={() => p.onClip(!p.clip)}>Mask</button>
            <button className={`flag flag--lg${p.guides ? " is-on" : ""}`} aria-pressed={p.guides} disabled={!dp}
              title="Show the grid, live area and keylines" onClick={() => p.onGuides(!p.guides)}>Grid</button>
            <button className="btn btn--icon" aria-label="Close Quickview" title="Close (Esc)" onClick={() => p.onClose(item.id)}><IconX /></button>
          </div>
        </header>

        <div className="quickview__body">
          <div className={`quickview__stage thumb--${p.backdrop}`}>
            <div key={item.id} className={`quickview__canvas thumb__canvas${dir ? ` is-${dir}` : ""}`} style={{ "--r": ratio } as CSSProperties}>
              <div className="quickview__art" style={artMask}>
                {showing && <img src={showing.src} alt={item.name} draggable={false} style={{ transform }} />}
              </div>
              {p.guides && dp && <GridGuides dp={dp} />}
              {overlay && <ShapeGuide shape={overlay} forced />}
              {peek && <span className="peek-badge">Before tuning</span>}
              {item.status === "running" && <span className="thumb__loading" />}
              {item.status === "error" && <span className="quickview__error">{item.error ?? "Couldn't optimise this file"}</span>}
            </div>
          </div>

          <aside className="quickview__side">
            <Group title="Move">
              <div className="dpad">
                <span />
                <button className="btn btn--secondary dpad__btn" aria-label="Move up" onClick={() => move(0, -1)}>↑</button>
                <span />
                <button className="btn btn--secondary dpad__btn" aria-label="Move left" onClick={() => move(-1, 0)}>←</button>
                <button className="btn btn--secondary dpad__btn" aria-label="Reset" title="Back to where it started" onClick={reset}><IconReset /></button>
                <button className="btn btn--secondary dpad__btn" aria-label="Move right" onClick={() => move(1, 0)}>→</button>
                <span />
                <button className="btn btn--secondary dpad__btn" aria-label="Move down" onClick={() => move(0, 1)}>↓</button>
                <span />
              </div>
            </Group>

            <Group title="Scale">
              <div className="quickview__scale">
                <button className="btn btn--secondary dpad__btn" aria-label="Smaller" onClick={() => scaleBy(-1)}>−</button>
                <button className="btn btn--secondary dpad__btn" aria-label="Bigger" onClick={() => scaleBy(1)}>+</button>
                <span className="text-3">{now ? `${fmtNum(now.w, 3)} × ${fmtNum(now.h, 3)} px` : ""}</span>
              </div>
            </Group>

            <Group title="Step">
              <div className="pills">
                {STEPS.map((s) => (
                  <button key={s} className={`pill-btn${step === s && !customStep ? " is-on" : ""}`} onClick={() => { setCustomStep(""); p.onStep(s) }}>{s}</button>
                ))}
                <input className={`input input--sm pills__custom${customStep ? " is-on" : ""}`} type="number" min={0} step="any" placeholder="Custom"
                  aria-label="Custom step" value={customStep}
                  onChange={(e) => {
                    setCustomStep(e.target.value)
                    const n = Number(e.target.value)
                    if (e.target.value && Number.isFinite(n) && n > 0) p.onStep(n)
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }} />
              </div>
              <p className="text-3 quickview__note">In viewBox units ({vb ? `${fmtNum(vb.w, 2)} × ${fmtNum(vb.h, 2)}` : "unknown"}). Scale steps grow the artwork's longest side.</p>
            </Group>

            <Group title="Fit">
              <div className="quickview__fit">
                <button className="btn btn--secondary btn--sm" title="Make the artwork as wide as the target" onClick={() => fit("w")}><IconFitW /> Width</button>
                <button className="btn btn--secondary btn--sm" title="Make the artwork as tall as the target" onClick={() => fit("h")}><IconFitH /> Height</button>
                <button className="btn btn--secondary btn--sm" title={stretch ? "Stretch the artwork to fill the target" : "Fit the artwork inside the target"} onClick={() => fit("both")}><IconFitBoth /> Both</button>
              </div>
              <div className="quickview__fit-opts">
                <Segmented<"keep" | "stretch"> label="Aspect ratio" value={stretch ? "stretch" : "keep"} onChange={(v) => setStretch(v === "stretch")}
                  options={[{ value: "keep", label: "Keep ratio", title: "Scale evenly, keeping the artwork's shape" }, { value: "stretch", label: "Stretch", title: "Scale width and height separately" }]} />
                <Segmented<"canvas" | "live"> label="Fit and align to" value={dp ? fitTo : "canvas"} onChange={setFitTo}
                  options={[{ value: "canvas", label: "Canvas", title: "The whole viewBox" }, { value: "live", label: "Live area", title: dp ? `${dp.name}'s live area, inside its padding` : "Pick a design principle for its live area" }]} />
              </div>
            </Group>

            <Group title="Align">
              <div className="align-grid" role="group" aria-label={`Align to the ${dp && fitTo === "live" ? "live area" : "canvas"}`}>
                {([-1, 0, 1] as const).flatMap((v) => ([-1, 0, 1] as const).map((h) => (
                  <button key={`${h}${v}`} className="btn btn--secondary align-grid__btn" onClick={() => align(h, v)}
                    aria-label={ALIGN_NAMES[`${v}${h}`]} title={ALIGN_NAMES[`${v}${h}`]}>
                    <span className="align-grid__dot" style={{ justifySelf: h < 0 ? "start" : h > 0 ? "end" : "center", alignSelf: v < 0 ? "start" : v > 0 ? "end" : "center" }} />
                  </button>
                )))}
              </div>
            </Group>

            <Group title="This file">
              <div className="quickview__values">
                <Value label="X" value={mine.x} onSet={(x) => change((a) => ({ ...a, x }), "set")} />
                <Value label="Y" value={mine.y} onSet={(y) => change((a) => ({ ...a, y }), "set")} />
                {mine.sy === undefined ? (
                  <Value label="Scale ×" value={mine.scale} min={0.0001} onSet={(scale) => change((a) => makeAdjust(scale, scale, a.x, a.y), "set")} />
                ) : <>
                  <Value label="Scale X ×" value={mine.scale} min={0.0001} onSet={(scale) => change((a) => makeAdjust(scale, syOf(a), a.x, a.y), "set")} />
                  <Value label="Scale Y ×" value={mine.sy} min={0.0001} onSet={(sy) => change((a) => makeAdjust(a.scale, sy, a.x, a.y), "set")} />
                </>}
              </div>
              {!isIdentity(base) && <p className="text-3 quickview__note">Plus the design principle's variation: {describe(base)}.</p>}
              <div className="quickview__actions">
                <button className="btn btn--ghost btn--sm" disabled={!history.undo.length} onClick={() => travel(true)}><IconUndo /> Undo</button>
                <button className="btn btn--ghost btn--sm" disabled={!history.redo.length} onClick={() => travel(false)}><IconRedo /> Redo</button>
                <button className="btn btn--ghost btn--sm" disabled={isIdentity(mine)} onClick={reset}><IconReset /> Reset</button>
              </div>
              <div className="quickview__actions">
                <button className="btn btn--ghost btn--sm" disabled={!previous} onClick={copyPrevious}
                  title={previous ? `Use ${previous.name}'s position and scale` : "This is the first file"}>Copy from previous</button>
                <button className="btn btn--ghost btn--sm" onClick={copyText}><IconCopy /> Copy</button>
                <button className="btn btn--ghost btn--sm" onClick={pasteFromClipboard}>Paste</button>
              </div>
              <button className="btn btn--secondary btn--sm quickview__apply" disabled={p.items.length < 2} onClick={applyAll}
                title={`Give every ${p.scope === "selected" ? "selected" : "listed"} SVG this file's position and scale`}>
                Apply to all {p.scope === "selected" ? "selected" : ""} <span className="run-group__count">{p.items.length}</span>
              </button>
            </Group>
          </aside>
        </div>

        <footer className={`quickview__foot${keysOpen ? " is-open" : ""}`}>
          <button className="link quickview__foot-toggle" aria-expanded={keysOpen} onClick={() => { setKeysOpen(!keysOpen); keysStore.set(!keysOpen) }}>
            {keysOpen ? "Hide shortcuts" : "Keyboard shortcuts"}
          </button>
          {keysOpen && (
            <ul className="quickview__keys text-3">
              <li><kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> or numpad <kbd>4</kbd><kbd>8</kbd><kbd>6</kbd><kbd>2</kbd> move</li>
              <li><kbd>+</kbd> <kbd>−</kbd> scale</li>
              <li><kbd>Shift</kbd> with either: ten steps</li>
              <li><kbd>Q</kbd> <kbd>W</kbd> previous and next file</li>
              <li><kbd>R</kbd> reset this file</li>
              <li>Hold <kbd>E</kbd> to see it before tuning</li>
              <li>Hold <kbd>T</kbd> to hide the overlay</li>
              <li><kbd>⌘Z</kbd> undo, <kbd>⇧⌘Z</kbd> redo</li>
              <li><kbd>⌘C</kbd> <kbd>⌘V</kbd> copy and paste the position and scale</li>
              <li><kbd>Esc</kbd> close</li>
            </ul>
          )}
        </footer>

        {asking && (
          <div className="modal-backdrop quickview__confirm" role="alertdialog" aria-modal="true"
            onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); asking.resolve(false); setAsking(null) } }}>
            <div className="modal">
              <h2 className="modal__title">{asking.title}</h2>
              <div className="modal__body">{asking.body}</div>
              <div className="modal__actions">
                <button className="btn btn--ghost" onClick={() => { asking.resolve(false); setAsking(null) }}>Cancel</button>
                <button className="btn btn--primary" autoFocus onClick={() => { asking.resolve(true); setAsking(null) }}>{asking.confirmLabel}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const ALIGN_NAMES: Record<string, string> = {
  "-1-1": "Top left", "-10": "Top", "-11": "Top right",
  "0-1": "Left", "00": "Centre", "01": "Right",
  "1-1": "Bottom left", "10": "Bottom", "11": "Bottom right"
}

const IconFitW = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M1.5 3v10M14.5 3v10M4 8h8M6 6 4 8l2 2M10 6l2 2-2 2" /></svg>
const IconFitH = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 1.5h10M3 14.5h10M8 4v8M6 6l2-2 2 2M6 10l2 2 2-2" /></svg>
const IconFitBoth = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" /><rect x="5" y="5" width="6" height="6" rx="1" /></svg>

function Group({ title, children }: { title: string, children: ReactNode }) {
  return (
    <section className="quickview__group">
      <div className="quickview__group-head"><span className="panel__label">{title}</span></div>
      {children}
    </section>
  )
}

/** A number that commits on Enter or blur */
function Value({ label, value, onSet, min = -1e6 }: { label: string, value: number, onSet: (n: number) => void, min?: number }) {
  const [text, setText] = useState<string | null>(null)
  const commit = () => {
    if (text === null) return
    const n = Number(text)
    if (text.trim() !== "" && Number.isFinite(n) && n >= min) onSet(n)
    setText(null)
  }
  return (
    <label className="quickview__value">
      <span className="text-3">{label}</span>
      <input className="input input--sm" type="number" step="any" value={text ?? String(+value.toFixed(4))}
        onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") { commit(); (e.target as HTMLInputElement).blur() } }} />
    </label>
  )
}
