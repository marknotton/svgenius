import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { adjustFromText, adjustToText, composeAdjust, diffAdjust, IDENTITY, isIdentity } from "@marknotton/svgenius-core/designPrinciples"
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
}

/** Another dialog (Design principles, say) is open on top */
const covered = () => document.querySelectorAll(".modal").length > 1

interface Entry { id: string, before: ArtAdjust, after: ArtAdjust, kind: string, t: number }

const STEPS = [1, 0.1, 0.01]
const own = (item: SvgItem | undefined) => item?.adjust ?? IDENTITY
const tidy = (a: ArtAdjust): ArtAdjust => ({ scale: +a.scale.toFixed(6), x: +a.x.toFixed(4), y: +a.y.toFixed(4) })
const same = (a: ArtAdjust, b: ArtAdjust) => a.scale === b.scale && a.x === b.x && a.y === b.y

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
    if (!(after.scale > 0) || same(before, after)) return
    const now = Date.now()
    setHistory((h) => {
      const last = h.undo[h.undo.length - 1]
      if (last && last.id === it.id && last.kind === kind && kind !== "set" && now - last.t < 700) {
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
    // Show the file the step belongs to
    if (entry.id !== itemRef.current?.id && live.current.items.some((i) => i.id === entry.id)) { setDir(null); setId(entry.id) }
    return true
  }, [commit])

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
  const [artSize, setArtSize] = useState<number | null>(null)
  const move = useCallback((dx: number, dy: number, mult = 1) => {
    const s = live.current.step * mult
    change((a) => ({ ...a, x: a.x + dx * s, y: a.y + dy * s }), "move")
  }, [change])
  /** Grows or shrinks the artwork by the step, in viewBox units of its longest side */
  const artRef = useRef<number | null>(null)
  const scaleBy = useCallback((sign: 1 | -1, mult = 1) => {
    const s = live.current.step * mult
    const it = itemRef.current
    const vb = viewBoxOf(it?.result?.output ?? it?.source)
    // The artwork's size before this file's own tuning
    const base = artRef.current ?? (vb ? Math.max(vb.w, vb.h) : 100)
    change((a) => {
      const size = base * a.scale
      return { ...a, scale: Math.max(0.01, a.scale * Math.max(size * 0.01, size + sign * s) / size) }
    }, "scale")
  }, [change])

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

  // The artwork's size before this file's tuning, for the px readout and scale steps
  useEffect(() => {
    if (!output || !item) { artRef.current = null; setArtSize(null); return }
    let cancelled = false
    const scaleNow = (item.result?.adjust ?? IDENTITY).scale
    artworkBounds(output).then((b) => {
      if (cancelled) return
      const size = b ? Math.max(b.w, b.h) / scaleNow : null
      artRef.current = size
      setArtSize(size)
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
    ? `translate(${(delta.x / vb.w) * 100}%, ${(delta.y / vb.h) * 100}%) scale(${delta.scale})`
    : undefined
  const dp = p.principleFor(item)
  const overlay = p.overlay && !hideOverlay ? p.overlay : null
  const artMask = p.clip && p.overlay ? { WebkitMaskImage: shapeMaskUrl(p.overlay), maskImage: shapeMaskUrl(p.overlay) } as CSSProperties : undefined
  const total = composeAdjust(base, mine)

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
            <Group title="Move" keys="Arrows or numpad 8 4 6 2">
              <div className="dpad">
                <span />
                <button className="btn btn--secondary dpad__btn" aria-label="Move up" title="Up (↑ or 8)" onClick={() => move(0, -1)}>↑</button>
                <span />
                <button className="btn btn--secondary dpad__btn" aria-label="Move left" title="Left (← or 4)" onClick={() => move(-1, 0)}>←</button>
                <button className="btn btn--secondary dpad__btn" aria-label="Reset" title="Back to where it started (R)" onClick={reset}><IconReset /></button>
                <button className="btn btn--secondary dpad__btn" aria-label="Move right" title="Right (→ or 6)" onClick={() => move(1, 0)}>→</button>
                <span />
                <button className="btn btn--secondary dpad__btn" aria-label="Move down" title="Down (↓ or 2)" onClick={() => move(0, 1)}>↓</button>
                <span />
              </div>
            </Group>

            <Group title="Scale" keys="+ and −">
              <div className="quickview__scale">
                <button className="btn btn--secondary dpad__btn" aria-label="Smaller" title="Smaller (−)" onClick={() => scaleBy(-1)}>−</button>
                <button className="btn btn--secondary dpad__btn" aria-label="Bigger" title="Bigger (+)" onClick={() => scaleBy(1)}>+</button>
                <span className="text-3">{artSize ? `${fmtNum(artSize * total.scale, 3)} px artwork` : ""}</span>
              </div>
            </Group>

            <Group title="Step" keys="Shift × 10">
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

            <Group title="This file">
              <div className="quickview__values">
                <Value label="X" value={mine.x} onSet={(x) => change((a) => ({ ...a, x }), "set")} />
                <Value label="Y" value={mine.y} onSet={(y) => change((a) => ({ ...a, y }), "set")} />
                <Value label="Scale ×" value={mine.scale} min={0.0001} onSet={(scale) => change((a) => ({ ...a, scale }), "set")} />
              </div>
              {!isIdentity(base) && <p className="text-3 quickview__note">Plus the design principle's variation: ×{fmtNum(base.scale, 4)}, {fmtNum(base.x, 3)}, {fmtNum(base.y, 3)}.</p>}
              <div className="quickview__actions">
                <button className="btn btn--ghost btn--sm" title="Undo (⌘Z)" disabled={!history.undo.length} onClick={() => travel(true)}><IconUndo /> Undo</button>
                <button className="btn btn--ghost btn--sm" title="Redo (⇧⌘Z)" disabled={!history.redo.length} onClick={() => travel(false)}><IconRedo /> Redo</button>
                <button className="btn btn--ghost btn--sm" title="Back to where it started (R)" disabled={isIdentity(mine)} onClick={reset}><IconReset /> Reset</button>
              </div>
              <div className="quickview__actions">
                <button className="btn btn--ghost btn--sm" disabled={!previous} onClick={copyPrevious}
                  title={previous ? `Use ${previous.name}'s position and scale` : "This is the first file"}>Copy from previous</button>
              </div>
              <div className="quickview__actions">
                <button className="btn btn--ghost btn--sm" title="Copy this file's position and scale as JSON (⌘C)" onClick={copyText}><IconCopy /> Copy</button>
                <button className="btn btn--ghost btn--sm" title="Paste a position and scale (⌘V)" onClick={pasteFromClipboard}>Paste</button>
              </div>
            </Group>

            <ul className="quickview__keys text-3">
              <li><kbd>Q</kbd> <kbd>W</kbd> previous and next</li>
              <li>Hold <kbd>E</kbd> to see it before tuning</li>
              <li>Hold <kbd>T</kbd> to hide the overlay</li>
              <li><kbd>R</kbd> resets, <kbd>⌘Z</kbd> undoes</li>
            </ul>
          </aside>
        </div>
      </div>
    </div>
  )
}

function Group({ title, keys, children }: { title: string, keys?: string, children: ReactNode }) {
  return (
    <section className="quickview__group">
      <div className="quickview__group-head"><span className="panel__label">{title}</span>{keys && <span className="text-3">{keys}</span>}</div>
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
