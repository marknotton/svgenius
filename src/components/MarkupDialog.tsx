import { useEffect, useMemo, useState } from "react"
import { IconCopy, IconReset, IconX } from "../icons"
import { elementRanges, rangeAt } from "../lib/markupMap"
import type { Backdrop, SvgItem } from "../lib/types"
import { CodeEditor } from "./CodeEditor"
import { InspectPreview } from "./InspectPreview"
import { Segmented } from "./Segmented"

// ── Big markup editor, with an element picker ─────────────────────────────────
// Edits go straight to the file, same as the sidebar editor, so closing keeps
// everything.

export type MarkupTab = "source" | "output"

interface Props {
  item: SvgItem
  tab: MarkupTab
  onTab: (t: MarkupTab) => void
  inspect: boolean
  onInspect: (on: boolean) => void
  backdrop: Backdrop
  onEdit: (source: string) => void
  onRevert: () => void
  onClose: () => void
}

export function MarkupDialog({ item, tab, onTab, inspect, onInspect, backdrop, onEdit, onRevert, onClose }: Props) {
  const markup = (tab === "source" ? item.source : item.result?.output) ?? ""
  const ranges = useMemo(() => elementRanges(markup), [markup])
  const [selected, setSelected] = useState(-1)
  const [hover, setHover] = useState(-1)
  const [reveal, setReveal] = useState<{ start: number, end: number, n: number } | null>(null)
  const [copied, setCopied] = useState(false)
  const edited = item.fileSource !== undefined && item.source !== item.fileSource

  // Esc closes, unless Monaco is using it (find box, suggestions)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      if ((e.target as Element | null)?.closest?.(".monaco-editor")) return
      onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  useEffect(() => { setSelected(-1); setHover(-1) }, [tab])

  const pick = (i: number) => {
    setSelected(i)
    const r = ranges[i]
    if (r) setReveal((x) => ({ start: r.start, end: r.tagEnd, n: (x?.n ?? 0) + 1 }))
  }
  const markRange = hover >= 0 ? ranges[hover] : selected >= 0 ? ranges[selected] : null

  const copy = async () => {
    try { await navigator.clipboard.writeText(markup); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* unavailable */ }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal markup-dialog" role="dialog" aria-modal="true" aria-label={`Markup for ${item.name}`}>
        <div className="markup-dialog__head">
          <h2 className="modal__title markup-dialog__title" title={item.relPath}>{item.name}</h2>
          <Segmented label="Markup" value={tab} onChange={onTab}
            options={[{ value: "source", label: "Before (editable)" }, { value: "output", label: "After" }]} />
          <label className="toggle-inline" title="Show a big preview. Hover and click shapes to find them in the markup">
            <input type="checkbox" className="checkbox" checked={inspect} onChange={(e) => onInspect(e.target.checked)} /> Inspect
          </label>
          <div className="markup-dialog__spacer" />
          {tab === "source" && edited && <button className="link" onClick={onRevert} title="Throw away edits and reload the file's markup"><IconReset width={11} height={11} /> Revert</button>}
          {tab === "output" && <button className="link" onClick={copy} disabled={!markup}><IconCopy width={11} height={11} /> {copied ? "Copied" : "Copy"}</button>}
          <button className="btn btn--icon" onClick={onClose} title="Close (Esc)" aria-label="Close"><IconX /></button>
        </div>
        <div className={`markup-dialog__body${inspect ? " is-inspecting" : ""}`}>
          {inspect && (
            <InspectPreview markup={markup} backdrop={backdrop} selected={selected}
              onPick={pick} onHover={setHover} />
          )}
          <CodeEditor
            key={tab}
            className="markup-dialog__code"
            label={tab === "source" ? "Source markup" : "Optimised markup"}
            value={markup}
            readOnly={tab === "output"}
            onChange={tab === "source" ? onEdit : undefined}
            reveal={reveal}
            mark={inspect && markRange ? { start: markRange.start, end: markRange.end } : null}
            onCursor={inspect ? (offset) => setSelected(rangeAt(ranges, offset)) : undefined}
          />
        </div>
        {tab === "output" && !item.result && <p className="text-3">Not optimised yet.</p>}
        {item.status === "error" && <p className="rule__error">{item.error}</p>}
      </div>
    </div>
  )
}
