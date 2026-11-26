import { IconDuplicate, IconPlus, IconTrash } from "../icons"
import { canonicalColour } from "@marknotton/svgenius-core/cutOuts"
import { ELEMENTS, FIELDS, FLAGS, SHAPES, STATUSES, activeRules, createFilterRule, type FilterField, type FilterRule, type FilterSet } from "@marknotton/svgenius-core/filters"
import { duplicateAfter } from "@marknotton/svgenius-core/settings"
import { Segmented } from "./Segmented"

// ── Advanced filters ──────────────────────────────────────────────────────────

interface Props {
  filters: FilterSet
  onChange: (f: FilterSet) => void
  shown: number
  total: number
  /** Flag colours at least one file uses. Unused ones aren't offered */
  usedFlags: Set<string>
}

const toHex = (v: string) => {
  const c = canonicalColour(v)
  return c && /^#[0-9a-f]{6}$/i.test(c) ? c : "#000000"
}

export function FilterBar({ filters, onChange, shown, total, usedFlags }: Props) {
  const rules = filters.rules
  const set = (rules: FilterRule[]) => onChange({ ...filters, rules })
  const patch = (id: string, p: Partial<FilterRule>) => set(rules.map((r) => (r.id === id ? { ...r, ...p } : r)))
  const active = activeRules(filters).length

  return (
    <div className="filters">
      <div className="filters__head">
        <span className="filters__title">Show files that match</span>
        <Segmented label="Combine rules" value={filters.match} onChange={(match) => onChange({ ...filters, match })}
          options={[{ value: "all", label: "All rules", title: "Every rule must match" }, { value: "any", label: "Any rule", title: "One matching rule is enough" }]} />
        <span className="text-3">in</span>
        <Segmented label="Markup to search" value={filters.markup} onChange={(markup) => onChange({ ...filters, markup })}
          options={[{ value: "source", label: "Before", title: "The markup as loaded (or as you edited it)" }, { value: "output", label: "After", title: "The optimised markup. Files not optimised yet won't match" }]} />
        <div className="toolbar__spacer" />
        {active > 0 && <span className="text-3">{shown} of {total} shown</span>}
        {rules.length > 0 && <button className="link" onClick={() => set([])}>Clear</button>}
      </div>
      {rules.length === 0 && (
        <p className="text-3 filters__empty">
          Add rules to narrow the list, e.g. markup contains <code>#fff</code> and has a <code>circle</code> element, every file without a red flag, or every tall icon.
          In search, <code>shape:tall</code> matches by the artwork and <code>vb:wide</code> by the viewBox (<code>-shape:square</code> leaves them out).
          Optimise, Export and Select all then work on the files shown.
        </p>
      )}
      {rules.map((r, i) => (
        <div key={r.id} className={`filters__rule${r.enabled ? "" : " is-off"}`}>
          <input type="checkbox" className="checkbox" checked={r.enabled} aria-label={`Rule ${i + 1} on`}
            onChange={(e) => patch(r.id, { enabled: e.target.checked })} />
          <select className="select select--sm" value={r.field} aria-label={`Rule ${i + 1} field`}
            title={FIELDS.find((f) => f.value === r.field)?.hint}
            onChange={(e) => {
              const field = e.target.value as FilterField
              const fresh = createFilterRule(field)
              patch(r.id, { field, value: fresh.value, value2: "" })
            }}>
            {FIELDS.filter((f) => f.value !== "flag" || usedFlags.size > 0 || r.field === "flag").map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <select className="select select--sm" value={r.has ? "has" : "not"} aria-label={`Rule ${i + 1} match`}
            onChange={(e) => patch(r.id, { has: e.target.value === "has" })}>
            <option value="has">{verb(r.field, true)}</option>
            <option value="not">{verb(r.field, false)}</option>
          </select>
          <Value rule={r} index={i} usedFlags={usedFlags} patch={(p) => patch(r.id, p)} />
          <button className="btn btn--icon" title="Duplicate rule" aria-label={`Duplicate rule ${i + 1}`} onClick={() => set(duplicateAfter(rules, r.id))}><IconDuplicate /></button>
          <button className="btn btn--icon" title="Delete rule" aria-label={`Delete rule ${i + 1}`} onClick={() => set(rules.filter((x) => x.id !== r.id))}><IconTrash /></button>
        </div>
      ))}
      {/* Under the last rule, where the next one will appear */}
      <div className="filters__foot">
        <button className="btn btn--secondary btn--sm" onClick={() => set([...rules, createFilterRule()])}><IconPlus width={11} height={11} /> Add rule</button>
      </div>
    </div>
  )
}

function verb(field: FilterField, has: boolean) {
  switch (field) {
    case "text": case "name": return has ? "contains" : "doesn't contain"
    case "colour": return has ? "uses" : "doesn't use"
    case "flag": case "status": case "shape": return has ? "is" : "isn't"
    default: return has ? "has" : "doesn't have"
  }
}

function Value({ rule: r, index: i, usedFlags, patch }: { rule: FilterRule, index: number, usedFlags: Set<string>, patch: (p: Partial<FilterRule>) => void }) {
  const label = `Rule ${i + 1} value`
  switch (r.field) {
    case "flag":
      return (
        <select className="select select--sm filters__value" value={r.value} aria-label={label} onChange={(e) => patch({ value: e.target.value })}>
          <option value="any">Any flag</option>
          <option value="none">No flag</option>
          {FLAGS.filter((f) => usedFlags.has(f.value) || r.value === f.value).map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      )
    case "status":
      return (
        <select className="select select--sm filters__value" value={r.value} aria-label={label} onChange={(e) => patch({ value: e.target.value })}>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      )
    case "shape":
      return (
        <span className="filters__value filters__pair">
          <select className="select select--sm" value={r.value} aria-label={label} onChange={(e) => patch({ value: e.target.value })}>
            {SHAPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <Segmented label={`Rule ${i + 1} measured by`} value={r.value2 === "viewbox" ? "viewbox" : "content"} onChange={(value2) => patch({ value2 })}
            options={[
              { value: "content", label: "By artwork", title: "The drawing's own bounds, whatever the canvas around it" },
              { value: "viewbox", label: "By viewBox", title: "The canvas: the viewBox's width and height" }
            ]} />
        </span>
      )
    case "colour":
      return (
        <span className="filters__value filters__pair">
          <input type="color" className="swatch" value={toHex(r.value)} aria-label={`${label} colour`} onChange={(e) => patch({ value: e.target.value })} />
          <input className="input input--sm input--mono" value={r.value} spellCheck={false} placeholder="#fff, white, rgb(…)"
            aria-label={label} onChange={(e) => patch({ value: e.target.value })} />
        </span>
      )
    case "element":
      return (
        <>
          <input className="input input--sm input--mono filters__value" list="svgenius-elements" value={r.value} spellCheck={false}
            placeholder="circle" aria-label={label} onChange={(e) => patch({ value: e.target.value })} />
          <datalist id="svgenius-elements">{ELEMENTS.map((e) => <option key={e} value={e} />)}</datalist>
        </>
      )
    case "attribute":
      return (
        <span className="filters__value filters__pair">
          <input className="input input--sm input--mono" value={r.value} spellCheck={false} placeholder="name, e.g. transform"
            aria-label={label} onChange={(e) => patch({ value: e.target.value })} />
          <input className="input input--sm input--mono" value={r.value2} spellCheck={false} placeholder="value contains (optional)"
            aria-label={`Rule ${i + 1} attribute value`} onChange={(e) => patch({ value2: e.target.value })} />
        </span>
      )
    default:
      return (
        <input className="input input--sm input--mono filters__value" value={r.value} spellCheck={false}
          placeholder={r.field === "name" ? "icon-" : "#fff"} aria-label={label} onChange={(e) => patch({ value: e.target.value })} />
      )
  }
}
