import { createContext, useContext } from "react"
import type { SvgItem } from "../lib/types"

// ── "Too complex to render" placeholder ───────────────────────────────────────

/** Lets any preview offer "Render anyway" without threading props through */
export const RenderAnywayContext = createContext<(id: string) => void>(() => {})

interface Props {
  item: SvgItem
  /** Fills a square preview of this size; omit to sit in a panel */
  size?: number
}

export function TooComplex({ item, size }: Props) {
  const force = useContext(RenderAnywayContext)
  const small = size !== undefined && size < 90
  return (
    <div className={`too-complex${size === undefined ? " too-complex--panel" : ""}`} style={size !== undefined ? { width: size, height: size } : undefined}
      title={`Not rendered: ${item.heavy}. Rendering it could freeze the app.`}>
      {!small && <span className="too-complex__title">Too complex to preview</span>}
      {!small && <span className="text-3">{item.heavy}</span>}
      <button className={`btn btn--secondary btn--sm${small ? " btn--ghost" : ""}`}
        onClick={(e) => { e.stopPropagation(); force(item.id) }}
        title="Preview, edit and optimise this file anyway. It could make the app slow or unresponsive">
        {small ? "Render" : "Render anyway"}
      </button>
    </div>
  )
}
