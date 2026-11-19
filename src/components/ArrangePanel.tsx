import type { ReactNode } from "react"
import { IconAlignBottom, IconAlignHCentre, IconAlignLeft, IconAlignRight, IconAlignTop, IconAlignVMiddle, IconExclude, IconIntersect, IconMinusFront, IconMore, IconUnite } from "../icons"
import { alignTarget } from "../lib/arrange"
import type { EditorAction } from "../lib/editorActions"
import type { MenuItem, MenuState } from "./ContextMenu"

// ── Align and Pathfinder ──────────────────────────────────────────────────────
// Icon rows for the panel actions in the registry. Anything that doesn't
// apply to the current selection is greyed out rather than hidden, so the
// rows don't jump about. ··· holds the rest: distribute and align target.

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
  const target = alignTarget.get()
  return (
    <div className="arrange">
      <div className="arrange__group">
        <span className="panel__label">Align {count === 1 ? <span className="text-3">to canvas</span> : target === "canvas" ? <span className="text-3">to canvas</span> : null}</span>
        <div className="arrange__row">
          {row("align").map(button)}
          <button className="btn btn--icon arrange__btn" title="Distribute, and what to align to" aria-label="More align options"
            onClick={(e) => more(e, [
              ...row("distribute").map((a) => ({ label: a.label, disabled: !applies(a), run: () => run(a) })),
              "-",
              { label: `${target === "selection" ? "✓ " : ""}Align to the selection`, run: () => alignTarget.set("selection") },
              { label: `${target === "canvas" ? "✓ " : ""}Align to the canvas`, run: () => alignTarget.set("canvas") }
            ])}><IconMore /></button>
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
