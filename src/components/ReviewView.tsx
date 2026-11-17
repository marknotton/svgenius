import { memo, type ReactNode } from "react"
import { fmtNum, getAttr, parseViewBox, rootTag, svgSize } from "../lib/svgRoot"
import { IconBack } from "../icons"
import { formatBytes, formatSaving, plural, savingPercent } from "../lib/format"
import type { AppSettings, Backdrop, Preset, SvgItem } from "../lib/types"
import { defaultLabel, PresetSelect } from "./PresetSelect"
import { Thumb } from "./Thumb"

interface Props {
  items: SvgItem[]
  settings: AppSettings
  defaultPreset: Preset
  onBack: () => void
  onPreset: (ids: string[], presetId: string | null) => void
  onNewPreset: (item: SvgItem) => void
  viewControls: ReactNode
  cssBar: ReactNode
}

export function ReviewView({ items, settings, defaultPreset, ...p }: Props) {
  const ids = items.map((i) => i.id)
  const shared = items.every((i) => i.presetId === items[0]?.presetId) ? items[0]?.presetId ?? null : undefined
  const before = items.reduce((n, i) => n + i.size, 0)
  const after = items.reduce((n, i) => n + (i.result?.size ?? i.size), 0)
  const px = settings.reviewPx

  return (
    <section className="list review">
      <div className="toolbar">
        <button className="btn btn--ghost btn--sm" onClick={p.onBack}><IconBack /> Back</button>
        <span className="toolbar__count">
          Reviewing {plural(items.length, "file")} · {formatBytes(before)} → {formatBytes(after)}{" "}
          <span className={`pill ${savingPercent(before, after) > 0 ? "pill--success" : "pill--warning"}`}>{formatSaving(before, after)}</span>
        </span>
        <div className="toolbar__spacer" />
        <label className="field-inline" title="Assign a preset to every file in this review">
          <span>Preset for all</span>
          {shared === undefined ? (
            <select className="select" aria-label="Preset for all" value="__mixed__"
              onChange={(e) => p.onPreset(ids, e.target.value === "__default__" ? null : e.target.value)}>
              <option value="__mixed__" disabled>Mixed</option>
              <option value="__default__">{defaultLabel(defaultPreset)}</option>
              {settings.presets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          ) : (
            <PresetSelect label="Preset for all" presets={settings.presets} defaultPreset={defaultPreset}
              value={shared} onChange={(id) => p.onPreset(ids, id)} />
          )}
        </label>
        {p.viewControls}
      </div>
      {p.cssBar}

      <div className="review__scroll">
        {items.map((item) => (
          <ReviewRow
            key={item.id}
            item={item}
            px={px}
            backdrop={settings.backdrop}
            presets={settings.presets}
            defaultPreset={defaultPreset}
            onPreset={(id) => p.onPreset([item.id], id)}
            onNewPreset={p.onNewPreset}
          />
        ))}
      </div>
    </section>
  )
}

interface RowProps {
  item: SvgItem
  px: number
  backdrop: Backdrop
  presets: Preset[]
  defaultPreset: Preset
  onPreset: (id: string | null) => void
  onNewPreset: (item: SvgItem) => void
}

const ReviewRow = memo(function ReviewRow({ item, px, backdrop, presets, defaultPreset, onPreset, onNewPreset }: RowProps) {
  const after = item.result?.size
  const pct = after !== undefined ? savingPercent(item.size, after) : 0

  return (
    <article className="review-row">
      <header className="review-row__head">
        <span className="review-row__name" title={item.path}>{item.relPath}</span>
        <PresetSelect label={`Preset for ${item.name}`} presets={presets} defaultPreset={defaultPreset}
          value={item.presetId} onChange={onPreset} onCreateNew={() => onNewPreset(item)} newLabel="New preset for this file…" />
      </header>
      <div className="review-row__panes">
        <figure className="pane">
          <Thumb svg={item.source} size={px} backdrop={backdrop} label={`${item.name} before`} />
          <figcaption><span className="text-2">Before</span> {formatBytes(item.size)} <Dims svg={item.source} /></figcaption>
        </figure>
        <figure className="pane">
          <div className="pane__wrap">
            <Thumb svg={item.result?.output} size={px} backdrop={backdrop} label={`${item.name} after`} />
            {item.status === "running" && <span className="pane__busy"><span className="spinner" /></span>}
          </div>
          <figcaption>
            <span className="text-2">After</span>{" "}
            {item.status === "error" ? <span className="pill pill--error" title={item.error}>Error</span>
              : after !== undefined ? (
                <>
                  {formatBytes(after)} <Dims svg={item.result?.output} />{" "}
                  <span className={`pill ${pct > 0 ? "pill--success" : "pill--warning"}`}>{formatSaving(item.size, after)}</span>
                  {item.result?.replaced ? <span className="pill" title="Find & replace and attribute rule changes">{plural(item.result.replaced, "change")}</span> : null}
                </>
              ) : "…"}
          </figcaption>
        </figure>
      </div>
      {item.status === "error" && <p className="review-row__error">{item.error}</p>}
    </article>
  )
})

function Dims({ svg }: { svg?: string }) {
  const size = svgSize(svg)
  const tag = svg ? rootTag(svg) : null
  const vb = tag ? parseViewBox(getAttr(tag, "viewBox")) : null
  if (!size) return null
  return (
    <span className="text-3" title="Width × height (viewBox width × height)">
      {fmtNum(size.w, 2)} × {fmtNum(size.h, 2)}
      {vb && (Math.abs(vb.w - size.w) > 0.005 || Math.abs(vb.h - size.h) > 0.005) && <> (viewBox {fmtNum(vb.w, 2)} × {fmtNum(vb.h, 2)})</>}
    </span>
  )
}
