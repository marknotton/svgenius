import type { ReactNode } from "react"

interface Props {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  hint?: string
}

export function Toggle({ checked, onChange, label, hint }: Props) {
  return (
    <label className="toggle" title={hint}>
      <span className="toggle__label">{label}</span>
      <input type="checkbox" className="toggle__input" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle__track" aria-hidden="true"><span className="toggle__thumb" /></span>
    </label>
  )
}
