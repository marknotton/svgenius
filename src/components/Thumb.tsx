import { memo } from "react"
import { svgDataUrl } from "../lib/format"
import type { Backdrop } from "../lib/types"

interface Props {
  svg?: string
  size: number
  backdrop: Backdrop
  label?: string
}

/** SVG preview on a transparent-style checkerboard. Rendered via <img>, so scripts never run. */
export const Thumb = memo(function Thumb({ svg, size, backdrop, label }: Props) {
  return (
    <div className={`thumb thumb--${backdrop}`} style={{ width: size, height: size }}>
      {svg !== undefined && (
        <img key={svg.length} src={svgDataUrl(svg)} alt={label ?? ""} draggable={false}
          onError={(e) => { e.currentTarget.style.visibility = "hidden" }} />
      )}
    </div>
  )
})

export const THUMB_PX = { tiny: 32, medium: 64, large: 128 } as const
export const REVIEW_PX = { tiny: 140, medium: 220, large: 340 } as const
