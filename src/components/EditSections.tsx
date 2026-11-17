import { validScale } from "../lib/settings"
import type { TrimSettings } from "../lib/types"
import { Segmented } from "./Segmented"
import { SliderField } from "./SliderField"
import { Toggle } from "./Toggle"

// ── Edit viewBox (size, trim) and Edit contents (artwork transform, extra markup) ──

interface Props {
  trim: TrimSettings
  onChange: (patch: Partial<TrimSettings>) => void
}

const isScale = (n: number) => validScale(n) !== null

export function EditViewBox({ trim, onChange }: Props) {
  const pristine = !trim.enabled && trim.scale === 1 && trim.padding === 0
  return (
    <>
      <div className="plugins__head">
        <span className="panel__label">Edit viewBox</span>
        <button className="link" disabled={pristine} title="Size back to 1×, trim off"
          onClick={() => onChange({ enabled: false, padding: 0, scale: 1 })}>Reset</button>
      </div>
      <p className="rules__empty text-3">The SVG itself: its width, height and viewBox. New sizes flash on the rows.</p>
      <SliderField label="Size" value={trim.scale} min={0.1} max={4} step={0.05} suffix="×" accept={isScale}
        hint="Multiplies the width and height. The viewBox doesn't change, so the artwork grows with it. Click the number to type any value."
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
    </>
  )
}

export function EditContents({ trim, onChange, markup, onMarkup, merge, onMerge }: Props & { markup: string, onMarkup: (v: string) => void, merge: boolean, onMerge: (v: boolean) => void }) {
  const pristine = trim.artScale === 1 && trim.offsetX === 0 && trim.offsetY === 0 && !markup.trim()
  return (
    <>
      <div className="plugins__head">
        <span className="panel__label">Edit contents</span>
        <button className="link" disabled={pristine} title="Artwork back to normal, extra markup cleared"
          onClick={() => { onChange({ artScale: 1, offsetX: 0, offsetY: 0 }); onMarkup("") }}>Reset</button>
      </div>
      <p className="rules__empty text-3">The drawing inside the viewBox. The SVG's size stays the same.</p>
      <ArtworkFields scale={trim.artScale} x={trim.offsetX} y={trim.offsetY}
        onChange={(p) => onChange({
          ...(p.scale !== undefined && { artScale: p.scale }),
          ...(p.x !== undefined && { offsetX: p.x }),
          ...(p.y !== undefined && { offsetY: p.y })
        })} />
      <Toggle label="Merge overlapping transparency"
        hint="Shapes with their own opacity darken where they overlap. This moves the opacity onto a shared group so they paint as one layer"
        checked={merge} onChange={onMerge} />
      <label className="append-markup">
        <span className="range__label">Add markup</span>
        <textarea className="input input--mono" spellCheck={false} rows={3} value={markup}
          placeholder={'<title>Logo</title>  (added just before </svg>)'}
          onChange={(e) => onMarkup(e.target.value)} />
      </label>
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
