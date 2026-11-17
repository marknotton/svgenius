import { memo, useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import { fmtNum, getAttr, parseViewBox, rootTag, svgSize } from "../lib/svgRoot"
import { formatBytes, formatSaving, plural, savingPercent } from "../lib/format"
import type { FileTag } from "../lib/tags"
import type { Backdrop, Preset, SvgItem } from "../lib/types"
import { PresetSelect } from "./PresetSelect"
import { Thumb } from "./Thumb"

interface Props {
  item: SvgItem
  selected: boolean
  focused: boolean
  stale: boolean
  thumbPx: number
  compare: boolean
  details: boolean
  tags: FileTag[]
  backdrop: Backdrop
  presets: Preset[]
  defaultPreset: Preset
  onToggle: (id: string, e: MouseEvent) => void
  onRowClick: (id: string, e: MouseEvent) => void
  onContextMenu: (id: string, e: MouseEvent) => void
  onPreset: (id: string, presetId: string | null) => void
  onNewPreset: (item: SvgItem) => void
}

const OWN = "__own__"

export const FileRow = memo(function FileRow(p: Props) {
  const { item, selected, stale, thumbPx, backdrop } = p
  const dir = item.relPath.includes("/") ? item.relPath.slice(0, item.relPath.lastIndexOf("/")) : ""
  const shown = item.result?.output ?? item.source
  const size = useMemo(() => svgSize(shown), [shown])
  const original = useMemo(() => svgSize(item.source), [item.source])
  const vb = useMemo(() => {
    const tag = shown ? rootTag(shown) : null
    return tag ? parseViewBox(getAttr(tag, "viewBox")) : null
  }, [shown])
  const vbDiffers = vb && size && (Math.abs(vb.w - size.w) > 0.005 || Math.abs(vb.h - size.h) > 0.005)
  const dims = size ? `${fmtNum(size.w, 2)} × ${fmtNum(size.h, 2)}` : ""
  const resized = size && original && (Math.abs(size.w - original.w) > 0.005 || Math.abs(size.h - original.h) > 0.005)

  // Flash the dimensions when they change, so size edits are easy to spot
  const [flash, setFlash] = useState(0)
  const lastDims = useRef(dims)
  useEffect(() => {
    if (lastDims.current && dims && lastDims.current !== dims) setFlash((n) => n + 1)
    lastDims.current = dims
  }, [dims])

  // Gallery: big before/after previews, just the name and sizes
  if (!p.details) {
    return (
      <li
        className={`file-card${selected ? " is-selected" : ""}${p.focused ? " is-focused" : ""}`}
        data-id={item.id}
        onClick={(e) => p.onRowClick(item.id, e)}
        onContextMenu={(e) => p.onContextMenu(item.id, e)}
        aria-selected={selected}
      >
        <div className="file-card__head">
          <input
            type="checkbox"
            className="checkbox"
            checked={selected}
            aria-label={`Select ${item.name}`}
            onClick={(e) => { e.stopPropagation(); p.onToggle(item.id, e) }}
            onChange={() => {}}
          />
          <span className="file-card__name" title={item.path}>{item.name}</span>
          <Stats item={item} stale={stale} />
        </div>
        <div className="file-card__panes">
          <figure className="file-card__pane">
            <Thumb svg={item.source} size={thumbPx} backdrop={backdrop} label={`${item.name} before`} />
            <figcaption className="text-3">Before{original && ` · ${fmtNum(original.w, 2)} × ${fmtNum(original.h, 2)}`}</figcaption>
          </figure>
          <figure className="file-card__pane">
            <Thumb svg={item.result?.output} size={thumbPx} backdrop={backdrop} label={`${item.name} after`} />
            <figcaption className="text-3">
              After{size && item.result && <> · <span key={flash} className={`file-row__dims${flash ? " is-flash" : ""}`}>{dims}</span></>}
            </figcaption>
          </figure>
        </div>
      </li>
    )
  }

  return (
    <li
      className={`file-row${selected ? " is-selected" : ""}${p.focused ? " is-focused" : ""}`}
      data-id={item.id}
      onClick={(e) => p.onRowClick(item.id, e)}
      onContextMenu={(e) => p.onContextMenu(item.id, e)}
      aria-selected={selected}
    >
      <input
        type="checkbox"
        className="checkbox"
        checked={selected}
        aria-label={`Select ${item.name}`}
        onClick={(e) => { e.stopPropagation(); p.onToggle(item.id, e) }}
        onChange={() => {}}
      />
      {p.compare ? (
        <div className="file-row__compare">
          <Thumb svg={item.source} size={thumbPx} backdrop={backdrop} label={`${item.name} before`} />
          <Thumb svg={item.result?.output} size={thumbPx} backdrop={backdrop} label={`${item.name} after`} />
        </div>
      ) : (
        <Thumb svg={item.result?.output ?? item.source} size={thumbPx} backdrop={backdrop} label={item.name} />
      )}
      <div className="file-row__meta">
        <div className="file-row__name" title={item.path}>{item.name}</div>
        <div className="file-row__dir" title={item.path}>
          {size && (
            <span key={flash} className={`file-row__dims${flash ? " is-flash" : ""}`} title="Width × height">
              {p.details && resized && original && <span className="strike text-3">{fmtNum(original.w, 2)} × {fmtNum(original.h, 2)}</span>}
              {p.details && resized && " → "}
              {dims}
            </span>
          )}
          {vbDiffers && <span className="file-row__dims" title="viewBox width × height"> · viewBox {fmtNum(vb.w, 2)} × {fmtNum(vb.h, 2)}</span>}
          {size && dir && " · "}
          {dir}
        </div>
        {p.details && p.tags.length > 0 && (
          <div className="tags">
            {p.tags.map((t) => <span key={t.label} className={`tag${t.tone ? ` tag--${t.tone}` : ""}`} title={t.title}>{t.label}</span>)}
          </div>
        )}
      </div>
      {item.config ? (
        <select className="select file-row__preset" aria-label={`Preset for ${item.name}`} value={OWN}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => p.onPreset(item.id, e.target.value === "__default__" ? null : e.target.value)}>
          <option value={OWN}>Own settings</option>
          <option disabled>──────────</option>
          <option value="__default__">Use default preset</option>
          {p.presets.map((x) => <option key={x.id} value={x.id}>Use {x.name}</option>)}
        </select>
      ) : (
        <PresetSelect
          className="file-row__preset"
          label={`Preset for ${item.name}`}
          presets={p.presets}
          defaultPreset={p.defaultPreset}
          value={item.presetId}
          onChange={(id) => p.onPreset(item.id, id)}
          onCreateNew={() => p.onNewPreset(item)}
          newLabel="New preset for this file…"
        />
      )}
      <Stats item={item} stale={stale} />
    </li>
  )
})

function Stats({ item, stale }: { item: SvgItem, stale: boolean }) {
  if (item.status === "loading") return <div className="file-row__stats"><span className="spinner" /></div>
  if (item.status === "error") return <div className="file-row__stats"><span className="pill pill--error" title={item.error}>Error</span></div>
  if (item.status === "running") {
    return <div className="file-row__stats"><span className="text-2">{formatBytes(item.size)}</span><span className="spinner" /></div>
  }
  if (!item.result) {
    return <div className="file-row__stats"><span className="text-2">{formatBytes(item.size)}</span></div>
  }
  const pct = savingPercent(item.size, item.result.size)
  return (
    <div className={`file-row__stats${stale ? " is-stale" : ""}`} title={stale ? "Settings have changed since this ran" : undefined}>
      {item.result.replaced > 0 && <span className="pill" title="Find & replace and attribute rule changes">{plural(item.result.replaced, "change")}</span>}
      <span className="text-3 strike">{formatBytes(item.size)}</span>
      <span>{formatBytes(item.result.size)}</span>
      <span className={`pill ${pct > 0 ? "pill--success" : "pill--warning"}`}>{formatSaving(item.size, item.result.size)}</span>
    </div>
  )
}
