import { useDragSort } from "../hooks/useDragSort"
import { IconDuplicate, IconGrip, IconPlus, IconTrash } from "../icons"
import { canonicalColour } from "../lib/cutOuts"
import { createCutMatcher, duplicateAfter } from "../lib/settings"
import type { CutMatcher } from "../lib/types"

// ── Shapes that become cut-outs ───────────────────────────────────────────────
// Like Find & replace: add as many matchers as you need, each a fill colour
// (with a picker) or any text found in the shape's tag, e.g. a class name.

interface Props {
  matchers: CutMatcher[]
  onChange: (m: CutMatcher[]) => void
}

/** The colour as #rrggbb for the picker, or black if it isn't a plain colour */
const toHex = (v: string) => {
  const c = canonicalColour(v)
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c : "#000000"
}

export function CutMatcherList({ matchers, onChange }: Props) {
  const patch = (id: string, p: Partial<CutMatcher>) => onChange(matchers.map((m) => (m.id === id ? { ...m, ...p } : m)))
  const sort = useDragSort(matchers, onChange)
  const active = matchers.filter((m) => m.enabled && m.value.trim()).length

  return (
    <div className="rules">
      <div className="plugins__head">
        <span className="toggle__label">Shapes become cut-outs {matchers.length > 0 && <span className="text-3">{active}/{matchers.length}</span>}</span>
        <button className="link" onClick={() => onChange([...matchers, createCutMatcher()])}><IconPlus width={11} height={11} /> Add match</button>
      </div>
      <p className="rules__empty text-3">
        Filled shapes that match become real holes in whatever is painted beneath them, then they're removed.
        Match by fill colour, or by any text in the shape's tag (a class, an ID, <code>opacity=".5"</code>). Shapes that don't cover anything stay.
      </p>
      {matchers.map((m, i) => {
        const bad = m.kind === "colour" && m.value.trim() !== "" && !canonicalColour(m.value)
        return (
          <div key={m.id} className={`rule${m.enabled ? "" : " is-off"}${bad ? " is-invalid" : ""}`} {...sort.rowProps(m.id)}>
            <div className="rule__row">
              {matchers.length > 1 && <span className="rule__grip" title="Drag to reorder" {...sort.handleProps(m.id)}><IconGrip /></span>}
              <input type="checkbox" className="checkbox" checked={m.enabled} aria-label={`Match ${i + 1} enabled`}
                onChange={(e) => patch(m.id, { enabled: e.target.checked })} />
              <select className="select select--sm cut-kind" value={m.kind} aria-label={`Match ${i + 1} type`}
                onChange={(e) => patch(m.id, { kind: e.target.value as CutMatcher["kind"] })}>
                <option value="colour">Fill colour</option>
                <option value="markup">Markup contains</option>
              </select>
              <button className="btn btn--icon" title="Duplicate" aria-label={`Duplicate match ${i + 1}`} onClick={() => onChange(duplicateAfter(matchers, m.id))}><IconDuplicate /></button>
              <button className="btn btn--icon" title="Delete" aria-label={`Delete match ${i + 1}`} onClick={() => onChange(matchers.filter((x) => x.id !== m.id))}><IconTrash /></button>
            </div>
            <div className="rule__row rule__row--indent">
              {m.kind === "colour" && (
                <input type="color" className="swatch" value={toHex(m.value)} aria-label={`Match ${i + 1} colour`}
                  onChange={(e) => patch(m.id, { value: e.target.value })} />
              )}
              <input className="input input--sm input--mono" value={m.value} spellCheck={false}
                placeholder={m.kind === "colour" ? "#fff, white, rgb(…)" : "class=\"knockout\""}
                aria-label={`Match ${i + 1} value`} onChange={(e) => patch(m.id, { value: e.target.value })} />
            </div>
            {bad && <p className="rule__error">That isn't a colour the browser understands</p>}
          </div>
        )
      })}
    </div>
  )
}
