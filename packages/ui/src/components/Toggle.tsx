import type { ReactNode } from "react"
import { InfoTip } from "./InfoTip"

interface Props {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  hint?: string
  /** A clickable ⓘ with a longer explanation */
  info?: ReactNode
}

export function Toggle({ checked, onChange, label, hint, info }: Props) {
  return (
    <label className="toggle" title={info ? undefined : hint}>
      <span className="toggle__label">{label}{info && <> <InfoTip label={`About ${typeof label === "string" ? label : "this option"}`}>{info}</InfoTip></>}</span>
      <input type="checkbox" className="toggle__input" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle__track" aria-hidden="true"><span className="toggle__thumb" /></span>
    </label>
  )
}
