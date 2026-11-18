import { useMemo } from "react"
import { IconX } from "../icons"
import { CASES, defaultRename, exportNames } from "../lib/rename"
import type { RenameSettings, SvgItem } from "../lib/types"
import { Modal } from "./Dialogs"
import { Segmented } from "./Segmented"
import { Toggle } from "./Toggle"

// ── Export file names ─────────────────────────────────────────────────────────

interface Props {
  rename: RenameSettings
  onChange: (r: RenameSettings) => void
  /** The files that would be exported, in order, for the preview */
  items: SvgItem[]
  onClose: () => void
}

export function RenameDialog({ rename: r, onChange, items, onClose }: Props) {
  const set = (patch: Partial<RenameSettings>) => onChange({ ...r, ...patch })
  const preview = useMemo(() => {
    const names = exportNames(items, { ...r, enabled: true })
    return items.slice(0, 8).map((i) => ({ id: i.id, from: i.name, to: names.get(i.id) ?? i.name, dir: i.relPath.includes("/") ? i.relPath.slice(0, i.relPath.lastIndexOf("/")) : "" }))
  }, [items, r])

  return (
    <Modal onCancel={onClose}>
      <div className="settings rename">
        <div className="settings__head">
          <h2 className="modal__title">Export file names</h2>
          <button className="btn btn--icon" aria-label="Close" onClick={onClose}><IconX /></button>
        </div>

        <Toggle label="Rename files on export" hint="Your original files are never renamed, only the exported copies"
          checked={r.enabled} onChange={(enabled) => set({ enabled })} />

        <div className={`rename__fields${r.enabled ? "" : " is-off"}`}>
          <label className="field-row">
            <span>Name</span>
            <input className="input input--sm input--mono" value={r.base} placeholder="{name} (the original)"
              spellCheck={false} onChange={(e) => set({ base: e.target.value })} />
          </label>
          <div className="rename__pair">
            <label className="field-row">
              <span>Prefix</span>
              <input className="input input--sm input--mono" value={r.prefix} placeholder="icon-" spellCheck={false}
                onChange={(e) => set({ prefix: e.target.value })} />
            </label>
            <label className="field-row">
              <span>Suffix</span>
              <input className="input input--sm input--mono" value={r.suffix} placeholder="-24" spellCheck={false}
                onChange={(e) => set({ suffix: e.target.value })} />
            </label>
          </div>
          <label className="field-row">
            <span>Case</span>
            <select className="select select--sm" value={r.case} onChange={(e) => set({ case: e.target.value as RenameSettings["case"] })}>
              {CASES.map((c) => <option key={c.value} value={c.value}>{c.label}  ({c.example})</option>)}
            </select>
          </label>

          <div className="field-row">
            <span>Number</span>
            <Segmented label="Number position" value={r.index} onChange={(index) => set({ index })}
              options={[
                { value: "none", label: "None" },
                { value: "prefix", label: "Before" },
                { value: "suffix", label: "After" },
                { value: "only", label: "Only", title: "Name files 01.svg, 02.svg…" }
              ]} />
          </div>
          {r.index !== "none" && (
            <>
              <div className="field-row">
                <span>Format</span>
                <Segmented label="Number format" value={r.pad ? "pad" : "plain"} onChange={(v) => set({ pad: v === "pad" })}
                  options={[{ value: "pad", label: "01, 02, 03" }, { value: "plain", label: "1, 2, 3" }]} />
              </div>
              <div className="field-row">
                <span>Count</span>
                <Segmented label="Numbering scope" value={r.scope} onChange={(scope) => set({ scope })}
                  options={[
                    { value: "all", label: "Across all files" },
                    { value: "folder", label: "Per folder", title: "Restart at the first number in each folder" }
                  ]} />
              </div>
              <div className="rename__pair">
                <label className="field-row">
                  <span>Start at</span>
                  <input className="input input--sm" type="number" min={0} value={r.start}
                    onChange={(e) => set({ start: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                </label>
                <label className="field-row">
                  <span>Separator</span>
                  <input className="input input--sm input--mono" value={r.separator} maxLength={5} spellCheck={false}
                    onChange={(e) => set({ separator: e.target.value })} />
                </label>
              </div>
            </>
          )}
        </div>

        <div className="settings__section">
          <div className="plugins__head">
            <span className="panel__label">Preview</span>
            <span className="text-3">{items.length > 8 ? `First 8 of ${items.length}` : `${items.length} files`}, in list order</span>
          </div>
          <ul className="rename__preview">
            {preview.map((p) => (
              <li key={p.id}>
                {p.dir && <span className="text-3">{p.dir}/</span>}
                <span className="text-3">{p.from}</span> → <strong>{r.enabled ? p.to : p.from}</strong>
              </li>
            ))}
          </ul>
        </div>

        <div className="settings__actions">
          <button className="btn btn--ghost btn--sm" onClick={() => onChange({ ...defaultRename(), enabled: r.enabled })}>Reset</button>
          <div className="toolbar__spacer" />
          <button className="btn btn--primary btn--sm" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  )
}
