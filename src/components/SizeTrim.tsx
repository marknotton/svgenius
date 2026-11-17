import { useEffect, useState } from "react"
import { SCALE_LIMITS, validScale } from "../lib/settings"
import type { TrimSettings } from "../lib/types"
import { Segmented } from "./Segmented"
import { SliderField } from "./SliderField"
import { Toggle } from "./Toggle"

// ── Size & trim ───────────────────────────────────────────────────────────────

interface Props {
  trim: TrimSettings
  onChange: (patch: Partial<TrimSettings>) => void
}

export function SizeTrim({ trim, onChange }: Props) {
  return (
    <>
      <div className="plugins__head">
        <span className="panel__label">Size &amp; trim</span>
        <button className="link" disabled={!trim.enabled && trim.scale === 1}
          title="Padding back to 0 and scale back to 1"
          onClick={() => onChange({ padding: 0, scale: 1 })}>Reset</button>
      </div>

      <ScaleField value={trim.scale} onChange={(scale) => onChange({ scale })} />

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

/** Free-typed scale factor with validation, e.g. 2, 0.5, 0.002 */
function ScaleField({ value, onChange }: { value: number, onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => { setDraft(String(value)) }, [value])
  const parsed = validScale(draft)
  const invalid = draft.trim() !== "" && parsed === null

  return (
    <div className="range" title="Multiplies the exported width and height. The artwork scales with them.">
      <span className="range__label">Scale</span>
      <span className="toolbar__spacer" />
      <span className="text-3 scale__x">×</span>
      <input
        className={`input input--sm scale__input${invalid ? " is-invalid" : ""}`}
        inputMode="decimal"
        value={draft}
        aria-label="Scale"
        aria-invalid={invalid}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = validScale(e.target.value)
          if (n !== null) onChange(n)
        }}
        onBlur={() => { if (parsed === null) setDraft(String(value)) }}
      />
      {invalid && <span className="scale__error">Use a number from {SCALE_LIMITS.min} to {SCALE_LIMITS.max}</span>}
    </div>
  )
}
