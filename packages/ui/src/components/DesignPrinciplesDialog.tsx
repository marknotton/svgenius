import { useEffect, useMemo, useRef, useState } from "react"
import { ALIGNMENT_LABELS, alignmentText, LINE_DEFAULTS, lineStyle, builtInPrinciples, createAlignment, createPrinciple, createVariation, variationMatches } from "@marknotton/svgenius-core/designPrinciples"
import { plural } from "@marknotton/svgenius-core/format"
import type { AlignmentKeyline, GuideLineStyle, DesignPrinciple, DpVariation, GridFit, Keyline, SvgItem } from "@marknotton/svgenius-core/types"
import { useDragSort } from "../hooks/useDragSort"
import type { GuideShape } from "@marknotton/svgenius-core/shapes"
import { IconDownload, IconDuplicate, IconGrip, IconPlus, IconTrash, IconUpload, IconX } from "../icons"
import { Modal } from "./Dialogs"
import { GridGuides } from "./GridGuides"
import { Segmented } from "./Segmented"
import { ShapeGuide, ShapeOptions } from "./ShapeGuide"

// ── Design principles: brand icon rules (CRUD, import and export) ─────────────

export const FIT_LABELS: Record<GridFit, { label: string, hint: string }> = {
  keylines: { label: "Keylines", hint: "Each file is centred and scaled into the keyline that matches its shape (square, portrait or landscape)." },
  contain: { label: "Live area", hint: "Each file is centred and scaled to fill the live area." },
  centre: { label: "Centre", hint: "Each file is moved onto the canvas and centred, keeping its size relative to its old viewBox." },
  none: { label: "Guides only", hint: "Files aren't changed. The grid is just drawn in Quick Edit." }
}

const KIND_LABELS: Record<Keyline["kind"], string> = { square: "Square", circle: "Circle", portrait: "Portrait", landscape: "Landscape" }

interface Props {
  principles: DesignPrinciple[]
  onChange: (list: DesignPrinciple[]) => void
  /** How many presets use each principle */
  usage?: (id: string) => number
  /** The files in the list, to show what each variation matches */
  files?: Array<Pick<SvgItem, "name" | "handle" | "source">>
  onImport: () => void
  onExport: (list: DesignPrinciple[]) => void
  onClose: () => void
  initialId?: string | null
}

export function DesignPrinciplesDialog({ principles, onChange, usage, files = [], onImport, onExport, onClose, initialId }: Props) {
  const [openId, setOpenId] = useState<string | null>(() => initialId ?? principles[0]?.id ?? null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const dp = principles.find((p) => p.id === openId) ?? principles[0] ?? null
  const patch = (next: Partial<DesignPrinciple>) => dp && onChange(principles.map((p) => (p.id === dp.id ? { ...p, ...next } : p)))
  const missing = useMemo(() => builtInPrinciples().filter((b) => !principles.some((p) => p.id === b.id)), [principles])

  const add = (p: DesignPrinciple) => { onChange([...principles, p]); setOpenId(p.id) }
  const duplicate = () => dp && add({ ...structuredClone(dp), id: crypto.randomUUID(), name: `${dp.name} copy` })
  const remove = () => {
    if (!dp) return
    const at = principles.findIndex((p) => p.id === dp.id)
    const next = principles.filter((p) => p.id !== dp.id)
    onChange(next)
    setOpenId(next[Math.min(at, next.length - 1)]?.id ?? null)
    setConfirmDelete(false)
  }

  return (
    <Modal onCancel={onClose}>
      <div className="dp">
        <div className="settings__head">
          <h2 className="modal__title">Design principles</h2>
          <button className="btn btn--icon" aria-label="Close design principles" onClick={onClose}><IconX /></button>
        </div>
        <p className="settings__desc text-3">Brand icon rules. A preset can fit its files to one (Config › Design principle), and Quick Edit draws its grid, live area and keylines while you fine-tune.</p>
        <div className="dp__body">
          <nav className="dp__list" aria-label="Design principles">
            {principles.map((p) => (
              <button key={p.id} className={`dp__item${dp?.id === p.id ? " is-active" : ""}`} onClick={() => { setOpenId(p.id); setConfirmDelete(false) }}>
                <span className="dp__item-name">{p.name}</span>
                <span className="text-3">{p.width} × {p.height}{usage?.(p.id) ? ` · ${plural(usage(p.id), "preset")}` : ""}</span>
              </button>
            ))}
            {principles.length === 0 && <p className="text-3 dp__empty">None yet.</p>}
            <div className="dp__list-actions">
              <button className="btn btn--ghost btn--sm" onClick={() => add(createPrinciple())}><IconPlus /> New</button>
              {missing.length > 0 && (
                <button className="btn btn--ghost btn--sm" title={`Add back: ${missing.map((m) => m.name).join(", ")}`}
                  onClick={() => { onChange([...principles, ...missing]); setOpenId(missing[0].id) }}>Add built-ins</button>
              )}
              <button className="btn btn--ghost btn--sm" onClick={onImport}><IconUpload /> Import…</button>
              <button className="btn btn--ghost btn--sm" disabled={!principles.length} onClick={() => onExport(principles)}><IconDownload /> Export all…</button>
            </div>
          </nav>

          {dp ? (
            <div className="dp__editor" key={dp.id}>
              <div className="dp__row dp__row--top">
                <input className="input" aria-label="Name" value={dp.name} maxLength={120} onChange={(e) => patch({ name: e.target.value })} />
                <button className="btn btn--icon" title="Duplicate" aria-label="Duplicate" onClick={duplicate}><IconDuplicate /></button>
                <button className="btn btn--icon" title="Export this one" aria-label="Export this one" onClick={() => onExport([dp])}><IconDownload /></button>
                {confirmDelete
                  ? <button className="btn btn--danger btn--sm" autoFocus onBlur={() => setConfirmDelete(false)} onClick={remove}>Delete?</button>
                  : <button className="btn btn--icon" title="Delete" aria-label="Delete" onClick={() => setConfirmDelete(true)}><IconTrash /></button>}
              </div>
              <textarea className="input dp__desc" rows={2} placeholder="Notes: where the rules come from, what they're for"
                value={dp.description} onChange={(e) => patch({ description: e.target.value })} />
              <input className="input input--sm" placeholder="Guideline link (optional)" value={dp.source} onChange={(e) => patch({ source: e.target.value })} />

              <div className="dp__split">
                <div className="dp__fields">
                  <div className="dp__grid">
                    <Num label="Canvas width" value={dp.width} min={1} onChange={(width) => patch({ width })} />
                    <Num label="Canvas height" value={dp.height} min={1} onChange={(height) => patch({ height })} />
                    <Num label="Padding" value={dp.padding} min={0} max={Math.min(dp.width, dp.height) / 2 - 0.01} onChange={(padding) => patch({ padding })}
                      title="Space kept clear inside the canvas edge" />
                    <span className="dp__live text-3">Live area {+(dp.width - dp.padding * 2).toFixed(3)} × {+(dp.height - dp.padding * 2).toFixed(3)}</span>
                    <Num label="Stroke" value={dp.stroke} min={0} onChange={(stroke) => patch({ stroke })} title="Reference stroke weight" />
                    <Num label="Corner radius" value={dp.radius} min={0} onChange={(radius) => patch({ radius })} title="Reference corner radius, used to draw the keylines" />
                  </div>
                  <div className="field-row">
                    <span>Fit files</span>
                    <Segmented<GridFit> label="How files are fitted" value={dp.fit} onChange={(fit) => patch({ fit })}
                      options={(Object.keys(FIT_LABELS) as GridFit[]).map((k) => ({ value: k, label: FIT_LABELS[k].label, title: FIT_LABELS[k].hint }))} />
                  </div>
                  <p className="text-3 dp__hint">{FIT_LABELS[dp.fit].hint}</p>
                  <div className="field-row">
                    <span>Mask shape</span>
                    <select className="input input--sm" aria-label="Mask shape" value={dp.shape ?? ""}
                      onChange={(e) => patch({ shape: (e.target.value || null) as GuideShape | null })}>
                      <option value="">None</option>
                      <ShapeOptions />
                    </select>
                  </div>
                </div>
                <figure className="dp__preview">
                  <div className="dp__canvas" style={{ aspectRatio: `${dp.width} / ${dp.height}` }}>
                    <GridGuides dp={dp} />
                    {dp.shape && <ShapeGuide shape={dp.shape} forced />}
                  </div>
                  <figcaption className="text-3">Grid, <span className="dp__key-live">live area</span> and <span className="dp__key-line">keylines</span>{dp.alignmentKeylines?.some((a) => a.enabled) && <>, <span className="dp__key-align">alignment</span></>}</figcaption>
                </figure>
              </div>

              <KeylineList list={dp.keylines} onChange={(keylines) => patch({ keylines })} />
              <AlignmentList list={dp.alignmentKeylines ?? []} dp={dp} onChange={(alignmentKeylines) => patch({ alignmentKeylines })} />
              <VariationList list={dp.variations} files={files} onChange={(variations) => patch({ variations })} />
            </div>
          ) : (
            <div className="dp__editor dp__editor--empty text-3">Add a design principle, or import some.</div>
          )}
        </div>
      </div>
    </Modal>
  )
}

/** A small number input that only reports usable numbers */
function Num({ label, value, onChange, min = -1e6, max = 1e6, step = "any", title, bare }: {
  label: string, value: number, onChange: (n: number) => void, min?: number, max?: number, step?: number | "any", title?: string, bare?: boolean
}) {
  const [text, setText] = useState(String(value))
  const editing = useRef(false)
  useEffect(() => { if (!editing.current) setText(String(value)) }, [value])
  const input = (
    <input className="input input--sm dp__num" type="number" step={step} aria-label={bare ? label : undefined} title={title} value={text}
      onFocus={() => { editing.current = true }}
      onBlur={() => { editing.current = false; setText(String(value)) }}
      onChange={(e) => {
        setText(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) onChange(n)
      }} />
  )
  if (bare) return input
  return <label className="dp__field" title={title}><span className="text-3">{label}</span>{input}</label>
}

function KeylineList({ list, onChange }: { list: Keyline[], onChange: (list: Keyline[]) => void }) {
  const set = (id: string, p: Partial<Keyline>) => onChange(list.map((k) => (k.id === id ? { ...k, ...p } : k)))
  return (
    <section className="dp__section">
      <div className="plugins__head">
        <span className="panel__label">Keylines</span>
        <button className="link" onClick={() => onChange([...list, { id: crypto.randomUUID(), kind: "square", w: 18, h: 18 }])}>Add keyline</button>
      </div>
      <p className="text-3 dp__hint">Reference shapes, centred. With Keylines fit, each file is scaled into the square, portrait or landscape keyline that matches its shape. Circles are drawn as a guide.</p>
      {list.map((k) => (
        <div key={k.id} className="dp__row">
          <select className="input input--sm" aria-label="Keyline shape" value={k.kind} onChange={(e) => set(k.id, { kind: e.target.value as Keyline["kind"] })}>
            {(Object.keys(KIND_LABELS) as Keyline["kind"][]).map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
          </select>
          <Num label="Width" bare value={k.w} min={0.01} onChange={(w) => set(k.id, k.kind === "circle" || k.kind === "square" ? { w, h: w } : { w })} />
          <span className="text-3">×</span>
          <Num label="Height" bare value={k.h} min={0.01} onChange={(h) => set(k.id, k.kind === "circle" || k.kind === "square" ? { w: h, h } : { h })} />
          <LineStyleFields value={k} kind="keyline" compact onChange={(p) => set(k.id, p)} />
          <button className="btn btn--icon" aria-label="Remove keyline" title="Remove" onClick={() => onChange(list.filter((x) => x.id !== k.id))}><IconTrash /></button>
        </div>
      ))}
    </section>
  )
}

/** Line, width, colour and opacity for a guide, tucked into a small Style disclosure */
function LineStyleFields({ value, kind, onChange, compact, inline }: { value: GuideLineStyle, kind: keyof typeof LINE_DEFAULTS, onChange: (p: GuideLineStyle) => void, compact?: boolean, inline?: boolean }) {
  const d = LINE_DEFAULTS[kind]
  const styled = value.line !== undefined || value.strokeWidth !== undefined || value.colour !== undefined || value.opacity !== undefined
  const cls = kind === "keyline" ? "grid-guides__key" : "grid-guides__align"
  const fields = <>
        <Segmented<NonNullable<GuideLineStyle["line"]>> label="Line" value={value.line ?? d.line} onChange={(line) => onChange({ line })}
          options={[{ value: "solid", label: "Solid", title: "A solid line" }, { value: "dashed", label: "Dashed", title: "Dashes" }, { value: "dotted", label: "Dotted", title: "Dots" }]} />
        <label className="dp__field dp__field--inline" title="Line width in screen pixels, the same at any zoom"><span className="text-3">Width</span>
          <Num label="Line width" bare value={value.strokeWidth ?? d.strokeWidth} min={0.25} max={8} step={0.25} onChange={(strokeWidth) => onChange({ strokeWidth })} /></label>
        <label className="dp__field dp__field--inline" title="Line colour"><span className="text-3">Colour</span>
          <input type="color" className="dp__swatch" aria-label="Line colour" value={value.colour ?? d.colour} onChange={(e) => onChange({ colour: e.target.value })} /></label>
        <label className="dp__field dp__field--inline" title="Opacity: how see-through the line is, in %"><span className="text-3">Opacity</span>
          <Num label="Opacity %" bare value={Math.round((value.opacity ?? d.opacity) * 100)} min={0} max={100} step={5} onChange={(n) => onChange({ opacity: n / 100 })} /></label>
        {styled && <button type="button" className="link" title="Back to the usual look" onClick={() => onChange({ line: undefined, strokeWidth: undefined, colour: undefined, opacity: undefined })}>Default look</button>}
  </>
  if (inline) return fields
  return (
    <details className={`dp__style${compact ? " dp__style--compact" : ""}`}>
      <summary title="Line style, width, colour and opacity">
        <svg className="dp__style-sample" viewBox="0 0 32 8" aria-hidden="true"><path className={cls} d="M2 4H30" style={lineStyle(value, kind)} /></svg>
        {!compact && <span className="text-3">Style{styled ? " (custom)" : ""}</span>}
      </summary>
      <div className="dp__style-body">{fields}</div>
    </details>
  )
}

/** A list of numbers typed as "8, 16" */
function Offsets({ label, value, onChange }: { label: string, value: number[], onChange: (v: number[]) => void }) {
  const [text, setText] = useState(value.join(", "))
  const editing = useRef(false)
  useEffect(() => { if (!editing.current) setText(value.join(", ")) }, [value])
  return (
    <label className="dp__field dp__field--inline"><span className="text-3">{label}</span>
      <input className="input input--sm dp__offsets" value={text} placeholder="8, 16" aria-label={label}
        onFocus={() => { editing.current = true }} onBlur={() => { editing.current = false; setText(value.join(", ")) }}
        onChange={(e) => {
          setText(e.target.value)
          onChange(e.target.value.split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite))
        }} />
    </label>
  )
}

const ALIGN_KINDS = Object.keys(ALIGNMENT_LABELS) as AlignmentKeyline["kind"][]

/** Reference-only guides: drawn with the grid, never fitted to */
function AlignmentList({ list, dp, onChange }: { list: AlignmentKeyline[], dp: DesignPrinciple, onChange: (list: AlignmentKeyline[]) => void }) {
  const set = (id: string, p: Partial<AlignmentKeyline>) => onChange(list.map((a) => (a.id === id ? { ...a, ...p } : a)))
  const sort = useDragSort(list, onChange)
  return (
    <section className="dp__section">
      <div className="plugins__head">
        <span className="panel__label">Alignment keylines {list.length > 0 && <span className="text-3">{list.filter((a) => a.enabled).length}/{list.length}</span>}</span>
        <select className="input input--sm dp__add-align" aria-label="Add an alignment keyline" value=""
          onChange={(e) => { if (e.target.value) onChange([...list, createAlignment(e.target.value as AlignmentKeyline["kind"], dp)]) }}>
          <option value="">Add…</option>
          {ALIGN_KINDS.map((k) => <option key={k} value={k}>{ALIGNMENT_LABELS[k]}</option>)}
        </select>
      </div>
      <p className="text-3 dp__hint">Reference only. Not used for Smart Sizing or masks. Drawn fainter than the keylines, to line artwork up by eye: a centre circle, diagonals, centre lines or your own lines.</p>
      {list.map((a) => (
        <div key={a.id} className={`dp__variation dp__align${a.enabled ? "" : " is-off"}`} {...sort.rowProps(a.id)}>
          <div className="dp__row">
            {list.length > 1 && <span className="rule__grip" title="Drag to reorder" {...sort.handleProps(a.id)}><IconGrip /></span>}
            <input type="checkbox" className="checkbox" aria-label={`${a.name || ALIGNMENT_LABELS[a.kind]} on`} checked={a.enabled} onChange={(e) => set(a.id, { enabled: e.target.checked })} />
            <select className="input input--sm" aria-label="Alignment keyline kind" value={a.kind}
              onChange={(e) => { const kind = e.target.value as AlignmentKeyline["kind"]; const fresh = createAlignment(kind, dp); set(a.id, { ...fresh, id: a.id, enabled: a.enabled, name: a.name === ALIGNMENT_LABELS[a.kind] ? fresh.name : a.name }) }}>
              {ALIGN_KINDS.map((k) => <option key={k} value={k}>{ALIGNMENT_LABELS[k]}</option>)}
            </select>
            <input className="input input--sm dp__note" placeholder="Name" aria-label="Alignment keyline name" value={a.name} onChange={(e) => set(a.id, { name: e.target.value })} />
            <button className="btn btn--icon" aria-label="Remove alignment keyline" title="Remove" onClick={() => onChange(list.filter((x) => x.id !== a.id))}><IconTrash /></button>
          </div>
          <div className="dp__row dp__row--indent dp__align-fields">
              {a.kind === "circle" && <label className="dp__field dp__field--inline"><span className="text-3">Diameter</span>
                <Num label="Diameter" bare value={a.w} min={0.01} onChange={(w) => set(a.id, { w, h: w })} /></label>}
              {a.kind === "rect" && <>
                <label className="dp__field dp__field--inline"><span className="text-3">W</span><Num label="Width" bare value={a.w} min={0.01} onChange={(w) => set(a.id, { w })} /></label>
                <label className="dp__field dp__field--inline"><span className="text-3">H</span><Num label="Height" bare value={a.h} min={0.01} onChange={(h) => set(a.id, { h })} /></label>
                <label className="dp__field dp__field--inline"><span className="text-3">Radius</span><Num label="Corner radius" bare value={a.r ?? 0} min={0} onChange={(r) => set(a.id, { r })} /></label>
              </>}
              {a.kind === "diagonals" && <Segmented<"canvas" | "live"> label="Diagonals across" value={a.over ?? "canvas"} onChange={(over) => set(a.id, { over })}
                options={[{ value: "canvas", label: "Canvas", title: "Corner to corner of the whole canvas" }, { value: "live", label: "Live area", title: "Corner to corner of the live area" }]} />}
              {a.kind === "lines" && <>
                <Offsets label="Vertical at x" value={a.xs ?? []} onChange={(xs) => set(a.id, { xs })} />
                <Offsets label="Horizontal at y" value={a.ys ?? []} onChange={(ys) => set(a.id, { ys })} />
              </>}
              <LineStyleFields value={a} kind="alignment" inline onChange={(p) => set(a.id, p)} />
          </div>
          <span className="text-3 dp__align-text">{alignmentText(a)}</span>
        </div>
      ))}
    </section>
  )
}

function VariationList({ list, files, onChange }: { list: DpVariation[], files: Array<Pick<SvgItem, "name" | "handle" | "source">>, onChange: (list: DpVariation[]) => void }) {
  const set = (id: string, p: Partial<DpVariation>) => onChange(list.map((v) => (v.id === id ? { ...v, ...p } : v)))
  return (
    <section className="dp__section">
      <div className="plugins__head">
        <span className="panel__label">File variations</span>
        <button className="link" onClick={() => onChange([...list, createVariation()])}>Add variation</button>
      </div>
      <p className="text-3 dp__hint">Small tweaks for particular icons, picked by file name or handle (the host's handle, else the root id, else the file name). <code>*</code> matches anything, <code>?</code> one character, commas separate patterns. Scale is around the centre, X and Y move in canvas units, before any Quick Edit tuning.</p>
      {list.map((v) => {
        const n = files.filter((f) => variationMatches({ ...v, enabled: true }, f)).length
        return (
          <div key={v.id} className={`dp__variation${v.enabled ? "" : " is-off"}`}>
            <div className="dp__row">
              <input type="checkbox" className="checkbox" aria-label="On" checked={v.enabled} onChange={(e) => set(v.id, { enabled: e.target.checked })} />
              <Segmented<DpVariation["by"]> label="Match by" value={v.by} onChange={(by) => set(v.id, { by })}
                options={[{ value: "name", label: "Name", title: "Match the file name, without .svg" }, { value: "handle", label: "Handle", title: "Match the handle or root id" }]} />
              <input className="input input--sm input--mono dp__match" placeholder="arrow-*, chevron-?" value={v.match} onChange={(e) => set(v.id, { match: e.target.value })} />
              <span className="text-3 dp__matches" title="Files in the list it matches">{v.match.trim() ? plural(n, "file") : ""}</span>
              <button className="btn btn--icon" aria-label="Remove variation" title="Remove" onClick={() => onChange(list.filter((x) => x.id !== v.id))}><IconTrash /></button>
            </div>
            <div className="dp__row dp__row--indent">
              <label className="dp__field dp__field--inline"><span className="text-3">Scale ×</span><Num label="Scale" bare value={v.scale} min={0.0001} onChange={(scale) => set(v.id, { scale })} /></label>
              <label className="dp__field dp__field--inline"><span className="text-3">X</span><Num label="X" bare value={v.x} onChange={(x) => set(v.id, { x })} /></label>
              <label className="dp__field dp__field--inline"><span className="text-3">Y</span><Num label="Y" bare value={v.y} onChange={(y) => set(v.id, { y })} /></label>
              <input className="input input--sm dp__note" placeholder="Note" value={v.note} onChange={(e) => set(v.id, { note: e.target.value })} />
            </div>
          </div>
        )
      })}
    </section>
  )
}
