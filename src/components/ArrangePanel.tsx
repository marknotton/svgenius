import { useState, type ReactNode } from "react"
import { IconAlignBottom, IconAlignHCentre, IconAlignLeft, IconAlignRight, IconAlignTop, IconAlignVMiddle, IconExclude, IconIntersect, IconMinusFront, IconMore, IconUnite } from "../icons"
import { alignTarget } from "../lib/arrange"
import type { EditorAction } from "../lib/editorActions"
import type { MenuItem, MenuState } from "./ContextMenu"

// ── Align and Pathfinder ──────────────────────────────────────────────────────
// Icon rows for the panel actions in the registry. Anything that doesn't
// apply to the current selection is greyed out rather than hidden, so the
// rows don't jump about. ··· holds distribute.

const ICONS: Record<string, ReactNode> = {
  "align-left": <IconAlignLeft />, "align-hcentre": <IconAlignHCentre />, "align-right": <IconAlignRight />,
  "align-top": <IconAlignTop />, "align-vmiddle": <IconAlignVMiddle />, "align-bottom": <IconAlignBottom />,
  "pathfinder-unite": <IconUnite />, "pathfinder-minusFront": <IconMinusFront />,
  "pathfinder-intersect": <IconIntersect />, "pathfinder-exclude": <IconExclude />
}

interface Props {
  /** Every panel action, and which of them apply right now */
  all: EditorAction[]
  applies: (a: EditorAction) => boolean
  run: (a: EditorAction) => void
  count: number
  onMenu: (menu: MenuState) => void
}

export function ArrangePanel({ all, applies, run, count, onMenu }: Props) {
  const row = (panel: EditorAction["panel"]) => all.filter((a) => a.panel === panel)
  const button = (a: EditorAction) => (
    <button key={a.id} className="btn btn--icon arrange__btn" disabled={!applies(a)} onClick={() => run(a)}
      title={a.hint ?? a.label} aria-label={a.label}>{ICONS[a.id]}</button>
  )
  const more = (e: React.MouseEvent, items: Array<MenuItem | "-">) => {
    const r = e.currentTarget.getBoundingClientRect()
    onMenu({ x: r.left, y: r.bottom + 4, items })
  }
  const [target, setTargetState] = useState(alignTarget.get)
  const setTarget = (t: "selection" | "canvas") => { alignTarget.set(t); setTargetState(t) }
  // One element has nothing else to line up with, so it always uses the viewBox
  const toCanvas = count === 1 || target === "canvas"
  return (
    <div className="arrange">
      <div className="arrange__group">
        <div className="arrange__head">
          <span className="panel__label">Align to</span>
          <div className="segmented segmented--xs" role="radiogroup" aria-label="Align relative to">
            <button type="button" role="radio" aria-checked={toCanvas} className={`segmented__opt${toCanvas ? " is-active" : ""}`}
              title="Line things up with the edges and centre of the viewBox" onClick={() => setTarget("canvas")}>viewBox</button>
            <button type="button" role="radio" aria-checked={!toCanvas} disabled={count === 1}
              className={`segmented__opt${!toCanvas ? " is-active" : ""}`}
              title={count === 1 ? "Select two or more items to line them up with each other" : "Line the selected items up with each other"}
              onClick={() => setTarget("selection")}>Selection</button>
          </div>
        </div>
        <div className="arrange__row">
          {row("align").map(button)}
          <button className="btn btn--icon arrange__btn" title="Distribute" aria-label="Distribute options"
            onClick={(e) => more(e, row("distribute").map((a) => ({ label: a.label, disabled: !applies(a), run: () => run(a) })))}><IconMore /></button>
        </div>
      </div>
      <div className="arrange__group">
        <span className="panel__label">Pathfinder</span>
        <div className="arrange__row">
          {row("pathfinder").map(button)}
        </div>
      </div>
    </div>
  )
}
