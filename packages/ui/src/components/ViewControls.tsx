import type { GuideShape } from "@marknotton/svgenius-core/shapes"
import { GUIDE_SHAPES } from "@marknotton/svgenius-core/shapes"
import { ShapeIcon, ShapeOptions } from "./ShapeGuide"
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
  /** The guide and clip shape; without onShape there's no shape picker */
  shape?: GuideShape
  onShape?: (shape: GuideShape) => void
  /** Opens Quick Edit on the current file */
  onQuickview?: () => void
  /** Design principle guides over thumbnails; without onGuides there's no button */
  guides?: boolean
  onGuides?: () => void
  /** Alignment keylines over the previews too (only with guides on) */
  alignment?: boolean
  onAlignment?: () => void
}

export function ViewControls({ size, sizeRange, onSize, details, onDetails, circle, onCircle, clip, onClip, cssOpen, cssActive, onCssToggle, shape, onShape, onQuickview, guides, onGuides, alignment, onAlignment }: Props) {
  const name = (GUIDE_SHAPES.find((s) => s.value === shape)?.label ?? "Circle").toLowerCase()
  return (
    <div className="view-controls">
      <label className="view-size" title={`Preview size: ${size}px. Double-click to reset`}>
        <IconImageSm />
        <input type="range" aria-label="Preview size" min={sizeRange.min} max={sizeRange.max} step={4}
          value={Math.min(sizeRange.max, size)} onChange={(e) => onSize(Number(e.target.value))}
          onDoubleClick={() => onSize(-1)} />
        <IconImageLg />
      </label>
      {/* Names the view it switches to */}
      <button type="button" className="flag flag--lg view-mode" onClick={onDetails}
        title={details
          ? "Switch to Compare view: big side-by-side before and after previews"
          : "Switch to List view: compact rows with dimensions, tags of what changed and each file's preset"}>
        {details ? "Compare view" : "List view"}
      </button>
      <CanvasBackground />
      <div className="btn-join">
        <button type="button" className={`flag flag--lg${circle ? " is-on" : ""}`} aria-pressed={circle}
          title={`Shape guide: shows what survives a ${name} crop, e.g. avatars and app icons`} onClick={onCircle}>
          <ShapeIcon shape={shape} dashed />
        </button>
        <button type="button" className={`flag flag--lg${clip ? " is-on" : ""}`} aria-pressed={clip}
          title={`Clip previews to the ${name}, ignoring any whitespace outside it`} onClick={onClip}>
          <ShapeIcon shape={shape} />
        </button>
        {onShape && (
          <select className="flag flag--lg shape-select" aria-label="Guide shape" title="The shape the guide and clip use, everywhere"
            value={shape ?? "circle"} onChange={(e) => onShape(e.target.value as GuideShape)}>
            <ShapeOptions />
          </select>
        )}
      </div>
      {onGuides && <span className={onAlignment ? "flag-pair" : "flag-pair flag-pair--single"}>
        <button type="button" className={`flag flag--lg${guides ? " is-on" : ""}`} aria-pressed={guides}
          title="Design principle: draw each preset's grid, live area and keylines over the previews" onClick={onGuides}>
          <IconGridSm />
        </button>
      {onAlignment && (
        <button type="button" className={`flag flag--lg${guides && alignment ? " is-on" : ""}`} aria-pressed={!!(guides && alignment)} disabled={!guides}
          title={guides ? "Alignment keylines: the design principle's reference guides (centre circle, diagonals…) over the previews" : "Alignment keylines: turn on the design principle guides first"}
          aria-label="Alignment keylines" onClick={onAlignment}>
          <IconAlignGuides />
        </button>
      )}
      </span>}
      {onQuickview && (
        <button type="button" className="flag flag--lg" onClick={onQuickview}
          title="Quick Edit: fine-tune each file's position and scale against a design principle's grid (Space)">
          Quick Edit
        </button>
      )}
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
const IconGridSm = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
    <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" /><path d="M6 1.5v13M10 1.5v13M1.5 6h13M1.5 10h13" opacity=".55" /><circle cx="8" cy="8" r="4" />
  </svg>
)

/** A square with its diagonals and a small centre circle */
function IconAlignGuides() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="1" /><path d="M2 2l12 12M14 2 2 14" strokeWidth=".9" /><circle cx="8" cy="8" r="2.6" />
    </svg>
  )
}
