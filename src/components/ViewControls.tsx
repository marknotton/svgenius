import { IconCircle, IconClip, IconMoon, IconSun } from "../icons"
import type { Backdrop, ThumbSize } from "../lib/types"
import { Segmented } from "./Segmented"

interface Props {
  thumbSize: ThumbSize
  backdrop: Backdrop
  onThumbSize: (s: ThumbSize) => void
  onBackdrop: (b: Backdrop) => void
  circle: boolean
  onCircle: () => void
  clip: boolean
  onClip: () => void
  cssOpen: boolean
  cssActive: boolean
  onCssToggle: () => void
}

export function ViewControls({ thumbSize, backdrop, onThumbSize, onBackdrop, circle, onCircle, clip, onClip, cssOpen, cssActive, onCssToggle }: Props) {
  return (
    <div className="view-controls">
      <Segmented
        label="Preview size"
        value={thumbSize}
        onChange={onThumbSize}
        options={[
          { value: "tiny", label: "S", title: "Tiny previews" },
          { value: "medium", label: "M", title: "Medium previews" },
          { value: "large", label: "L", title: "Large previews" }
        ]}
      />
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
