import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { IconCopy, IconReset, IconX } from "../icons"
import { elementRanges, rangeAt } from "../lib/markupMap"
import { convertToPath, duplicateElement, moveElement, removeElement, setAttr, type DropPlace } from "../lib/markupEdit"
import { SHAPES, parsePath, serialisePath, type Seg } from "../lib/pathData"
import type { Backdrop, SvgItem } from "../lib/types"
import { CodeEditor } from "./CodeEditor"
import { InspectPreview } from "./InspectPreview"
import { LayersTree } from "./LayersTree"
import { PathPanel } from "./PathPanel"

/** Elements in tree order, the numbering everything here shares */
function parseElements(markup: string) {
  if (!markup) return null
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml")
  const root = doc.documentElement
  if (root.localName !== "svg" || doc.querySelector("parsererror")) return null
  return [root, ...root.querySelectorAll("*")]
}

// ── Big markup editor, with an element picker ─────────────────────────────────
// Edits go straight to the file, same as the sidebar editor, so closing keeps
// everything.

export type MarkupTab = "source" | "output"

interface Props {
  item: SvgItem
  tab: MarkupTab
  onTab: (t: MarkupTab) => void
  backdrop: Backdrop
  onEdit: (source: string) => void
  onRevert: () => void
  onClose: () => void
}

export function MarkupDialog({ item, tab, onTab, backdrop, onEdit, onRevert, onClose }: Props) {
  const markup = (tab === "source" ? item.source : item.result?.output) ?? ""
  const ranges = useMemo(() => elementRanges(markup), [markup])
  const [selected, setSelected] = useState(-1)
  const [hover, setHover] = useState(-1)
  const [reveal, setReveal] = useState<{ start: number, end: number, n: number, focus?: boolean } | null>(null)
  const [copied, setCopied] = useState(false)
  const edited = item.fileSource !== undefined && item.source !== item.fileSource

  // Esc closes, unless Monaco is using it (find box, suggestions)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      if ((e.target as Element | null)?.closest?.(".monaco-editor")) return
      // A right-click menu closes first
      if (document.querySelector(".context-menu")) return
      onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  // A new tab or a hand edit changes what the element numbers point at. Edits
  // made here (dragging points, deleting) keep track themselves
  const own = useRef(false)
  useEffect(() => { setSelected(-1); setHover(-1) }, [tab])
  useEffect(() => {
    if (own.current) { own.current = false; return }
    setSelected(-1)
    setHover(-1)
  }, [markup])
  const commit = (next: string) => {
    if (next === markup) return
    own.current = true
    onEdit(next)
  }

  const elements = useMemo(() => parseElements(markup), [markup])
  const editable = tab === "source"
  const el = selected >= 0 ? elements?.[selected] : undefined
  const [active, setActive] = useState(-1)
  useEffect(() => setActive(-1), [selected])

  const path = useMemo((): { segs: Seg[] } | { error: string } | null => {
    if (el?.localName !== "path") return null
    try { return { segs: parsePath(el.getAttribute("d") ?? "") } } catch (e) { return { error: (e as Error).message } }
  }, [el])
  const segs = path && "segs" in path ? path.segs : null

  const writePath = useCallback((next: Seg[]) => {
    const r = ranges[selected]
    if (r) commit(setAttr(markup, r, "d", serialisePath(next)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ranges, selected, markup])

  const deleteElement = (i: number) => {
    const r = ranges[i]
    if (!r || i === 0 || !editable) return
    commit(removeElement(markup, r))
    setSelected(-1)
    setHover(-1)
  }

  const convert = (i = selected) => {
    const r = ranges[i], target = elements?.[i]
    if (!r || !target) return
    const next = convertToPath(markup, r, target)
    if (next) commit(next)
  }

  // Selects whatever now starts at `start` in the new markup
  const commitAndSelect = (next: { markup: string, start: number } | null) => {
    if (!next) return
    commit(next.markup)
    const i = elementRanges(next.markup).findIndex((r) => r.start === next.start)
    setSelected(i)
    setHover(-1)
  }
  const duplicate = (i: number) => { const r = ranges[i]; if (r && i > 0) commitAndSelect(duplicateElement(markup, r)) }
  const move = (from: number, to: number, place: DropPlace) => {
    const a = ranges[from], b = ranges[to]
    if (a && b && from > 0 && from !== to) commitAndSelect(moveElement(markup, a, b, place))
  }

  const pick = (i: number, focus = true) => {
    setSelected(i)
    const r = ranges[i]
    // The whole element, so Delete or Backspace removes it
    if (r) setReveal((x) => ({ start: r.start, end: r.end, n: (x?.n ?? 0) + 1, focus }))
  }
  const markRange = hover >= 0 ? ranges[hover] : selected >= 0 ? ranges[selected] : null

  // The optimised markup becomes the editable source; Revert still has the original
  const applyOptimised = () => {
    const out = item.result?.output
    if (!out) return
    onEdit(out)
    onTab("source")
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(markup); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* unavailable */ }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal markup-dialog" role="dialog" aria-modal="true" aria-label={`Markup for ${item.name}`}>
        <div className="markup-dialog__head">
          <h2 className="modal__title markup-dialog__title" title={item.relPath}>{item.name}</h2>
          <CodeTabs value={tab} onChange={onTab} />
          <span className="text-3 markup-dialog__tip">Click a shape or a layer to select it{editable ? ". Drag a path's points to reshape it" : ""}</span>
          <div className="markup-dialog__spacer" />
          {tab === "source" && edited && <button className="link" onClick={onRevert} title="Throw away edits and reload the file's markup"><IconReset width={11} height={11} /> Revert</button>}
          {tab === "output" && <button className="link" onClick={copy} disabled={!markup}><IconCopy width={11} height={11} /> {copied ? "Copied" : "Copy"}</button>}
          {tab === "output" && item.result && (
            <button className="btn btn--primary btn--sm" onClick={applyOptimised}
              title="Make the optimised markup the file's markup and carry on editing it in Before. Revert brings back the original">
              Apply optimisation
            </button>
          )}
          <button className="btn btn--icon" onClick={onClose} title="Close (Esc)" aria-label="Close"><IconX /></button>
        </div>
        <div className="markup-dialog__body is-inspecting">
          <div className="markup-dialog__layers">
            <div className="panel__label">Layers</div>
            {elements
              ? <LayersTree elements={elements} selected={selected} hover={hover}
                  onPick={(i) => pick(i, false)} onHover={setHover} onDelete={editable ? deleteElement : undefined}
                  onDuplicate={duplicate} onConvert={convert} onMove={move} />
              : <p className="text-3">{markup ? "The markup doesn't parse, fix it to see the layers." : "Nothing here yet."}</p>}
          </div>
          <InspectPreview markup={markup} backdrop={backdrop} selected={selected}
            onPick={pick} onHover={setHover}
            path={segs ? { index: selected, segs, readOnly: !editable, active, onActive: setActive, onCommit: writePath } : null} />
          <div className="markup-dialog__side">
            {segs && <PathPanel segs={segs} readOnly={!editable} active={active} onActive={setActive} onChange={writePath} />}
            {path && "error" in path && <p className="rule__error">This path's data doesn't parse: {path.error}</p>}
            {el && SHAPES.has(el.localName) && (
              <div className="path-panel path-panel--shape">
                <span className="text-2">This is a <code>&lt;{el.localName}&gt;</code>.</span>
                {editable
                  ? <button className="btn btn--secondary btn--sm" onClick={() => convert()} title="Swap it for a path that draws the same shape, keeping its other attributes, so its points can be edited">Convert to path</button>
                  : <span className="text-3">Switch to Before to convert it to a path.</span>}
              </div>
            )}
            <CodeEditor
              key={tab}
              className="markup-dialog__code"
              label={tab === "source" ? "Source markup" : "Optimised markup"}
              value={markup}
              readOnly={tab === "output"}
              onChange={tab === "source" ? onEdit : undefined}
              reveal={reveal}
              mark={markRange ? { start: markRange.start, end: markRange.end } : null}
              onCursor={(offset) => setSelected(rangeAt(ranges, offset))}
            />
          </div>
        </div>
        {tab === "output" && !item.result && <p className="text-3">Not optimised yet.</p>}
        {item.status === "error" && <p className="rule__error">{item.error}</p>}
      </div>
    </div>
  )
}

/** Before / After switch for the markup editors */
export function CodeTabs({ value, onChange }: { value: MarkupTab, onChange: (t: MarkupTab) => void }) {
  return (
    <div className="code-tabs" role="tablist" aria-label="Markup">
      <button role="tab" aria-selected={value === "source"} className={value === "source" ? "is-active" : ""}
        title="The file's markup. Edit it here, your original isn't touched" onClick={() => onChange("source")}>Before</button>
      <button role="tab" aria-selected={value === "output"} className={value === "output" ? "is-active" : ""}
        title="The optimised markup that gets exported" onClick={() => onChange("output")}>After</button>
    </div>
  )
}
