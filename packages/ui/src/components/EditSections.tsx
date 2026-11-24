import { validScale } from "@marknotton/svgenius-core/settings"
import type { TrimSettings } from "@marknotton/svgenius-core/types"
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
  const pristine = !trim.enabled && trim.scale === 1 && trim.sizeUnit === "%" && trim.padding === 0
  return (
    <>
      <div className="plugins__head">
        <span className="panel__label">Edit viewBox</span>
        <button className="link" disabled={pristine} title="Size back to 1×, trim off"
          onClick={() => onChange({ enabled: false, padding: 0, scale: 1, sizeUnit: "%" })}>Reset</button>
      </div>
      <p className="rules__empty text-3">Changes the SVG's canvas (its width, height and viewBox), not the artwork. Previews scale to fit, so the artwork may look no different. The new size shows in each file's dimensions.</p>
      {trim.sizeUnit === "%" ? (
        <SliderField label="Size" value={+(trim.scale * 100).toFixed(4)} min={10} max={400} step={5} suffix="%" accept={(n) => isScale(n / 100)}
          hint="Scales the width and height. The viewBox doesn't change, so the artwork grows with it. Click the number to type any value."
          onChange={(pct) => { if (isScale(pct / 100)) onChange({ scale: pct / 100 }) }} />
      ) : (
        <SliderField label={trim.sizeSide === "width" ? "Width" : "Height"} value={trim.sizePx} min={8} max={512} step={1} suffix="px"
          accept={(n) => n > 0 && n <= 1e5}
          hint={`Every file gets this exact ${trim.sizeSide}. The ${trim.sizeSide === "width" ? "height" : "width"} follows each file's aspect ratio. Click the number to type any value.`}
          onChange={(sizePx) => { if (sizePx > 0) onChange({ sizePx }) }} />
      )}
      <div className="trim-unit">
        <span className="text-3">{trim.sizeUnit === "%" ? "% of each file's own size" : `Fixed ${trim.sizeSide}, the other side follows`}</span>
        {trim.sizeUnit === "px" && (
          <Segmented label="Fixed side" value={trim.sizeSide} onChange={(sizeSide) => onChange({ sizeSide })}
            options={[{ value: "width", label: "W" , title: "Fix the width" }, { value: "height", label: "H", title: "Fix the height" }]} />
        )}
        <Segmented label="Size unit" value={trim.sizeUnit} onChange={(sizeUnit) => onChange({ sizeUnit })}
          options={[{ value: "%", label: "%" }, { value: "px", label: "px" }]} />
      </div>
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

export function EditContents({ trim, onChange, markup, onMarkup }: Props & { markup: string, onMarkup: (v: string) => void }) {
  const pristine = trim.artScale === 1 && trim.offsetX === 0 && trim.offsetY === 0 && !markup.trim()
  return (
    <>
      <div className="plugins__head">
        <span className="panel__label">Edit contents</span>
        <button className="link" disabled={pristine} title="Artwork back to normal, extra markup cleared"
          onClick={() => { onChange({ artScale: 1, offsetX: 0, offsetY: 0 }); onMarkup("") }}>Reset</button>
      </div>
      <p className="rules__empty text-3">The drawing inside the viewBox. The SVG's size stays the same, unless Trim is on: trimming happens after these, so the viewBox still hugs the artwork.</p>
      <ArtworkFields scale={trim.artScale} x={trim.offsetX} y={trim.offsetY}
        onChange={(p) => onChange({
          ...(p.scale !== undefined && { artScale: p.scale }),
          ...(p.x !== undefined && { offsetX: p.x }),
          ...(p.y !== undefined && { offsetY: p.y })
        })} />
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
