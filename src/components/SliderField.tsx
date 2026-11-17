import { useEffect, useRef, useState } from "react"

// ── Range slider with an editable value ───────────────────────────────────────
// The slider covers the sensible range; click the number to type anything.

interface Props {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  hint?: string
  onChange: (v: number) => void
}

export function SliderField({ label, value, min, max, step, suffix, hint, onChange }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!editing) setDraft(String(value)) }, [value, editing])
  useEffect(() => { if (editing) input.current?.select() }, [editing])

  const commit = () => {
    const n = Number(draft)
    if (draft.trim() !== "" && Number.isFinite(n)) onChange(n)
    setEditing(false)
  }

  return (
    <label className="range" title={hint}>
      <span className="range__label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))}
        onChange={(e) => onChange(Number(e.target.value))} />
      {editing ? (
        <input ref={input} className="input input--sm range__edit" value={draft} inputMode="decimal"
          onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") setEditing(false)
          }} />
      ) : (
        <button type="button" className="range__value range__value--btn" title="Click to type a value"
          onClick={(e) => { e.preventDefault(); setEditing(true) }}>
          {value}{suffix}
        </button>
      )}
    </label>
  )
}
