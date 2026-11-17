import { IconMoon, IconSun } from "../icons"
import type { Backdrop, ThumbSize } from "../lib/types"
import { Segmented } from "./Segmented"

interface Props {
  thumbSize: ThumbSize
  backdrop: Backdrop
  onThumbSize: (s: ThumbSize) => void
  onBackdrop: (b: Backdrop) => void
}

export function ViewControls({ thumbSize, backdrop, onThumbSize, onBackdrop }: Props) {
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
    </div>
  )
}
