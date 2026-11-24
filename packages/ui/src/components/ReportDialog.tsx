import { useMemo, useRef, useState } from "react"
import { Modal } from "./Dialogs"
import { Segmented } from "./Segmented"
import { detailedReport, summaryReport, type ReportColumns, type ReportEntry, type ReportFormat } from "@marknotton/svgenius-core/report"
import { savingPercent } from "@marknotton/svgenius-core/format"
import type { RenameSettings } from "@marknotton/svgenius-core/types"

// ── Report: copyable text of what was done ────────────────────────────────────

type Kind = "summary" | "detailed"
type Scope = "all" | "selected" | "optimised" | "errors"
type Sort = "list" | "saving" | "name"

interface Props {
  entries: ReportEntry[]
  selected: Set<string>
  rename: RenameSettings
  onClose: () => void
}

const COLUMNS: Array<{ key: keyof ReportColumns, label: string }> = [
  { key: "names", label: "Export names" },
  { key: "sizes", label: "Sizes" },
  { key: "dimensions", label: "Dimensions" },
  { key: "preset", label: "Preset" },
  { key: "changes", label: "Changes" }
]

export function ReportDialog({ entries, selected, rename, onClose }: Props) {
  const [kind, setKind] = useState<Kind>("summary")
  const [scope, setScope] = useState<Scope>(selected.size ? "selected" : "all")
  const [sort, setSort] = useState<Sort>("list")
  const [format, setFormat] = useState<ReportFormat>("list")
  const [cols, setCols] = useState<ReportColumns>({ names: true, sizes: true, dimensions: true, preset: false, changes: true })
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)

  const shown = useMemo(() => {
    let list = entries
    if (scope === "selected") list = list.filter((e) => selected.has(e.item.id))
    if (scope === "optimised") list = list.filter((e) => e.item.result && e.item.status !== "error")
    if (scope === "errors") list = list.filter((e) => e.item.status === "error")
    if (sort === "name") list = [...list].sort((a, b) => a.item.relPath.localeCompare(b.item.relPath, undefined, { numeric: true }))
    if (sort === "saving") {
      const pct = (e: ReportEntry) => (e.item.result ? savingPercent(e.item.size, e.item.result.size) : -Infinity)
      list = [...list].sort((a, b) => pct(b) - pct(a))
    }
    return list
  }, [entries, scope, sort, selected])

  const text = useMemo(
    () => (kind === "summary" ? summaryReport(shown, rename) : detailedReport(shown, cols, format)),
    [kind, shown, rename, cols, format]
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      box.current?.select()
      document.execCommand("copy")
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const errors = entries.filter((e) => e.item.status === "error").length

  return (
    <Modal onCancel={onClose}>
      <div className="report">
        <div className="report__head">
          <h2 className="modal__title">Report</h2>
          <Segmented label="Report type" value={kind} onChange={setKind} options={[
            { value: "summary", label: "Summary", title: "A short, plain-English overview of the work, in the past tense" },
            { value: "detailed", label: "Detailed", title: "Every file, its names, sizes and changes" }
          ]} />
        </div>

        <div className="report__filters">
          <label className="report__field">
            <span>Files</span>
            <select className="select" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              <option value="all">All files ({entries.length})</option>
              <option value="selected" disabled={!selected.size}>Selected files ({selected.size})</option>
              <option value="optimised">Optimised only</option>
              <option value="errors" disabled={!errors}>With errors ({errors})</option>
            </select>
          </label>
          {kind === "detailed" && (
            <>
              <label className="report__field">
                <span>Order</span>
                <select className="select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="list">As listed</option>
                  <option value="saving">Biggest saving first</option>
                  <option value="name">By name</option>
                </select>
              </label>
              <label className="report__field">
                <span>Layout</span>
                <select className="select" value={format} onChange={(e) => setFormat(e.target.value as ReportFormat)}>
                  <option value="list">List</option>
                  <option value="table">Table (pastes into a spreadsheet)</option>
                </select>
              </label>
            </>
          )}
        </div>
        {kind === "detailed" && (
          <div className="report__cols" role="group" aria-label="Include">
            {COLUMNS.map((c) => (
              <label key={c.key} className="report__col">
                <input type="checkbox" className="checkbox" checked={cols[c.key]}
                  onChange={(e) => setCols((x) => ({ ...x, [c.key]: e.target.checked }))} />
                {c.label}
              </label>
            ))}
          </div>
        )}

        <textarea ref={box} className="report__text" readOnly value={text} spellCheck={false}
          wrap={format === "table" && kind === "detailed" ? "off" : "soft"} aria-label="Report text" />

        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={onClose}>Close</button>
          <button type="button" className="btn btn--primary" onClick={copy}>{copied ? "Copied" : "Copy to clipboard"}</button>
        </div>
      </div>
    </Modal>
  )
}
