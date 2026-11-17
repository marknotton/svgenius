import { IconDownload, IconPencil, IconPlus, IconReset, IconStar, IconTrash, IconUpload } from "../icons"
import { plural } from "../lib/format"
import type { PresetActions } from "../hooks/useAppSettings"
import type { AppSettings, Preset } from "../lib/types"
import { PluginList } from "./PluginList"
import { PresetSelect } from "./PresetSelect"
import { Toggle } from "./Toggle"

interface Props {
  settings: AppSettings
  preset: Preset
  usage: number
  actions: PresetActions
  onNew: () => void
  onRename: () => void
  onDelete: () => void
  onImport: () => void
  onExport: () => void
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
      </div>

      <div className="panel__scroll">
        <section className="panel__section">
          <div className="panel__label">Output</div>
          <Toggle label="Multipass" hint="Run the plugins repeatedly until nothing more is saved"
            checked={s.multipass} onChange={(v) => edit((x) => ({ ...x, multipass: v }))} />
          <Toggle label="Pretty print" hint="Indent the markup. Bigger files, easier to read"
            checked={s.pretty} onChange={(v) => edit((x) => ({ ...x, pretty: v }))} />
          <label className="range" title="Decimal places kept in numbers, paths and transforms">
            <span className="range__label">Precision</span>
            <input type="range" min={0} max={8} step={1} value={s.floatPrecision}
              onChange={(e) => edit((x) => ({ ...x, floatPrecision: Number(e.target.value) }))} />
            <span className="range__value">{s.floatPrecision}</span>
          </label>
        </section>

        <section className="panel__section">
          <PluginList
            settings={s}
            onToggle={(name, on) => edit((x) => ({ ...x, plugins: { ...x.plugins, [name]: on } }))}
            onSetGroup={(names, on) => edit((x) => ({
              ...x,
              plugins: { ...x.plugins, ...Object.fromEntries(names.map((n) => [n, on])) }
            }))}
          />
        </section>
      </div>

      <div className="panel__foot">
        <button className="btn btn--ghost btn--sm" onClick={() => actions.reset(preset.id)} title="Reset this preset to SVGO's defaults">
          <IconReset /> Reset
        </button>
        <div className="toolbar__spacer" />
        <button className="btn btn--ghost btn--sm" onClick={p.onImport} title="Import presets from a JSON file"><IconUpload /> Import</button>
        <button className="btn btn--ghost btn--sm" onClick={p.onExport} title="Export all presets to a JSON file"><IconDownload /> Export</button>
      </div>
    </aside>
  )
}
