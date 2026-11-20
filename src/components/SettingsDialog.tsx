import { useState } from "react"
import { useDragSort } from "../hooks/useDragSort"
import type { PresetActions } from "../hooks/useAppSettings"
import { IconDownload, IconDuplicate, IconGrip, IconStar, IconTrash, IconUpload, IconX } from "../icons"
import { plural } from "../lib/format"
import type { AppSettings, Backdrop, ThemeChoice } from "../lib/types"
import { Modal } from "./Dialogs"
import { Segmented } from "./Segmented"
import { Toggle } from "./Toggle"

// ── App settings (⌘,) ─────────────────────────────────────────────────────────

interface Props {
  settings: AppSettings
  update: (fn: (s: AppSettings) => AppSettings) => void
  actions: PresetActions
  usage: (presetId: string) => number
  onDeletePreset: (id: string) => void
  onImport: () => void
  onExport: () => void
  onResetLayout: () => void
  onClose: () => void
}

export function SettingsDialog({ settings, update, actions, usage, ...p }: Props) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const sort = useDragSort(settings.presets, (presets) => update((s) => ({ ...s, presets })))
  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => update((s) => ({ ...s, [key]: value }))

  return (
    <Modal onCancel={p.onClose}>
      <div className="settings">
        <div className="settings__head">
          <h2 className="modal__title">Settings</h2>
          <button className="btn btn--icon" aria-label="Close settings" onClick={p.onClose}><IconX /></button>
        </div>

        <section className="settings__section">
          <h3 className="settings__title">Presets</h3>
          <p className="settings__desc text-3">Drag to reorder. The star marks the default.</p>
          <ul className="preset-list">
            {settings.presets.map((preset) => {
              const isDefault = preset.id === settings.defaultPresetId
              const n = usage(preset.id)
              return (
                <li key={preset.id} className="preset-list__row" {...sort.rowProps(preset.id)}>
                  <span className="rule__grip" title="Drag to reorder" {...sort.handleProps(preset.id)}><IconGrip /></span>
                  <button className={`btn btn--icon${isDefault ? " is-default" : ""}`} aria-pressed={isDefault}
                    title={isDefault ? "Default preset: used by every file without its own" : "Make this the default preset"}
                    onClick={() => actions.setDefault(preset.id)}><IconStar filled={isDefault} /></button>
                  <input className="input input--sm" defaultValue={preset.name} aria-label={`Name of ${preset.name}`} maxLength={80}
                    onBlur={(e) => {
                      const name = e.target.value.trim()
                      if (!name) e.target.value = preset.name
                      else if (name !== preset.name) actions.rename(preset.id, name)
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur() }} />
                  <span className="text-3 preset-list__usage">{n ? plural(n, "file") : ""}</span>
                  <button className="btn btn--ghost btn--sm" onClick={() => { actions.openInPanel(preset.id); p.onClose() }}>Edit</button>
                  <button className="btn btn--icon" aria-label={`Duplicate ${preset.name}`} title="Duplicate preset"
                    onClick={() => actions.duplicate(preset.id)}><IconDuplicate /></button>
                  {confirmDelete === preset.id ? (
                    <button className="btn btn--danger btn--sm" onClick={() => { p.onDeletePreset(preset.id); setConfirmDelete(null) }}
                      onBlur={() => setConfirmDelete(null)} autoFocus>Delete?</button>
                  ) : (
                    <button className="btn btn--icon" aria-label={`Delete ${preset.name}`} title="Delete preset"
                      disabled={settings.presets.length <= 1} onClick={() => setConfirmDelete(preset.id)}><IconTrash /></button>
                  )}
                </li>
              )
            })}
          </ul>
          {settings.advanced && (
            <div className="settings__actions">
              <button className="btn btn--ghost btn--sm" onClick={p.onImport}><IconUpload /> Import presets…</button>
              <button className="btn btn--ghost btn--sm" onClick={p.onExport}><IconDownload /> Export presets…</button>
            </div>
          )}
        </section>

        <section className="settings__section">
          <h3 className="settings__title">Working</h3>
          <p className="settings__desc text-3">How files are run and exported.</p>
          <Toggle label="Live updates" hint="Re-run the files on screen as you change settings"
            checked={settings.liveUpdates} onChange={(v) => set("liveUpdates", v)} />
          <Toggle label="Keep folder structure on export" hint="Recreate sub-folders inside the export folder"
            checked={settings.keepStructure} onChange={(v) => set("keepStructure", v)} />
        </section>

        <section className="settings__section">
          <h3 className="settings__title">Appearance</h3>
          <p className="settings__desc text-3">What the app shows you.</p>
          <Toggle label="Advanced options" hint="Show every option: viewBox and contents editing, rules, all SVGO plugins, the markup editor, import and export, and Beta tools"
            checked={settings.advanced} onChange={(v) => set("advanced", v)} />
          <div className="field-row">
            <span>Editor tools</span>
            <Segmented<"top" | "left"> label="Editor tools position" value={settings.editorToolbar} onChange={(v) => set("editorToolbar", v)}
              options={[{ value: "top", label: "Top", title: "A row across the top of the editor" }, { value: "left", label: "Left", title: "A column down the left of the editor" }]} />
          </div>
          <div className="field-row">
            <span>Theme</span>
            <Segmented<ThemeChoice> label="App theme" value={settings.theme} onChange={(v) => set("theme", v)}
              options={[{ value: "system", label: "System", title: "Follow your computer's light or dark setting" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
          </div>
        </section>

        <section className="settings__section">
          <h3 className="settings__title">Previews</h3>
          <p className="settings__desc text-3">How the before and after previews look.</p>
          <div className="field-row">
            <span>Background</span>
            <Segmented<Backdrop> label="Preview background" value={settings.backdrop} onChange={(v) => set("backdrop", v)}
              options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
          </div>
          <Toggle label="List view" hint="Compact rows with dimensions, tags and presets. Off shows big before/after previews"
            checked={settings.showDetails} onChange={(v) => set("showDetails", v)} />
          <Toggle label="Circle guide" checked={settings.circleOverlay} onChange={(v) => set("circleOverlay", v)} />
          <div className="field-row">
            <span>Circle guide colour</span>
            <span className="settings__colour">
              <input type="color" aria-label="Circle guide colour" value={settings.circleColour ?? "#af307d"} onChange={(e) => set("circleColour", e.target.value)} />
              {settings.circleColour
                ? <button className="link" onClick={() => set("circleColour", null)} title="Back to the brand colour">Reset</button>
                : <span className="text-3">Brand colour</span>}
            </span>
          </div>
          <Toggle label="Clip previews to a circle" checked={settings.circleClip} onChange={(v) => set("circleClip", v)} />
          <div className="settings__actions">
            <button className="btn btn--ghost btn--sm" onClick={p.onResetLayout} title="Sidebar width, preview sizes and toggles back to normal">Reset layout</button>
          </div>
        </section>
      </div>
    </Modal>
  )
}
