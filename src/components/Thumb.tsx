import { memo, useMemo, type CSSProperties } from "react"
import { svgDataUrl } from "../lib/format"
import { svgSize } from "../lib/svgRoot"
import type { Backdrop } from "../lib/types"
import { usePreviewCss, withPreviewCss } from "./PreviewCss"

interface Props {
  svg?: string
  size: number
  backdrop: Backdrop
  label?: string
}

/**
 * SVG preview. The checkerboard covers the SVG's own canvas, at its real aspect
 * ratio, so whitespace (or the lack of it) is visible. Rendered via <img>, so
 * scripts never run.
 */
export const Thumb = memo(function Thumb({ svg, size, backdrop, label }: Props) {
  const css = usePreviewCss()
  const src = useMemo(() => (svg === undefined ? undefined : svgDataUrl(withPreviewCss(svg, css))), [svg, css])
  const dims = useMemo(() => svgSize(svg), [svg])
  const ratio = dims && dims.w > 0 && dims.h > 0 ? dims.w / dims.h : 1
  // Container units keep the canvas fitted however the thumb itself is sized
  const canvas = { "--r": ratio } as CSSProperties
  return (
    <div className={`thumb thumb--${backdrop}`} style={{ width: size, height: size }}>
      <div className="thumb__canvas" style={canvas}>
        {src !== undefined && (
          <img key={src.length} src={src} alt={label ?? ""} draggable={false}
            onError={(e) => { e.currentTarget.style.visibility = "hidden" }} />
        )}
      </div>
    </div>
  )
})
