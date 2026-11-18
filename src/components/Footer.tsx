import { useState } from "react"
import { IconDownload, IconPlay, IconReport } from "../icons"
import { ContextMenu, type MenuState } from "./ContextMenu"
import { formatBytes, formatSaving, plural, savingPercent } from "../lib/format"
import type { SvgItem } from "../lib/types"

// ── Footer: totals, Optimise, Export ──────────────────────────────────────────
// Export only writes finished results, so it waits until every file it would
// export has been optimised with the current settings.

interface Props {
  items: SvgItem[]
  targets: SvgItem[]
  /** How many of the targets have an up-to-date result */
  ready: number
  /** Targets that failed */
  failed: number
  selectionCount: number
  /** Filters are narrowing the list */
  filtered: boolean
  busy: boolean
  keepStructure: boolean
  onKeepStructure: (v: boolean) => void
  onOptimise: () => void
  onExport: (clear: boolean) => void
  /** Shows the export file name options */
  onNames: () => void
  onReport: () => void
}

export function Footer(p: Props) {
  const done = p.items.filter((i) => i.result)
  const before = done.reduce((n, i) => n + i.size, 0)
  const after = done.reduce((n, i) => n + (i.result?.size ?? 0), 0)
  const n = p.targets.length
  const scope = p.selectionCount > 0 ? "" : p.filtered ? "filtered " : "all "
  const outstanding = n - p.ready - p.failed
  const canExport = n > 0 && p.ready > 0 && outstanding === 0 && !p.busy
  const [menu, setMenu] = useState<MenuState | null>(null)
  const count = plural(n - p.failed, "file")

  return (
    <footer className="footer">
      <div className="footer__summary">
        {done.length > 0 ? (
          <>
            <strong>{formatBytes(before - after)}</strong> saved across {plural(done.length, "file")}{" "}
            <span className={`pill ${savingPercent(before, after) > 0 ? "pill--success" : "pill--warning"}`}>{formatSaving(before, after)}</span>
          </>
        ) : <span className="text-2">{p.items.length ? "Nothing optimised yet" : "Add some SVGs to get started"}</span>}
      </div>

      <label className="footer__check" title="Recreate sub-folders inside the export folder">
        <input type="checkbox" className="checkbox" checked={p.keepStructure} onChange={(e) => p.onKeepStructure(e.target.checked)} />
        Keep folder structure
      </label>

      {n > 0 && (
        <span className={`footer__status${outstanding ? " is-pending" : ""}`}>
          {outstanding > 0
            ? `${plural(outstanding, "file")} to optimise before export`
            : `${p.ready}/${n} ready${p.failed ? `, ${p.failed} with errors` : ""}`}
        </span>
      )}

      <button className="btn btn--secondary" onClick={p.onReport} disabled={p.items.length === 0}
        title="A copyable report of the work done, to log or send to a client">
        <IconReport /> Report
      </button>
      <button className={`btn ${outstanding > 0 ? "btn--primary" : "btn--secondary"}`} onClick={p.onOptimise} disabled={n === 0 || p.busy || outstanding === 0}
        title="Run every file with its current settings. Live mode only updates the rows on screen">
        {p.busy ? <span className="spinner spinner--sm" /> : <IconPlay />} Optimise {scope}{plural(n, "file")}
      </button>
      <div className="split">
        <button className={`btn ${outstanding > 0 ? "btn--secondary" : "btn--primary"}`} onClick={() => p.onExport(false)} disabled={!canExport}
          title={canExport ? "Save the optimised files to a folder" : "Optimise first, so every exported file matches its current settings"}>
          <IconDownload /> Export {scope}{count}…
        </button>
        <button className={`btn split__more ${outstanding > 0 ? "btn--secondary" : "btn--primary"}`} disabled={!canExport}
          aria-label="More export options" title="More export options"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setMenu({
              x: r.right - 220,
              y: r.top - 8 - 4 * 30,
              items: [
                { label: `Export ${scope}${count}…`, run: () => p.onExport(false) },
                { label: `Export and clear ${count}…`, run: () => p.onExport(true) },
                "-",
                { label: "File names…", run: p.onNames }
              ]
            })
          }}>▾</button>
      </div>
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </footer>
  )
}
