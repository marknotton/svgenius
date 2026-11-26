import { useState } from "react"
import { comparesToRef, createSmartRule, defaultMagic, GROUP_LABELS, MAGIC_GROUPS, MAGIC_LABELS, parseRatio, ratioLabel, ratioWords, smartRuleSentence, smartRuleText } from "@marknotton/svgenius-core/designPrinciples"
import { duplicateAfter } from "@marknotton/svgenius-core/settings"
import type { DesignPrinciple, MagicFit, MagicGroup, MagicKeylines, MagicRule, SmartCounts, SmartRule, SmartTarget } from "@marknotton/svgenius-core/types"
import { useDragSort } from "../hooks/useDragSort"
import { IconChevronLeft, IconChevronRight, IconDuplicate, IconGrip, IconPlus, IconTrash } from "../icons"
import { KeylineExplorer } from "./KeylineExplorer"
import { Toggle } from "./Toggle"

// ── Smart Sizing (preset › Design principle) ──────────────────────────────────
// Each file is sorted by its artwork's shape: square, tall or wide. Each shape
// has a card saying where it goes and how it's sized. Advanced rules run first

const FIT_NAMES: Record<MagicFit, { label: string, title: string }> = {
  contain: { label: "Fit inside", title: "As big as it goes while staying inside" },
  height: { label: "Fit height", title: "Its height matches. Kept inside the live area" },
  width: { label: "Fit width", title: "Its width matches. Kept inside the live area" },
  stretch: { label: "Stretch to fit", title: "Fills it exactly, width and height on their own, so the artwork can come out of proportion" }
}

const GROUP_HINTS: Record<MagicGroup, (tol: number) => string> = {
  square: (t) => `About as wide as it is tall (within ±${t}%)`,
  tall: () => "Taller than it is wide",
  wide: () => "Wider than it is tall"
}

/** Keylines first, then the live area, then the whole viewBox (always there) */
const TARGETS: SmartTarget[] = ["square", "portrait", "landscape", "circle", "live", "canvas"]
const targetLabel = (k: SmartTarget) => (k === "canvas" ? "ViewBox (whole canvas)" : MAGIC_LABELS[k])

const TAB_KEY = "svgenius:smart-sizing:tab"

interface Props {
  magic: MagicKeylines | null
  dp: DesignPrinciple
  onChange: (m: MagicKeylines) => void
  /** Settings › Square tolerance, used unless the preset sets its own */
  squareTolerance: number
  /** Files of this preset in each group and rule, from their last run */
  counts?: SmartCounts
  /** Scrolls the file list to a file and flashes its row */
  onReveal?: (id: string) => void
}

export function SmartSizing({ magic, dp, onChange, squareTolerance, counts, onReveal }: Props) {
  const [explore, setExplore] = useState(false)
  const m = magic ?? { ...defaultMagic(), enabled: false }
  const on = m.enabled
  const tol = m.tolerance ?? squareTolerance
  const rules = m.advanced ?? []
  const [advancedOpen, setAdvancedOpen] = useState(rules.length > 0)
  const rule = (g: MagicGroup, patch: Partial<MagicRule>) => onChange({ ...m, rules: { ...m.rules, [g]: { ...m.rules[g], ...patch } } })
  const has = (k: SmartTarget) => k === "live" || k === "canvas" || dp.keylines.some((l) => l.kind === k)
  const setRules = (advanced: SmartRule[]) => onChange({ ...m, advanced })
  const [tab, setTabState] = useState<MagicGroup>(() => {
    try { const v = localStorage.getItem(TAB_KEY); return MAGIC_GROUPS.includes(v as MagicGroup) ? v as MagicGroup : "square" } catch { return "square" }
  })
  const setTab = (g: MagicGroup) => { setTabState(g); try { localStorage.setItem(TAB_KEY, g) } catch { /* private mode */ } }

  return (
    <div className={`smart${on ? " is-on" : ""}`}>
      <div className="smart__head">
        <span className="smart__spark" aria-hidden="true">✦</span>
        <Toggle label="Smart Sizing" checked={on} onChange={(enabled) => onChange({ ...m, enabled })}
          hint="Looks at each file's artwork, sorts it as square, tall or wide, then sizes and centres it where that shape goes. Quick Edit can still fine-tune any file" />
        {on && (
          <button type="button" className="btn btn--icon smart__explore" title={`Explore ${dp.name}'s keylines`} aria-label="Explore keylines" onClick={() => setExplore(true)}>
            <IconKeylines />
          </button>
        )}
      </div>

      {on && <>
        <div className="smart__tabs" role="tablist" aria-label="Artwork shapes">
          {MAGIC_GROUPS.map((g) => (
            <button key={g} type="button" role="tab" aria-selected={tab === g} className={`smart__tab${tab === g ? " is-on" : ""}`}
              title={GROUP_HINTS[g](tol)} onClick={() => setTab(g)}>
              <span>{GROUP_LABELS[g]}{counts ? <span className="smart__tab-count"> · {counts[g].length + (counts.groupRules[g] ?? []).reduce((a, b) => a + (b?.length ?? 0), 0)}</span> : null}</span>
            </button>
          ))}
        </div>
        <div className="smart__card" role="tabpanel" aria-label={`${GROUP_LABELS[tab]} artwork`}>
          <div className="smart__card-head">
            <GroupGlyph group={tab} keyline={m.rules[tab].keyline} />
            <span className="smart__card-text">
              <strong>{GROUP_LABELS[tab]} artwork</strong>
              <span className="text-3 smart__card-hint">{GROUP_HINTS[tab](tol)}</span>
            </span>
          </div>
          <div className="smart__subhead">Rules for {tab} artwork <span className="text-3">({GROUP_HINTS[tab](tol).toLowerCase()})</span></div>
          <AdvancedRules key={tab} rules={m.rules[tab].advanced ?? []} onChange={(advanced) => rule(tab, { advanced })} has={has}
            counts={counts?.groupRules[tab]} showCounts={!!counts} scope={tab} onReveal={onReveal} />
          <div className="smart__subhead smart__subhead--nav">Otherwise{counts && <FileNav key={tab} ids={counts[tab]} label={`${GROUP_LABELS[tab]} otherwise`} onReveal={onReveal} />}</div>
          <TargetFields value={m.rules[tab]} has={has} label={GROUP_LABELS[tab]} onChange={(p) => rule(tab, p)} otherwise />
        </div>
        <p className="text-3 smart__order">Order: the shape's own rules, then rules for all shapes, then its Otherwise. The first match wins.</p>

        <p className="text-3 smart__note">
          Shape comes from the artwork's own bounds, not the viewBox, so a 40 × 40 file with a tall drawing counts as tall.
          {" "}<strong>Fit inside</strong> makes it as big as it can be without crossing the edge. <strong>Fit height</strong> and <strong>Fit width</strong> match one side, so the other can cross a keyline, but never the live area.
          {" "}<strong>Stretch to fit</strong> fills it exactly, so the artwork can come out squashed or stretched.
          {" "}<strong>ViewBox</strong> ignores the keylines and uses the whole canvas.
        </p>

        <div className="smart__tol">
          <Toggle label="Own square tolerance" checked={m.tolerance !== null}
            hint={`Override the app-wide square tolerance (Settings, now ±${squareTolerance}%) for this preset only. Artwork within this % of 1:1 counts as square`}
            onChange={(v) => onChange({ ...m, tolerance: v ? squareTolerance : null })} />
          {m.tolerance !== null && (
            <label className="range" title="How far from 1:1 artwork can be and still count as square">
              <span className="range__label">Square within</span>
              <input type="range" min={0} max={30} step={1} value={m.tolerance} onChange={(e) => onChange({ ...m, tolerance: Number(e.target.value) })} />
              <span className="range__value">±{m.tolerance}%</span>
            </label>
          )}
        </div>

        <details className="smart__advanced" open={advancedOpen} onToggle={(e) => setAdvancedOpen((e.currentTarget as HTMLDetailsElement).open)}>
          <summary>Rules for all shapes{rules.length > 0 && <span className="text-3"> {rules.filter((r) => r.enabled).length}/{rules.length}</span>}</summary>
          <AdvancedRules rules={rules} onChange={setRules} has={has} counts={counts?.rules} showCounts={!!counts} onReveal={onReveal} />
        </details>

        <button type="button" className="link smart__reset" title="Puts each shape's Otherwise back to the defaults. Rules stay"
          onClick={() => onChange({ ...defaultMagic(), enabled: true, tolerance: m.tolerance, advanced: m.advanced,
            rules: Object.fromEntries(MAGIC_GROUPS.map((g) => [g, { ...defaultMagic().rules[g], ...(m.rules[g].advanced ? { advanced: m.rules[g].advanced } : {}) }])) as MagicKeylines["rules"] })}>Reset shapes</button>
      </>}
      {explore && <KeylineExplorer dp={dp} magic={m} onClose={() => setExplore(false)} />}
    </div>
  )
}

const LOOP = (i: number, n: number) => (i + n) % n

/** "12 SVGs", then ‹ 3 / 12 › to step through them (looping), or one find button when there's just one */
function FileNav({ ids, label, onReveal }: { ids: string[], label: string, onReveal?: (id: string) => void }) {
  const [at, setAt] = useState(-1)
  const n = ids.length
  const go = (step: number) => {
    const next = at < 0 ? (step > 0 ? 0 : n - 1) : LOOP(at + step, n)
    setAt(next)
    onReveal?.(ids[next])
  }
  return (
    <span className={`smart__nav${n ? " has-files" : ""}`}>
      <span className="smart__nav-count" title={`${label}: ${n} ${n === 1 ? "SVG" : "SVGs"} placed on their last run`}>{n} {n === 1 ? "SVG" : "SVGs"}</span>
      {onReveal && n === 1 && (
        <button type="button" className="btn btn--icon smart__nav-btn" title="Show it in the list" aria-label={`${label}: show its SVG in the list`}
          onClick={() => onReveal(ids[0])}><IconFind /></button>
      )}
      {onReveal && n > 1 && <>
        <button type="button" className="btn btn--icon smart__nav-btn" title="Previous SVG in the list" aria-label={`${label}: previous SVG`} onClick={() => go(-1)}><IconChevronLeft /></button>
        <span className="smart__nav-pos text-3" aria-live="polite">{at >= 0 ? `${LOOP(at, n) + 1} / ${n}` : ""}</span>
        <button type="button" className="btn btn--icon smart__nav-btn" title="Next SVG in the list" aria-label={`${label}: next SVG`} onClick={() => go(1)}><IconChevronRight /></button>
      </>}
    </span>
  )
}

/** A magnifier over a target: find this file */
function IconFind() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="7" cy="7" r="4.75" /><circle cx="7" cy="7" r="1.25" fill="currentColor" stroke="none" /><path d="m10.5 10.5 3.5 3.5" />
    </svg>
  )
}

/** "Goes in" and "Sized to", side by side */
function TargetFields({ value, has, label, onChange, otherwise }: { value: Pick<MagicRule, "keyline" | "fit">, has: (k: SmartTarget) => boolean, label: string, onChange: (p: Partial<MagicRule>) => void, otherwise?: boolean }) {
  return (
    <div className="smart__fields">
      <label className="smart__field">
        <span className="text-3">{otherwise ? "Otherwise, goes in" : "Goes in"}</span>
        <select className="input input--sm" aria-label={`${label}: goes in`} value={value.keyline}
          onChange={(e) => onChange({ keyline: e.target.value as SmartTarget })}>
          {TARGETS.map((k) => <option key={k} value={k}>{targetLabel(k)}{has(k) ? "" : " (not in this principle)"}</option>)}
        </select>
      </label>
      <label className="smart__field">
        <span className="text-3">{otherwise ? "sized to" : "Sized to"}</span>
        <select className="input input--sm" aria-label={`${label}: sized to`} value={value.fit} title={FIT_NAMES[value.fit].title}
          onChange={(e) => onChange({ fit: e.target.value as MagicFit })}>
          {(Object.keys(FIT_NAMES) as MagicFit[]).map((f) => <option key={f} value={f} title={FIT_NAMES[f].title}>{FIT_NAMES[f].label}</option>)}
        </select>
      </label>
      {!has(value.keyline) && <span className="smart__warn">Not in this principle: the closest keyline is used</span>}
    </div>
  )
}

const OPS: Array<{ value: SmartRule["op"], label: string }> = [
  { value: "lt", label: "is less than" }, { value: "gt", label: "is more than" }, { value: "eq", label: "equals" }, { value: "between", label: "is between" }
]

/** If [artwork|viewBox] [shape|aspect ratio|width|height] [op] [value] → goes in, sized to */
function AdvancedRules({ rules, onChange, has, counts, showCounts, scope, onReveal }: {
  rules: SmartRule[], onChange: (r: SmartRule[]) => void, has: (k: SmartTarget) => boolean, counts?: string[][], showCounts: boolean
  onReveal?: (id: string) => void
  /** A shape's own rules: they only see that shape's files, so "shape is…" isn't offered */
  scope?: MagicGroup
}) {
  const prefix = scope ? `${GROUP_LABELS[scope]} rule` : "Rule"
  const patch = (id: string, p: Partial<SmartRule>) => onChange(rules.map((r) => (r.id === id ? { ...r, ...p } : r)))
  const sort = useDragSort(rules, onChange)
  return (
    <div className="rules smart__rules">
      {rules.length === 0 && (scope
        ? <p className="rules__empty text-3 smart__try">Only {scope} artwork reaches these. Try: aspect ratio over <strong>{scope === "tall" ? "1:2" : scope === "wide" ? "2:1" : "1:1"}</strong> → <strong>{scope === "tall" ? "Portrait" : scope === "wide" ? "Landscape" : "Square"}</strong>, <strong>stretch to fit</strong>.</p>
        : <p className="rules__empty text-3 smart__try">For every file, whatever its shape. Try: artwork with an aspect ratio over <strong>2:1</strong> (twice as wide as tall) → <strong>ViewBox</strong>, <strong>fit width</strong>. Or artwork narrower than <strong>50%</strong> of the canvas → <strong>Live area</strong>, <strong>fit height</strong>.</p>)}
      {rules.map((r, i) => {
        const n = i + 1
        return (
          <div key={r.id} className={`rule smart__rule${r.enabled ? "" : " is-off"}`} {...sort.rowProps(r.id)}>
            <div className="rule__row">
              {rules.length > 1 && <span className="rule__grip" title="Drag to reorder. Rules run top to bottom" {...sort.handleProps(r.id)}><IconGrip /></span>}
              <input type="checkbox" className="checkbox" checked={r.enabled} title={r.enabled ? "Rule on" : "Rule off"}
                aria-label={`Smart Sizing rule ${n} enabled`} onChange={(e) => patch(r.id, { enabled: e.target.checked })} />
              <span className="rule__word smart__rule-name" title={smartRuleText(r)}>
                {prefix} {n}
              </span>
              {showCounts && <FileNav key={r.id} ids={counts?.[i] ?? []} label={`${prefix} ${n}`} onReveal={onReveal} />}
              <button className="btn btn--icon" title="Duplicate rule" aria-label={`Duplicate Smart Sizing rule ${n}`}
                onClick={() => onChange(duplicateAfter(rules, r.id))}><IconDuplicate /></button>
              <button className="btn btn--icon" title="Delete rule" aria-label={`Delete Smart Sizing rule ${n}`}
                onClick={() => onChange(rules.filter((x) => x.id !== r.id))}><IconTrash /></button>
            </div>
            <div className="rule__row rule__row--indent smart__if">
              <span className="rule__word">If the</span>
              <select className="select select--sm" value={r.of} aria-label={`Rule ${n}: measure the`}
                onChange={(e) => {
                  const of = e.target.value as SmartRule["of"]
                  // The viewBox is always 100% of itself, so its sizes are in units
                  patch(r.id, { of, ...(of === "viewbox" && r.unit === "%" ? { unit: "units" as const } : {}) })
                }}>
                <option value="artwork">artwork's</option>
                <option value="viewbox">viewBox's</option>
              </select>
              <select className="select select--sm" value={r.measure} aria-label={`Rule ${n}: what`}
                onChange={(e) => {
                  const measure = e.target.value as SmartRule["measure"]
                  const fresh = measure === "ratio" ? { value: 2, value2: 3, valueText: "2:1", value2Text: "3:1" }
                    : measure === "shape" ? {} : { value: r.of === "viewbox" ? 24 : 50, value2: r.of === "viewbox" ? 48 : 80, unit: r.of === "viewbox" ? "units" as const : "%" as const }
                  patch(r.id, { measure, op: measure === "shape" ? "is" : r.op === "is" ? "gt" : r.op, ...(measure !== r.measure ? fresh : {}) })
                }}>
                {(!scope || r.measure === "shape") && <option value="shape">shape</option>}
                <option value="ratio">aspect ratio</option>
                <option value="width">width</option>
                <option value="height">height</option>
              </select>
              {r.measure === "shape"
                ? <>
                    <span className="rule__word">is</span>
                    <select className="select select--sm" value={r.shape} aria-label={`Rule ${n}: shape`}
                      onChange={(e) => patch(r.id, { shape: e.target.value as MagicGroup })}>
                      {MAGIC_GROUPS.map((g) => <option key={g} value={g}>{GROUP_LABELS[g].toLowerCase()}</option>)}
                    </select>
                  </>
                : <>
                    <select className="select select--sm" value={r.op} aria-label={`Rule ${n}: comparison`}
                      onChange={(e) => patch(r.id, { op: e.target.value as SmartRule["op"] })}>
                      {OPS.filter((o) => o.value !== "between" || r.against !== "ref").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {r.op !== "between" && (
                      <select className="select select--sm" value={r.against === "ref" ? "ref" : "number"} aria-label={`Rule ${n}: compared to`}
                        title="Compare with a number you type, or with one of the design principle's keylines"
                        onChange={(e) => patch(r.id, e.target.value === "ref"
                          ? { against: "ref", ref: r.ref ?? "portrait", refDim: r.measure === "height" ? "height" : r.measure === "ratio" ? "ratio" : "width" }
                          : { against: "number" })}>
                        <option value="number">a number</option>
                        <option value="ref">a keyline or area</option>
                      </select>
                    )}
                    {comparesToRef(r)
                      ? <>
                          <select className="select select--sm" value={r.ref ?? "portrait"} aria-label={`Rule ${n}: which keyline`}
                            onChange={(e) => patch(r.id, { ref: e.target.value as SmartTarget })}>
                            {TARGETS.map((k) => <option key={k} value={k}>{k === "canvas" ? "ViewBox" : MAGIC_LABELS[k]}{k === "canvas" || k === "live" ? "" : " keyline"}{has(k) ? "" : " (not in this principle)"}</option>)}
                          </select>
                          <select className="select select--sm" value={r.refDim ?? "width"} aria-label={`Rule ${n}: which side of it`}
                            onChange={(e) => patch(r.id, { refDim: e.target.value as SmartRule["refDim"] })}>
                            <option value="width">width</option>
                            <option value="height">height</option>
                            <option value="ratio">aspect ratio</option>
                          </select>
                        </>
                      : <>
                          <RuleValue rule={r} n={n} second={false} onChange={(p) => patch(r.id, p)} />
                          {r.op === "between" && <>
                            <span className="rule__word">and</span>
                            <RuleValue rule={r} n={n} second onChange={(p) => patch(r.id, p)} />
                          </>}
                        </>}
                    {r.measure !== "ratio" && !comparesToRef(r) && (
                      <select className="select select--sm" value={r.of === "viewbox" ? "units" : r.unit ?? "units"} aria-label={`Rule ${n}: unit`}
                        disabled={r.of === "viewbox"} title={r.of === "viewbox" ? "The viewBox is always 100% of the canvas, so it's measured in units" : undefined}
                        onChange={(e) => patch(r.id, { unit: e.target.value as "%" | "units" })}>
                        <option value="%">% of canvas</option>
                        <option value="units">viewBox units</option>
                      </select>
                    )}
                  </>}
            </div>
            {r.measure === "ratio" && !comparesToRef(r) && <p className="text-3 smart__hint">{ratioHint(r)}</p>}
            {comparesToRef(r) && !has(r.ref ?? "portrait") && <p className="smart__warn smart__hint">{MAGIC_LABELS[r.ref ?? "portrait"]} keyline not in this design principle, so this rule never matches</p>}
            {comparesToRef(r) && (r.measure === "ratio") !== ((r.refDim ?? "width") === "ratio") && <p className="smart__warn smart__hint">Compare an aspect ratio with an aspect ratio, and a size with a width or height</p>}
            {comparesToRef(r) && r.measure !== "ratio" && (r.refDim ?? "width") !== "ratio" && r.of === "artwork" && <p className="text-3 smart__hint">Sizes compare as a share of the canvas: the artwork in its viewBox, the keyline in the design principle</p>}
            <div className="rule__row rule__row--indent">
              <TargetFields value={r} has={has} label={`Rule ${n}`} onChange={(p) => patch(r.id, p)} />
            </div>
            <p className="smart__sentence">{smartRuleSentence(r)}.</p>
          </div>
        )
      })}
      <div>
        <button className="btn btn--secondary btn--sm" onClick={() => onChange([...rules, scope ? scopedRule(scope) : createSmartRule()])}><IconPlus width={11} height={11} /> Add rule</button>
      </div>
    </div>
  )
}

/** A new rule inside a shape's tab: something that shape's files can actually meet */
function scopedRule(g: MagicGroup): SmartRule {
  const r = createSmartRule()
  if (g === "tall") return { ...r, op: "lt", value: 0.5, valueText: "1:2", keyline: "portrait", fit: "stretch" }
  if (g === "wide") return { ...r, op: "gt", value: 2, valueText: "2:1", keyline: "landscape", fit: "stretch" }
  return { ...r, measure: "width", op: "gt", value: 80, unit: "%", keyline: "square", fit: "contain" }
}

/** "3:2 = 1.5× wider than tall" under an aspect ratio rule */
function ratioHint(r: SmartRule) {
  const one = (text: string | undefined, v: number) => `${text ?? ratioLabel(v)} = ${ratioWords(v)}`
  return r.op === "between" ? `${one(r.valueText, r.value)}; ${one(r.value2Text, r.value2)}` : `${one(r.valueText, r.value)}. Aspect ratio is width to height: 1:1 is square, 2:1 twice as wide, 1:2 twice as tall`
}

/** A number, or for aspect ratios W:H text like 3:2 (kept as typed) */
function RuleValue({ rule: r, n, second, onChange }: { rule: SmartRule, n: number, second: boolean, onChange: (p: Partial<SmartRule>) => void }) {
  const v = second ? r.value2 : r.value
  const label = `Rule ${n}: ${second ? "second " : ""}value`
  if (r.measure === "ratio") {
    const shown = (second ? r.value2Text : r.valueText) ?? ratioLabel(v)
    return <RatioInput value={shown} label={label} onChange={(text, num) => onChange(second ? { value2Text: text, value2: num } : { valueText: text, value: num })} />
  }
  return (
    <input className="input input--sm input--mono smart__num" type="number" min={0} step={r.unit === "%" ? 5 : 1} value={v}
      aria-label={label} onChange={(e) => {
        const num = Math.max(0, Number(e.target.value) || 0)
        onChange(second ? { value2: num } : { value: num })
      }} />
  )
}

/** Free text while typing; only a readable ratio is saved */
function RatioInput({ value, label, onChange }: { value: string, label: string, onChange: (text: string, num: number) => void }) {
  const [text, setText] = useState(value)
  const bad = !Number.isFinite(parseRatio(text))
  return (
    <input className={`input input--sm input--mono smart__num${bad ? " is-invalid" : ""}`} value={text} placeholder="3:2" spellCheck={false}
      aria-label={label} aria-invalid={bad} title="Width to height, like 3:2, 16:9 or 1.5"
      onChange={(e) => {
        setText(e.target.value)
        const num = parseRatio(e.target.value)
        if (Number.isFinite(num)) onChange(e.target.value.trim(), num)
      }}
      onBlur={() => setText(value)} />
  )
}

/** A tiny picture of a group's artwork sitting where it goes */
function GroupGlyph({ group, keyline, size = 22 }: { group: MagicGroup, keyline: SmartTarget, size?: number }) {
  const k = keyline === "portrait" ? { w: 10, h: 14 } : keyline === "landscape" ? { w: 14, h: 10 } : keyline === "canvas" ? { w: 18, h: 18 } : keyline === "live" ? { w: 16, h: 16 } : { w: 13, h: 13 }
  const a = group === "tall" ? { w: 6, h: 11 } : group === "wide" ? { w: 11, h: 6 } : { w: 8, h: 8 }
  return (
    <svg className="smart__glyph" width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      {keyline === "circle"
        ? <circle cx="10" cy="10" r="7" className="smart__glyph-key" />
        : <rect x={10 - k.w / 2} y={10 - k.h / 2} width={k.w} height={k.h} rx="1.5" className="smart__glyph-key" />}
      <rect x={10 - a.w / 2} y={10 - a.h / 2} width={a.w} height={a.h} rx="1" className="smart__glyph-art" />
    </svg>
  )
}

const IconKeylines = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
    <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" opacity=".5" /><rect x="5" y="3" width="6" height="10" rx="1" /><rect x="3" y="5" width="10" height="6" rx="1" /><circle cx="8" cy="8" r="5.5" opacity=".5" />
  </svg>
)
