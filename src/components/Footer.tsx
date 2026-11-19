import { useState, type ReactNode } from "react"
import { IconDownload, IconPlay, IconReport } from "../icons"
import { ContextMenu, type MenuState } from "./ContextMenu"
import { InfoTip } from "./InfoTip"
import { formatBytes, formatSaving, plural, savingPercent } from "../lib/format"
import type { SvgItem } from "../lib/types"
import { isDesktop } from "../lib/platform"

// A folder picker follows on the desktop; the browser downloads straight away
const dots = isDesktop ? "…" : ""

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
  /** Live preview: re-optimise files on screen as settings change */
  live: boolean
  onLive: (on: boolean) => void
  busy: boolean
  keepStructure: boolean
  onKeepStructure: (v: boolean) => void
  onOptimise: () => void
  onExport: (clear: boolean) => void
  onReport: () => void
  /** Logo (About), desktop link, Advanced and Settings, bottom left */
  brand: ReactNode
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
      {p.brand}
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
        <IconReport /> <span className="footer__label">Report</span>
      </button>
      {/* One place for running files: Live keeps the files on screen up to date, Optimise runs them all */}
      <div className={`run-group${p.live ? " is-live" : ""}`}>
        <label className="run-group__live" title="Live preview: files on screen re-optimise as you change settings">
          <input type="checkbox" className="toggle__input" checked={p.live} onChange={(e) => p.onLive(e.target.checked)} />
          <span className="toggle__track" aria-hidden="true"><span className="toggle__thumb" /></span>
          Live
        </label>
        <InfoTip label="About Live and Optimise">
          <p><strong>Live</strong> re-optimises the files on screen (and the one you're inspecting) as you change settings. Files further down catch up as you scroll near them.</p>
          <p><strong>Optimise</strong> runs every file now, including ones you haven't scrolled to. Export needs every file optimised first.</p>
          <p>Turn Live off for very large batches, then Optimise when you're ready.</p>
        </InfoTip>
        <button className={`btn run-group__btn ${outstanding > 0 ? "btn--primary" : "btn--secondary"}`} onClick={p.onOptimise} disabled={n === 0 || p.busy || outstanding === 0}
          title={outstanding === 0 ? "Everything is up to date" : "Run every file with its current settings now"}>
          {p.busy ? <span className="spinner spinner--sm" /> : <IconPlay />} {outstanding > 0 ? `Apply & optimise ${scope}${plural(n, "file")}` : "All optimised"}
        </button>
      </div>
      <div className="split">
        <button className={`btn ${outstanding > 0 ? "btn--secondary" : "btn--primary"}`} onClick={() => p.onExport(false)} disabled={!canExport}
          title={canExport ? "Save the optimised files to a folder" : "Optimise first, so every exported file matches its current settings"}>
          <IconDownload /> Export {scope}{count}{dots}
        </button>
        <button className={`btn split__more ${outstanding > 0 ? "btn--secondary" : "btn--primary"}`} disabled={!canExport}
          aria-label="More export options" title="More export options"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setMenu({
              x: r.right - 220,
              y: r.top - 8 - 2 * 30,
              items: [
                { label: `Export ${scope}${count}${dots}`, run: () => p.onExport(false) },
                { label: `Export and clear ${count}${dots}`, run: () => p.onExport(true) }
              ]
            })
          }}>▾</button>
      </div>
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </footer>
  )
}
