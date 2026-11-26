import { IconX } from "@marknotton/svgenius-ui/icons"
import { Modal } from "@marknotton/svgenius-ui/components/Dialogs"
import { plural } from "@marknotton/svgenius-core/format"
import { dirOf } from "../lib/links"
import type { SvgItem } from "@marknotton/svgenius-core/types"

// ── Missing files ─────────────────────────────────────────────────────────────
// Files a project links to that aren't where they were. A bar over the list
// says how many; the dialog finds them again (one file, which brings others
// from the same folder with it, or a whole folder) or removes them.

interface BarProps {
  count: number
  /** How many still work from a copy saved in the project */
  standIns: number
  onOpen: () => void
}

export function MissingBar({ count, standIns, onOpen }: BarProps) {
  return (
    <div className="missing-bar" role="status">
      <span className="missing-bar__dot" />
      <span>
        <strong>{plural(count, "file")} missing.</strong>{" "}
        <span className="text-2">
          {standIns === count
            ? "The copies saved in the project are used until you find them."
            : "They may have been moved, renamed or deleted."}
        </span>
      </span>
      <div className="toolbar__spacer" />
      <button className="btn btn--secondary btn--sm" onClick={onOpen}>Find missing files…</button>
    </div>
  )
}

interface DialogProps {
  items: SvgItem[]
  busy: boolean
  onLocateFile: (id: string) => void
  onLocateFolder: () => void
  onRemove: (ids: string[]) => void
  onClose: () => void
}

export function MissingDialog({ items, busy, onLocateFile, onLocateFolder, onRemove, onClose }: DialogProps) {
  return (
    <Modal onCancel={onClose}>
      <div className="settings missing">
        <div className="settings__head">
          <h2 className="modal__title">Missing files</h2>
          <button className="btn btn--icon" aria-label="Close missing files" onClick={onClose}><IconX /></button>
        </div>
        {items.length === 0 ? (
          <p className="text-2">Every file is linked. Nothing's missing.</p>
        ) : (
          <>
            <p className="text-2">
              {items.length === 1 ? "This file isn't" : `These ${items.length} files aren't`} where the project last saw {items.length === 1 ? "it" : "them"}.
              Locate one and any others in the same folder are found with it, or pick a folder to search it for all of them.
            </p>
            <ul className="missing__list">
              {items.map((i) => (
                <li key={i.id} className="missing__item">
                  <div className="missing__name">
                    <span className="missing__file">{i.name}</span>
                    <span className="text-3 missing__path" title={i.path}>{dirOf(i.path) || i.path}</span>
                  </div>
                  {i.source !== undefined && <span className="tag tag--warning" title="The copy saved in the project is used until the file is found">Saved copy</span>}
                  <button className="btn btn--secondary btn--sm" disabled={busy} onClick={() => onLocateFile(i.id)}>Locate…</button>
                  <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => onRemove([i.id])}>Remove</button>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="modal__actions">
          {items.length > 0 && (
            <button className="btn btn--ghost modal__aside" disabled={busy} onClick={() => onRemove(items.map((i) => i.id))}>
              Remove {items.length === 1 ? "it" : `all ${items.length}`}
            </button>
          )}
          {items.length > 0 && <button className="btn btn--secondary" disabled={busy} onClick={onLocateFolder}>{busy ? "Looking…" : "Search a folder…"}</button>}
          <button className="btn btn--primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>
  )
}
