import { useEffect, useState } from "react"
import { IconSwap } from "../icons"
import { COMMAND_NAMES, PARAM_NAMES, caseOf, fmt, reversePath, toAbsolute, toRelative, toggleCase, type Seg } from "@marknotton/svgenius-core/pathData"

// ── Path commands for the selected path ───────────────────────────────────────

const MAX_ROWS = 400

interface Props {
  segs: Seg[]
  /** Editing is only allowed on the source markup */
  readOnly: boolean
  active: number
  onActive: (index: number) => void
  onChange: (segs: Seg[]) => void
}

export function PathPanel({ segs, readOnly, active, onActive, onChange }: Props) {
  const mode = caseOf(segs)
  const setValue = (i: number, k: number, n: number) =>
    onChange(segs.map((s, j) => (j === i ? { c: s.c, v: s.v.map((x, m) => (m === k ? n : x)) } : s)))

  return (
    <div className="path-panel">
      <div className="path-panel__head">
        <span className="panel__label">Path</span>
        <span className="text-3">{segs.length} {segs.length === 1 ? "command" : "commands"}</span>
        <div className="toolbar__spacer" />
        {!readOnly && <>
          <div className="btn-join" role="group" aria-label="Coordinates">
            <button className={`btn btn--secondary btn--sm${mode === "absolute" ? " is-active" : ""}`} onClick={() => onChange(toAbsolute(segs))}
              title="Every command in absolute coordinates (capital letters), measured from the SVG's origin">Absolute</button>
            <button className={`btn btn--secondary btn--sm${mode === "relative" ? " is-active" : ""}`} onClick={() => onChange(toRelative(segs))}
              title="Every command relative to the point before it (small letters). Usually a little shorter">Relative</button>
          </div>
          <button className="btn btn--secondary btn--sm" onClick={() => onChange(reversePath(segs))}
            title="Draw the same shape the other way round. Handy for stroke animations, markers and fill rules">
            <IconSwap width={12} height={12} /> Reverse
          </button>
        </>}
      </div>
      <ol className="path-panel__list" onMouseLeave={() => onActive(-1)}>
        {segs.slice(0, MAX_ROWS).map((s, i) => {
          const lower = s.c.toLowerCase()
          const names = PARAM_NAMES[lower]
          const rel = s.c !== s.c.toUpperCase()
          return (
            <li key={i} className={`path-cmd${i === active ? " is-active" : ""}`} onMouseEnter={() => onActive(i)}>
              <button className="path-cmd__letter" disabled={readOnly || lower === "z"}
                title={`${COMMAND_NAMES[lower]}, ${rel ? "relative" : "absolute"}.${readOnly || lower === "z" ? "" : " Click to switch"}`}
                onClick={() => onChange(toggleCase(segs, i))}>{s.c}</button>
              {s.v.map((n, k) => (
                <NumField key={k} value={n} label={names[k]} readOnly={readOnly} flag={lower === "a" && (k === 3 || k === 4)}
                  onValue={(x) => setValue(i, k, x)} onFocus={() => onActive(i)} />
              ))}
            </li>
          )
        })}
      </ol>
      {segs.length > MAX_ROWS && <p className="text-3 path-panel__more">Showing the first {MAX_ROWS} of {segs.length}. Edit the rest in the markup.</p>}
    </div>
  )
}

function NumField({ value, label, readOnly, flag, onValue, onFocus }: {
  value: number, label: string, readOnly: boolean, flag: boolean, onValue: (n: number) => void, onFocus: () => void
}) {
  const [text, setText] = useState(fmt(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setText(fmt(value)) }, [value, focused])
  return (
    <label className={`path-cmd__num${flag ? " is-flag" : ""}`} title={label}>
      <input value={text} readOnly={readOnly} inputMode="decimal" aria-label={label} spellCheck={false}
        style={{ width: `calc(${Math.max(2, text.length)}ch + 12px)` }}
        onFocus={() => { setFocused(true); onFocus() }}
        onBlur={() => { setFocused(false); setText(fmt(value)) }}
        onChange={(e) => {
          setText(e.target.value)
          const n = Number(e.target.value)
          if (e.target.value.trim() !== "" && Number.isFinite(n) && (!flag || n === 0 || n === 1)) onValue(n)
        }}
        onKeyDown={(e) => {
          if (readOnly || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return
          e.preventDefault()
          const step = flag ? 1 : e.shiftKey ? 10 : e.altKey ? 0.1 : 1
          const n = flag ? 1 - value : Math.round((value + (e.key === "ArrowUp" ? step : -step)) * 1000) / 1000
          onValue(n)
          setText(fmt(n))
        }} />
    </label>
  )
}
