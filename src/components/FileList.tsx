import type { MouseEvent } from "react"
import { IconFile, IconFolder, IconTrash } from "../icons"
import { plural } from "../lib/format"
import type { AppSettings, Preset, SvgItem } from "../lib/types"
import { FileRow } from "./FileRow"
import { PresetSelect } from "./PresetSelect"
import { THUMB_PX } from "./Thumb"
import { ViewControls } from "./ViewControls"

interface Props {
  items: SvgItem[]
  selection: Set<string>
  settings: AppSettings
  defaultPreset: Preset
  isStale: (item: SvgItem) => boolean
  onToggle: (id: string, e: MouseEvent) => void
  onSelectAll: (all: boolean) => void
  onPreset: (id: string, presetId: string | null) => void
  onNewPreset: (item: SvgItem) => void
  onDefaultPreset: (id: string) => void
  onAddFiles: () => void
  onAddFolder: () => void
  onRemove: () => void
  onView: (patch: Partial<Pick<AppSettings, "thumbSize" | "backdrop">>) => void
}

export function FileList(p: Props) {
  const { items, selection, settings } = p
  const allSelected = items.length > 0 && selection.size === items.length
  const someSelected = selection.size > 0 && !allSelected

  return (
    <section className="list">
      <div className="toolbar">
        <input
          type="checkbox"
          className="checkbox"
          aria-label="Select all"
          checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = someSelected }}
          onChange={() => p.onSelectAll(!allSelected)}
        />
        <span className="toolbar__count">
          {selection.size > 0 ? `${selection.size} of ${plural(items.length, "file")} selected` : plural(items.length, "file")}
        </span>
        <div className="toolbar__group">
          <button className="btn btn--ghost btn--sm" onClick={p.onAddFiles}><IconFile /> Files</button>
          <button className="btn btn--ghost btn--sm" onClick={p.onAddFolder}><IconFolder /> Folder</button>
          <button className="btn btn--ghost btn--sm" onClick={p.onRemove} disabled={items.length === 0}
            title={selection.size ? "Remove selected from the list" : "Clear the list"}>
            <IconTrash /> {selection.size ? "Remove" : "Clear"}
          </button>
        </div>
        <div className="toolbar__spacer" />
        <label className="field-inline" title="Used by every file that hasn't got its own preset">
          <span>Default preset</span>
          <PresetSelect label="Default preset" presets={settings.presets} value={settings.defaultPresetId}
            onChange={(id) => id && p.onDefaultPreset(id)} />
        </label>
        <ViewControls
          thumbSize={settings.thumbSize}
          backdrop={settings.backdrop}
          onThumbSize={(thumbSize) => p.onView({ thumbSize })}
          onBackdrop={(backdrop) => p.onView({ backdrop })}
        />
      </div>

      <ul className={`file-list file-list--${settings.thumbSize}`}>
        {items.map((item) => (
          <FileRow
            key={item.id}
            item={item}
            selected={selection.has(item.id)}
            stale={p.isStale(item)}
            thumbPx={THUMB_PX[settings.thumbSize]}
            backdrop={settings.backdrop}
            presets={settings.presets}
            defaultPreset={p.defaultPreset}
            onToggle={p.onToggle}
            onPreset={p.onPreset}
            onNewPreset={p.onNewPreset}
          />
        ))}
      </ul>
    </section>
  )
}
