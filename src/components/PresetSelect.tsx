import type { Preset } from "../lib/types"

const DEFAULT = "__default__"
const NEW = "__new__"

interface Props {
  presets: Preset[]
  value: string | null
  onChange: (id: string | null) => void
  /** When set, offers a "Default (name)" option that maps to null */
  defaultPreset?: Preset
  /** When set, offers a "New preset…" option */
  onCreateNew?: () => void
  newLabel?: string
  label: string
  className?: string
}

export function PresetSelect({ presets, value, onChange, defaultPreset, onCreateNew, newLabel, label, className }: Props) {
  const current = value ?? (defaultPreset ? DEFAULT : presets[0]?.id)
  return (
    <select
      className={`select ${className ?? ""}`}
      aria-label={label}
      value={current}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        const v = e.target.value
        if (v === NEW) onCreateNew?.()
        else onChange(v === DEFAULT ? null : v)
      }}
    >
      {defaultPreset && <option value={DEFAULT}>{defaultLabel(defaultPreset)}</option>}
      {presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      {onCreateNew && (
        <>
          <option disabled>──────────</option>
          <option value={NEW}>{newLabel ?? "New preset…"}</option>
        </>
      )}
    </select>
  )
}

export const defaultLabel = (p: Preset) => (p.name.toLowerCase() === "default" ? "Default" : `Default (${p.name})`)
