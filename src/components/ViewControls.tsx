import { IconCircle, IconClip } from "../icons"
import { CanvasBackground } from "./CanvasBackground"

interface Props {
  size: number
  sizeRange: { min: number, max: number }
  onSize: (px: number) => void
  details: boolean
  onDetails: () => void
  circle: boolean
  onCircle: () => void
  clip: boolean
  onClip: () => void
  cssOpen: boolean
  cssActive: boolean
  onCssToggle: () => void
}

export function ViewControls({ size, sizeRange, onSize, details, onDetails, circle, onCircle, clip, onClip, cssOpen, cssActive, onCssToggle }: Props) {
  return (
    <div className="view-controls">
      <label className="view-size" title={`Preview size: ${size}px. Double-click to reset`}>
        <IconImageSm />
        <input type="range" aria-label="Preview size" min={sizeRange.min} max={sizeRange.max} step={4}
          value={Math.min(sizeRange.max, size)} onChange={(e) => onSize(Number(e.target.value))}
          onDoubleClick={() => onSize(-1)} />
        <IconImageLg />
      </label>
      {/* Names the view you're in; click to switch to the other one */}
      <button type="button" className="flag flag--lg view-mode" onClick={onDetails}
        title={details
          ? "List view: compact rows with dimensions, tags of what changed and each file's preset. Click for Compare view"
          : "Compare view: big side-by-side before and after previews. Click for List view"}>
        {details ? "List view" : "Compare view"}
      </button>
      <CanvasBackground />
      <div className="btn-join">
        <button type="button" className={`flag flag--lg${circle ? " is-on" : ""}`} aria-pressed={circle}
          title="Circle guide: shows what survives a circular crop, e.g. avatars" onClick={onCircle}>
          <IconCircle />
        </button>
        <button type="button" className={`flag flag--lg${clip ? " is-on" : ""}`} aria-pressed={clip}
          title="Clip previews to a circle, ignoring any whitespace outside it" onClick={onClip}>
          <IconClip />
        </button>
      </div>
      <button type="button" className={`flag flag--lg${cssOpen ? " is-on" : ""}`} aria-pressed={cssOpen}
        title="Preview CSS: style the previews, e.g. set custom properties" onClick={onCssToggle}>
        Inject CSS{cssActive && <span className="flag__dot" />}
      </button>
    </div>
  )
}

const IconImageSm = () => (
  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="2" /></svg>
)
const IconImageLg = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="2" /></svg>
)
