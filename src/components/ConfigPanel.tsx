import { IconDownload, IconPencil, IconPlus, IconReset, IconStar, IconTrash, IconUpload } from "../icons"
import { plural } from "../lib/format"
import type { PresetActions } from "../hooks/useAppSettings"
import type { AppSettings, CustomPlugin, Preset } from "../lib/types"
import { PresetEditor } from "./PresetEditor"
import { PresetSelect } from "./PresetSelect"

interface Props {
  settings: AppSettings
  preset: Preset
  usage: number
  actions: PresetActions
  onNew: () => void
  onRename: () => void
  onDelete: () => void
  onReset: () => void
  onImport: () => void
  onExport: () => void
  onLoadPlugin: () => void
  onRemovePlugin: (p: CustomPlugin) => void
}

export function ConfigPanel({ settings, preset, usage, actions, ...p }: Props) {
  const s = preset.settings
  const isDefault = preset.id === settings.defaultPresetId
  const edit = actions.edit.bind(null, preset.id)

  return (
    <aside className="panel" aria-label="SVGO settings">
      <div className="panel__head">
        <div className="panel__label">Editing preset</div>
        <div className="panel__preset-row">
          <PresetSelect
            className="panel__preset-select"
            label="Preset to edit"
            presets={settings.presets}
            value={preset.id}
            onChange={(id) => id && actions.openInPanel(id)}
            onCreateNew={p.onNew}
          />
          <button className="btn btn--icon" title="New preset (copies this one)" aria-label="New preset" onClick={p.onNew}><IconPlus /></button>
          <button className="btn btn--icon" title="Rename" aria-label="Rename preset" onClick={p.onRename}><IconPencil /></button>
          <button className="btn btn--icon" title="Delete" aria-label="Delete preset" onClick={p.onDelete}
            disabled={settings.presets.length <= 1}><IconTrash /></button>
        </div>
        <div className="panel__meta">
          <button
            className={`chip${isDefault ? " chip--active" : ""}`}
            onClick={() => actions.setDefault(preset.id)}
            disabled={isDefault}
            title={isDefault ? "Files without their own preset use this one" : "Make this the default for all files"}
          >
            <IconStar filled={isDefault} width={12} height={12} /> {isDefault ? "Default preset" : "Make default"}
          </button>
          <span className="text-3">{usage ? `Used by ${plural(usage, "file")}` : "Not used by any files yet"}</span>
        </div>
        <div className="panel__actions">
          <button className="btn btn--ghost btn--sm" onClick={p.onReset} title="Reset this preset to SVGO's defaults">
            <IconReset /> Reset
          </button>
          <div className="toolbar__spacer" />
          {settings.advanced && <>
            <button className="btn btn--ghost btn--sm" onClick={p.onImport} title="Import presets from a JSON file"><IconUpload /> Import</button>
            <button className="btn btn--ghost btn--sm" onClick={p.onExport} title="Export all presets to a JSON file"><IconDownload /> Export</button>
          </>}
        </div>
      </div>

      <div className="panel__scroll">
        <PresetEditor settings={s} edit={edit} customPlugins={settings.customPlugins}
          onLoadPlugin={p.onLoadPlugin} onRemovePlugin={p.onRemovePlugin} advanced={settings.advanced} />
      </div>
    </aside>
  )
}
