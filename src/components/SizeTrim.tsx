import { validScale } from "../lib/settings"
import type { TrimSettings } from "../lib/types"
import { Segmented } from "./Segmented"
import { SliderField } from "./SliderField"
import { Toggle } from "./Toggle"

// ── Edit: size, artwork transform and trim, for every file using the preset ──

interface Props {
  trim: TrimSettings
  onChange: (patch: Partial<TrimSettings>) => void
}

const isScale = (n: number) => validScale(n) !== null

export const isDefaultEdit = (t: TrimSettings) =>
  !t.enabled && t.scale === 1 && t.artScale === 1 && t.offsetX === 0 && t.offsetY === 0

export function SizeTrim({ trim, onChange }: Props) {
  return (
    <>
      <div className="plugins__head">
        <span className="panel__label">Edit</span>
        <button className="link" disabled={isDefaultEdit(trim) && trim.padding === 0}
          title="Size, artwork scale and position back to normal, trim off"
          onClick={() => onChange({ enabled: false, padding: 0, scale: 1, artScale: 1, offsetX: 0, offsetY: 0 })}>Reset</button>
      </div>

      <div className="edit-group__label text-3" title="The SVG itself: its width, height and viewBox">Canvas · viewBox</div>
      <SliderField label="Size" value={trim.scale} min={0.1} max={4} step={0.05} suffix="×" accept={isScale}
        hint="Scales the whole SVG: width and height change, the viewBox doesn't, so the artwork grows with it. Click the number to type any value."
        onChange={(scale) => { if (isScale(scale)) onChange({ scale }) }} />
      <Toggle label="Trim whitespace" hint="Crops the viewBox to the visible artwork (strokes and effects included)"
        checked={trim.enabled} onChange={(enabled) => onChange({ enabled })} />
      {trim.enabled && (
        <>
          <SliderField
            label="Padding"
            hint="0 = artwork touches the edges. Positive adds space, negative crops in. Click the number to type any value."
            value={trim.padding}
            min={trim.unit === "%" ? -25 : -50}
            max={trim.unit === "%" ? 50 : 100}
            step={trim.unit === "%" ? 1 : 0.5}
            suffix={trim.unit}
            onChange={(padding) => onChange({ padding })}
          />
          <div className="trim-unit">
            <span className="text-3">{trim.unit === "%" ? "% of the artwork's longest side" : "viewBox units"}</span>
            <Segmented label="Padding unit" value={trim.unit} onChange={(unit) => onChange({ unit })}
              options={[{ value: "%", label: "%" }, { value: "px", label: "px" }]} />
          </div>
          <div className="trim-unit">
            <span className="text-3">{trim.aspect === "fit" ? "viewBox hugs the artwork" : "Keeps the original aspect ratio"}</span>
            <Segmented label="Aspect ratio" value={trim.aspect} onChange={(aspect) => onChange({ aspect })}
              options={[
                { value: "fit", label: "Fit content", title: "Ignore the original aspect ratio, fit the artwork exactly" },
                { value: "preserve", label: "Preserve ratio", title: "Keep the original aspect ratio, centring the artwork" }
              ]} />
          </div>
        </>
      )}

      <div className="edit-group__label text-3" title="The drawing inside the viewBox">Artwork · inside the viewBox</div>
      <ArtworkFields scale={trim.artScale} x={trim.offsetX} y={trim.offsetY}
        onChange={(p) => onChange({
          ...(p.scale !== undefined && { artScale: p.scale }),
          ...(p.x !== undefined && { offsetX: p.x }),
          ...(p.y !== undefined && { offsetY: p.y })
        })} />
    </>
  )
}

/** Scale and move the drawing inside its viewBox. Shared by presets and single files */
export function ArtworkFields({ scale, x, y, onChange }: {
  scale: number, x: number, y: number
  onChange: (p: { scale?: number, x?: number, y?: number }) => void
}) {
  return (
    <>
      <SliderField label="Scale" value={scale} min={0.05} max={3} step={0.01} suffix="×" accept={isScale}
        hint="Scales the artwork inside the viewBox, around its centre. The SVG's size stays the same. Click the number to type any value."
        onChange={(v) => { if (isScale(v)) onChange({ scale: v }) }} />
      <SliderField label="X" value={x} min={-50} max={50} step={0.5} suffix="%" hint="Moves the artwork left/right, as % of the viewBox width"
        onChange={(v) => onChange({ x: v })} />
      <SliderField label="Y" value={y} min={-50} max={50} step={0.5} suffix="%" hint="Moves the artwork up/down, as % of the viewBox height"
        onChange={(v) => onChange({ y: v })} />
    </>
  )
}
