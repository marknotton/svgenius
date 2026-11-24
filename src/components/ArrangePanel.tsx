import { useEffect, useRef, useState, type ReactNode } from "react"
import { IconAlignBottom, IconAlignHCentre, IconAlignLeft, IconAlignRight, IconAlignTop, IconAlignVMiddle, IconExclude, IconIntersect, IconMinusFront, IconMore, IconPin, IconUnite } from "../icons"
import { alignTarget } from "@svgenius/core/arrange"
import type { EditorAction } from "@svgenius/core/editorActions"
import type { MenuItem, MenuState } from "./ContextMenu"
import { Pop } from "./PaintTools"

// ── Align and Pathfinder ──────────────────────────────────────────────────────
// Toolbar buttons that open a floating panel, like Fill and Stroke. Pin a
// panel and its icons sit in the toolbar instead. Anything that doesn't apply
// to the selection is greyed out rather than hidden. ··· holds distribute.

const ICONS: Record<string, ReactNode> = {
  "align-left": <IconAlignLeft />, "align-hcentre": <IconAlignHCentre />, "align-right": <IconAlignRight />,
  "align-top": <IconAlignTop />, "align-vmiddle": <IconAlignVMiddle />, "align-bottom": <IconAlignBottom />,
  "pathfinder-unite": <IconUnite />, "pathfinder-minusFront": <IconMinusFront />,
  "pathfinder-intersect": <IconIntersect />, "pathfinder-exclude": <IconExclude />
}

type Group = "align" | "pathfinder"
const PIN_KEY = "svgenius:arrangePinned"
const readPins = (): Group[] => {
  try { const v = JSON.parse(localStorage.getItem(PIN_KEY) ?? "[]"); return Array.isArray(v) ? v.filter((g) => g === "align" || g === "pathfinder") : [] } catch { return [] }
}

interface Props {
  /** Every panel action, and which of them apply right now */
  all: EditorAction[]
  applies: (a: EditorAction) => boolean
  run: (a: EditorAction) => void
  count: number
  onMenu: (menu: MenuState) => void
  side: "top" | "left"
}

export function ArrangeTools({ all, applies, run, count, onMenu, side }: Props) {
  const [open, setOpen] = useState<Group | null>(null)
  const [pins, setPins] = useState<Group[]>(readPins)
  const togglePin = (g: Group) => {
    const next = pins.includes(g) ? pins.filter((x) => x !== g) : [...pins, g]
    setPins(next); setOpen(null)
    try { localStorage.setItem(PIN_KEY, JSON.stringify(next)) } catch { /* unavailable */ }
  }
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      const t = e.target as HTMLElement
      // The distribute menu floats outside the panel, so leave that alone
      if (!ref.current?.contains(t) && !t.closest?.(".context-menu")) setOpen(null)
    }
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(null) } }
    window.addEventListener("mousedown", close)
    window.addEventListener("keydown", key, true)
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", key, true) }
  }, [open])

  const row = (panel: EditorAction["panel"]) => all.filter((a) => a.panel === panel)
  const button = (a: EditorAction) => (
    <button key={a.id} className="btn btn--icon arrange__btn" disabled={!applies(a)} onClick={() => run(a)}
      title={a.hint ?? a.label} aria-label={a.label}>{ICONS[a.id]}</button>
  )
  const more = (e: React.MouseEvent, items: Array<MenuItem | "-">) => {
    const r = e.currentTarget.getBoundingClientRect()
    onMenu({ x: side === "left" ? r.right + 4 : r.left, y: side === "left" ? r.top : r.bottom + 4, items })
  }
  const [target, setTargetState] = useState(alignTarget.get)
  const setTarget = (t: "selection" | "canvas") => { alignTarget.set(t); setTargetState(t) }
  // One element has nothing else to line up with, so it always uses the viewBox
  const toCanvas = count === 1 || target === "canvas"
  const none = count === 0

  const alignTo = (
    <div className="segmented segmented--xs" role="radiogroup" aria-label="Align relative to">
      <button type="button" role="radio" aria-checked={toCanvas} className={`segmented__opt${toCanvas ? " is-active" : ""}`}
        title="Line things up with the edges and centre of the viewBox" onClick={() => setTarget("canvas")}>viewBox</button>
      <button type="button" role="radio" aria-checked={!toCanvas} disabled={count === 1}
        className={`segmented__opt${!toCanvas ? " is-active" : ""}`}
        title={count === 1 ? "Select two or more items to line them up with each other" : "Line the selected items up with each other"}
        onClick={() => setTarget("selection")}>Selection</button>
    </div>
  )
  const alignIcons = <>
    {row("align").map(button)}
    <button className="btn btn--icon arrange__btn" title="Distribute" aria-label="Distribute options" disabled={none}
      onClick={(e) => more(e, row("distribute").map((a) => ({ label: a.label, disabled: !applies(a), run: () => run(a) })))}><IconMore /></button>
  </>
  const pinButton = (g: Group) => (
    <button type="button" className={`btn btn--icon arrange__pin${pins.includes(g) ? " is-on" : ""}`} aria-pressed={pins.includes(g)}
      title={pins.includes(g) ? "Unpin: tuck it back behind its toolbar button" : "Keep open: show these in the toolbar all the time"}
      onClick={() => togglePin(g)}><IconPin width={15} height={15} /></button>
  )

  const opener = (g: Group, icon: ReactNode, label: string) => (
    <span className="arrange__anchor tip-wrap" data-tip={none ? `${label}: select something first` : label}>
      <button type="button" className={`btn btn--secondary btn--sm edit-toolbar__btn${open === g ? " is-on" : ""}`} aria-expanded={open === g}
        aria-label={label} disabled={none} onClick={() => setOpen((o) => (o === g ? null : g))}>{icon}</button>
      {open === g && !none && (
        <Pop title={label} side={side} extra={pinButton(g)}>
          {g === "align"
            ? <><div className="arrange__head"><span className="text-3">Align to</span>{alignTo}</div><div className="arrange__row">{alignIcons}</div></>
            : <div className="arrange__row">{row("pathfinder").map(button)}</div>}
        </Pop>
      )}
    </span>
  )

  return (
    <div ref={ref} className={`arrange-tools arrange-tools--${side}`}>
      {pins.includes("align")
        ? <div className="arrange-inline" role="group" aria-label="Align">
            {side === "top" && alignTo}
            {alignIcons}
            {pinButton("align")}
          </div>
        : opener("align", <IconAlignHCentre width={14} height={14} />, "Align")}
      {pins.includes("pathfinder")
        ? <div className="arrange-inline" role="group" aria-label="Pathfinder">
            {row("pathfinder").map(button)}
            {pinButton("pathfinder")}
          </div>
        : opener("pathfinder", <IconUnite width={14} height={14} />, "Pathfinder")}
    </div>
  )
}
