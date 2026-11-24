import { useEffect, useRef, useState } from "react"
import { parseTargets, SVG_ELEMENTS } from "@marknotton/svgenius-core/elements"

// ── Multi-select of SVG element names ─────────────────────────────────────────
// Nothing ticked = every element. Stored as a comma-separated string.

interface Props {
  value: string
  onChange: (v: string) => void
  label: string
}

export function ElementPicker({ value, onChange, label }: Props) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState("")
  const root = useRef<HTMLDivElement>(null)
  const picked = parseTargets(value).filter((t) => t !== "*")
  const set = new Set(picked)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", esc)
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc) }
  }, [open])

  const toggle = (name: string) => {
    const next = set.has(name) ? picked.filter((p) => p !== name) : [...picked, name]
    // Keep the list's order so the summary reads naturally
    const order = (n: string) => { const i = SVG_ELEMENTS.indexOf(n); return i < 0 ? 999 : i }
    onChange(next.sort((a, b) => order(a) - order(b)).join(", "))
  }

  const q = filter.trim().toLowerCase()
  // Names typed in older rules that aren't in the list still show up
  const all = [...SVG_ELEMENTS, ...picked.filter((p) => !SVG_ELEMENTS.includes(p))]
  const shown = all.filter((n) => !q || n.toLowerCase().includes(q))
  const custom = q && !all.some((n) => n.toLowerCase() === q) ? filter.trim() : null

  const summary = picked.length === 0 ? "All elements"
    : picked.length <= 3 ? picked.join(", ")
    : `${picked.slice(0, 2).join(", ")} +${picked.length - 2}`

  return (
    <div className="picker" ref={root}>
      <button type="button" className="select picker__button" aria-label={label} aria-expanded={open}
        title={picked.length ? picked.join(", ") : "Every element"} onClick={() => setOpen((o) => !o)}>
        <span className="picker__summary">{summary}</span>
      </button>
      {open && (
        <div className="picker__pop" role="listbox" aria-multiselectable="true">
          <div className="picker__top">
            <input className="input input--sm" type="search" placeholder="Filter elements" autoFocus
              value={filter} onChange={(e) => setFilter(e.target.value)} />
            <button className="link" onClick={() => onChange("*")} disabled={picked.length === 0}>All</button>
          </div>
          <div className="picker__list">
            {custom && (
              <label className="picker__opt">
                <input type="checkbox" className="checkbox" checked={false} onChange={() => { toggle(custom); setFilter("") }} />
                <span>Add “{custom}”</span>
              </label>
            )}
            {shown.map((n) => (
              <label key={n} className="picker__opt" role="option" aria-selected={set.has(n)}>
                <input type="checkbox" className="checkbox" checked={set.has(n)} onChange={() => toggle(n)} />
                <span className="input--mono">{n}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
