import { IconDownload, IconEye, IconPlay, IconRefresh } from "../icons"
import { formatBytes, formatSaving, plural, savingPercent } from "../lib/format"
import type { SvgItem } from "../lib/types"

interface Props {
  view: "list" | "review"
  items: SvgItem[]
  targets: SvgItem[]
  selectionCount: number
  busy: boolean
  keepStructure: boolean
  onKeepStructure: (v: boolean) => void
  onOptimise: () => void
  onReview: () => void
  onRerun: () => void
  onExport: () => void
}

export function Footer(p: Props) {
  const done = p.items.filter((i) => i.result)
  const before = done.reduce((n, i) => n + i.size, 0)
  const after = done.reduce((n, i) => n + (i.result?.size ?? 0), 0)
  const n = p.targets.length
  const scope = p.view === "list" && p.selectionCount === 0 ? "all " : ""

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

      {p.view === "list" && p.selectionCount > 0 && (
        <button className="btn btn--secondary" onClick={p.onReview} disabled={p.busy}>
          <IconEye /> Review {plural(p.selectionCount, "item")}
        </button>
      )}
      {p.view === "list" ? (
        <button className="btn btn--secondary" onClick={p.onOptimise} disabled={n === 0 || p.busy}>
          {p.busy ? <span className="spinner spinner--sm" /> : <IconPlay />} Optimise {scope}{plural(n, "file")}
        </button>
      ) : (
        <button className="btn btn--secondary" onClick={p.onRerun} disabled={n === 0 || p.busy}>
          {p.busy ? <span className="spinner spinner--sm" /> : <IconRefresh />} Re-run
        </button>
      )}
      <button className="btn btn--primary" onClick={p.onExport} disabled={n === 0 || p.busy}>
        <IconDownload /> Export {scope}{plural(n, "file")}…
      </button>
    </footer>
  )
}
