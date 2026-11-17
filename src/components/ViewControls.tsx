import { IconCircle, IconClip, IconMoon, IconSun } from "../icons"
import type { Backdrop } from "../lib/types"
import { Segmented } from "./Segmented"

interface Props {
  size: number
  sizeRange: { min: number, max: number }
  onSize: (px: number) => void
  /** List view only: before and after thumbnails side by side */
  compare: boolean
  onCompare: () => void
  details: boolean
  onDetails: () => void
  backdrop: Backdrop
  onBackdrop: (b: Backdrop) => void
  circle: boolean
  onCircle: () => void
  clip: boolean
  onClip: () => void
  cssOpen: boolean
  cssActive: boolean
  onCssToggle: () => void
}

export function ViewControls({ size, sizeRange, onSize, compare, onCompare, details, onDetails, backdrop, onBackdrop, circle, onCircle, clip, onClip, cssOpen, cssActive, onCssToggle }: Props) {
  return (
    <div className="view-controls">
      <label className="view-size" title={`Preview size: ${size}px. Double-click to reset`}>
        <IconImageSm />
        <input type="range" aria-label="Preview size" min={sizeRange.min} max={sizeRange.max} step={4}
          value={Math.min(sizeRange.max, size)} onChange={(e) => onSize(Number(e.target.value))}
          onDoubleClick={() => onSize(-1)} />
        <IconImageLg />
      </label>
      <button type="button" className={`flag flag--lg${details ? " is-on" : ""}`} aria-pressed={details}
        title="Inspect: compact rows with dimensions, tags of what changed and each file's preset. Off: big before/after previews" onClick={onDetails}>
        Inspect
      </button>
      {details && (
        <button type="button" className={`flag flag--lg${compare ? " is-on" : ""}`} aria-pressed={compare}
          title="Show before and after thumbnails on each row" onClick={onCompare}>
          Before / after
        </button>
      )}
      <Segmented
        label="Preview background"
        value={backdrop}
        onChange={onBackdrop}
        options={[
          { value: "light", label: <IconSun />, title: "Light checkerboard" },
          { value: "dark", label: <IconMoon />, title: "Dark checkerboard" }
        ]}
      />
      <button type="button" className={`flag flag--lg${circle ? " is-on" : ""}`} aria-pressed={circle}
        title="Circle guide: shows what survives a circular crop, e.g. avatars" onClick={onCircle}>
        <IconCircle />
      </button>
      <button type="button" className={`flag flag--lg${clip ? " is-on" : ""}`} aria-pressed={clip}
        title="Clip previews to a circle, ignoring any whitespace outside it" onClick={onClip}>
        <IconClip />
      </button>
      <button type="button" className={`flag flag--lg${cssOpen ? " is-on" : ""}`} aria-pressed={cssOpen}
        title="Preview CSS: style the previews, e.g. set custom properties" onClick={onCssToggle}>
        CSS{cssActive && <span className="flag__dot" />}
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
