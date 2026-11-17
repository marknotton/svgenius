import { useDragSort } from "../hooks/useDragSort"
import { IconGrip, IconPlus, IconTrash } from "../icons"
import { ElementPicker } from "./ElementPicker"
import { ACTIONS, CONDITIONS, isRuleReady } from "../lib/attrRules"
import { createAttrRule } from "../lib/settings"
import type { AttrRule } from "../lib/types"

// ── Attribute rules (recipes) ─────────────────────────────────────────────────

interface Props {
  rules: AttrRule[]
  onChange: (rules: AttrRule[]) => void
}

export function AttrRuleList({ rules, onChange }: Props) {
  const patch = (id: string, p: Partial<AttrRule>) => onChange(rules.map((r) => (r.id === id ? { ...r, ...p } : r)))
  const active = rules.filter((r) => r.enabled && isRuleReady(r)).length
  const sort = useDragSort(rules, onChange)

  return (
    <div className="rules">
      <div className="plugins__head">
        <span className="panel__label">Attribute rules {rules.length > 0 && <span className="text-3">{active}/{rules.length}</span>}</span>
        <button className="link" onClick={() => onChange([...rules, createAttrRule()])}><IconPlus width={11} height={11} /> Add rule</button>
      </div>

      {rules.length === 0 && (
        <p className="rules__empty text-3">Recipes like “every path lacking fill → add fill="currentColor"” or “remove data-name”.</p>
      )}
      {rules.length > 1 && <p className="rules__empty text-3">Rules run top to bottom. Drag the handle to reorder.</p>}

      {rules.map((r, i) => {
        const cond = CONDITIONS.find((c) => c.value === r.when) ?? CONDITIONS[0]
        const act = ACTIONS.find((a) => a.value === r.then) ?? ACTIONS[0]
        const ready = isRuleReady(r)
        const n = i + 1
        return (
          <div key={r.id} className={`rule${r.enabled ? "" : " is-off"}`} {...sort.rowProps(r.id)}>
            <div className="rule__row">
              {rules.length > 1 && <span className="rule__grip" title="Drag to reorder. Rules run top to bottom" {...sort.handleProps(r.id)}><IconGrip /></span>}
              <input type="checkbox" className="checkbox" checked={r.enabled} title={r.enabled ? "Rule on" : "Rule off"}
                aria-label={`Attribute rule ${n} enabled`} onChange={(e) => patch(r.id, { enabled: e.target.checked })} />
              <span className="rule__word">For</span>
              <ElementPicker value={r.targets} label={`Attribute rule ${n} elements`} onChange={(targets) => patch(r.id, { targets })} />
              <button className="btn btn--icon" title="Delete rule" aria-label={`Delete attribute rule ${n}`}
                onClick={() => onChange(rules.filter((x) => x.id !== r.id))}><IconTrash /></button>
            </div>

            <div className="rule__row rule__row--indent">
              <span className="rule__word">if</span>
              <select className="select select--sm" value={r.when} aria-label={`Attribute rule ${n} condition`}
                onChange={(e) => patch(r.id, { when: e.target.value as AttrRule["when"] })}>
                {CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              {cond.needsAttr && (
                <input className="input input--sm input--mono" value={r.whenAttr} placeholder="attribute" spellCheck={false}
                  aria-label={`Attribute rule ${n} condition attribute`} onChange={(e) => patch(r.id, { whenAttr: e.target.value })} />
              )}
            </div>
            {cond.needsValue && (
              <div className="rule__row rule__row--deep">
                <input className="input input--sm input--mono" value={r.whenValue} placeholder="value" spellCheck={false}
                  aria-label={`Attribute rule ${n} condition value`} onChange={(e) => patch(r.id, { whenValue: e.target.value })} />
              </div>
            )}

            <div className="rule__row rule__row--indent">
              <span className="rule__word">then</span>
              <select className="select select--sm" value={r.then} aria-label={`Attribute rule ${n} action`}
                onChange={(e) => patch(r.id, { then: e.target.value as AttrRule["then"] })}>
                {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
              {act.needsAttr && (
                <input className="input input--sm input--mono" value={r.thenAttr} placeholder="attribute" spellCheck={false}
                  aria-label={`Attribute rule ${n} action attribute`} onChange={(e) => patch(r.id, { thenAttr: e.target.value })} />
              )}
            </div>
            {act.valueLabel && (
              <div className="rule__row rule__row--deep">
                <input className="input input--sm input--mono" value={r.thenValue} placeholder={act.valueLabel.toLowerCase()} spellCheck={false}
                  aria-label={`Attribute rule ${n} ${act.valueLabel.toLowerCase()}`} onChange={(e) => patch(r.id, { thenValue: e.target.value })} />
              </div>
            )}

            <div className="rule__row rule__row--indent rule__opts">
              <button type="button" className={`flag${r.caseSensitive ? " is-on" : ""}`} aria-pressed={r.caseSensitive}
                title="Match case for element names, attribute names and values"
                onClick={() => patch(r.id, { caseSensitive: !r.caseSensitive })}>Aa</button>
            </div>
            {r.enabled && !ready && <p className="rule__hint text-3">Fill in the attribute names to switch this rule on.</p>}
          </div>
        )
      })}
    </div>
  )
}
