import { memo, type MouseEvent } from "react"
import { formatBytes, formatSaving, plural, savingPercent } from "../lib/format"
import type { Backdrop, Preset, SvgItem } from "../lib/types"
import { PresetSelect } from "./PresetSelect"
import { Thumb } from "./Thumb"

interface Props {
  item: SvgItem
  selected: boolean
  stale: boolean
  thumbPx: number
  backdrop: Backdrop
  presets: Preset[]
  defaultPreset: Preset
  onToggle: (id: string, e: MouseEvent) => void
  onPreset: (id: string, presetId: string | null) => void
  onNewPreset: (item: SvgItem) => void
}

export const FileRow = memo(function FileRow(p: Props) {
  const { item, selected, stale, thumbPx, backdrop } = p
  const dir = item.relPath.includes("/") ? item.relPath.slice(0, item.relPath.lastIndexOf("/")) : ""

  return (
    <li
      className={`file-row${selected ? " is-selected" : ""}`}
      onClick={(e) => p.onToggle(item.id, e)}
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
      <Thumb svg={item.result?.output ?? item.source} size={thumbPx} backdrop={backdrop} label={item.name} />
      <div className="file-row__meta">
        <div className="file-row__name" title={item.path}>{item.name}</div>
        {dir && <div className="file-row__dir" title={item.path}>{dir}</div>}
      </div>
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
      <span className="text-3 strike">{formatBytes(item.size)}</span>
      {item.result.replaced > 0 && <span className="pill" title="Find & replace and attribute rule changes">{plural(item.result.replaced, "change")}</span>}
      <span>{formatBytes(item.result.size)}</span>
      <span className={`pill ${pct > 0 ? "pill--success" : "pill--warning"}`}>{formatSaving(item.size, item.result.size)}</span>
    </div>
  )
}
