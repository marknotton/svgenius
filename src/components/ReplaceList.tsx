import type { ReactNode } from "react"
import { useDragSort } from "../hooks/useDragSort"
import { IconDuplicate, IconGrip, IconPlus, IconTrash } from "../icons"
import { ruleError } from "../lib/replace"
import { createReplacement, duplicateAfter } from "../lib/settings"
import type { Replacement } from "../lib/types"

// ── Find & replace rules ──────────────────────────────────────────────────────

interface Props {
  rules: Replacement[]
  onChange: (rules: Replacement[]) => void
}

export function ReplaceList({ rules, onChange }: Props) {
  const patch = (id: string, p: Partial<Replacement>) =>
    onChange(rules.map((r) => (r.id === id ? { ...r, ...p } : r)))

  const add = () => onChange([...rules, createReplacement()])
  const remove = (id: string) => onChange(rules.filter((r) => r.id !== id))
  const active = rules.filter((r) => r.enabled && r.find).length
  const sort = useDragSort(rules, onChange)

  return (
    <div className="rules">
      <div className="plugins__head">
        <span className="panel__label">Find &amp; replace {rules.length > 0 && <span className="text-3">{active}/{rules.length}</span>}</span>
        <button className="link" onClick={add}><IconPlus width={11} height={11} /> Add rule</button>
      </div>

      {rules.length === 0 && <p className="rules__empty text-3">Swap strings in every file, e.g. colours, IDs or class names.</p>}
      {rules.length > 1 && <p className="rules__empty text-3">Rules run top to bottom. Drag the handle to reorder.</p>}

      {rules.map((r, i) => {
        const error = ruleError(r)
        return (
          <div key={r.id} className={`rule${r.enabled ? "" : " is-off"}${error ? " is-invalid" : ""}`} {...sort.rowProps(r.id)}>
            <div className="rule__row">
              {rules.length > 1 && <span className="rule__grip" title="Drag to reorder. Rules run top to bottom" {...sort.handleProps(r.id)}><IconGrip /></span>}
              <input type="checkbox" className="checkbox" checked={r.enabled} title={r.enabled ? "Rule on" : "Rule off"}
                aria-label={`Rule ${i + 1} enabled`} onChange={(e) => patch(r.id, { enabled: e.target.checked })} />
              <input className="input input--sm input--mono" placeholder={r.regex ? "Find (regex)" : "Find"} value={r.find}
                spellCheck={false} aria-label={`Rule ${i + 1} find`} onChange={(e) => patch(r.id, { find: e.target.value })} />
              <button className="btn btn--icon" title="Duplicate rule" aria-label={`Duplicate rule ${i + 1}`} onClick={() => onChange(duplicateAfter(rules, r.id))}><IconDuplicate /></button>
              <button className="btn btn--icon" title="Delete rule" aria-label={`Delete rule ${i + 1}`} onClick={() => remove(r.id)}><IconTrash /></button>
            </div>
            <div className="rule__row rule__row--indent">
              <input className="input input--sm input--mono" placeholder="Replace with (empty removes it)" value={r.replace}
                spellCheck={false} aria-label={`Rule ${i + 1} replace`} onChange={(e) => patch(r.id, { replace: e.target.value })} />
            </div>
            <div className="rule__row rule__row--indent rule__opts">
              <Flag on={r.caseSensitive} title="Match case" onClick={() => patch(r.id, { caseSensitive: !r.caseSensitive })}>Aa</Flag>
              <Flag on={r.regex} title="Treat Find as a regular expression ($1, $& work in Replace)" onClick={() => patch(r.id, { regex: !r.regex })}>.*</Flag>
              <Flag on={r.replaceAll} title={r.replaceAll ? "Replacing every match" : "Replacing the first match only"}
                onClick={() => patch(r.id, { replaceAll: !r.replaceAll })}>{r.replaceAll ? "All" : "First"}</Flag>
            </div>
            {error && <p className="rule__error">{error}</p>}
          </div>
        )
      })}
    </div>
  )
}

function Flag({ on, title, onClick, children }: { on: boolean, title: string, onClick: () => void, children: ReactNode }) {
  return (
    <button type="button" className={`flag${on ? " is-on" : ""}`} title={title} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  )
}
