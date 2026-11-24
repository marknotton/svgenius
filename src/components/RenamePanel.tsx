import { useEffect, useMemo, useRef } from "react"
import { CASES, defaultRename, exportNames } from "@svgenius/core/rename"
import type { RenameSettings, SvgItem } from "@svgenius/core/types"
import { Segmented } from "./Segmented"
import { Toggle } from "./Toggle"

// ── Export file names ─────────────────────────────────────────────────────────

interface Props {
  rename: RenameSettings
  onChange: (r: RenameSettings) => void
  /** The files that would be exported, in order, for the preview */
  items: SvgItem[]
  /** A file to scroll to and flash (from a row's "Exports as" name). n changes each time */
  highlight?: { id: string, n: number } | null
}

export function RenamePanel({ rename: r, onChange, items, highlight }: Props) {
  const table = useRef<HTMLTableElement>(null)
  useEffect(() => {
    if (!highlight) return
    const row = table.current?.querySelector(`[data-id="${CSS.escape(highlight.id)}"]`) as HTMLElement | null
    if (!row) return
    row.scrollIntoView({ block: "center", behavior: "smooth" })
    row.classList.remove("is-flash")
    void row.offsetWidth
    row.classList.add("is-flash")
  }, [highlight])
  const set = (patch: Partial<RenameSettings>) => onChange({ ...r, ...patch })
  const preview = useMemo(() => {
    const names = exportNames(items, { ...r, enabled: true })
    // The first 50, plus the file a row asked to see if it's further down
    const extra = highlight && !items.slice(0, 50).some((i) => i.id === highlight.id) ? items.filter((i) => i.id === highlight.id) : []
    return [...items.slice(0, 50), ...extra].map((i) => ({ id: i.id, from: i.name, to: names.get(i.id) ?? i.name, dir: i.relPath.includes("/") ? i.relPath.slice(0, i.relPath.lastIndexOf("/")) : "" }))
  }, [items, r, highlight])

  return (
    <div className="panel" aria-label="Export file names">
      <div className="panel__scroll rename">
        <section className="panel__section">
        <div className="panel__label">Export file names</div>
        <p className="rules__empty text-3">Only the exported copies are renamed, never your original files.</p>

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
                    { value: "all", label: "One sequence" },
                    { value: "folder", label: "Restart per folder" }
                  ]} />
              </div>
              <p className="rename__explain text-3">
                {r.scope === "all"
                  ? "Every file gets the next number in list order, whatever folder it's in: icons/01, icons/02, logos/03."
                  : "Each folder counts from the start number again: icons/01, icons/02, logos/01. Handy with Keep folder structure."}
              </p>
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

        </section>

        <section className="panel__section">
          <div className="plugins__head">
            <span className="panel__label">Preview</span>
            <span className="text-3">{items.length > 50 ? `First 50 of ${items.length}` : `${items.length} files`}, in list order</span>
          </div>
          <table className="rename__table" ref={table}>
            <thead><tr><th>Original</th><th>Exported as</th></tr></thead>
            <tbody>
              {preview.map((p) => (
                <tr key={p.id} data-id={p.id}>
                  <td title={p.dir ? `${p.dir}/${p.from}` : p.from}>{p.dir && <span className="text-3">{p.dir}/</span>}{p.from}</td>
                  <td className={r.enabled && p.to !== p.from ? "is-changed" : ""}>{r.enabled ? p.to : p.from}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn btn--ghost btn--sm rename__reset" onClick={() => onChange({ ...defaultRename(), enabled: r.enabled })}>Reset names</button>
        </section>
      </div>
    </div>
  )
}
