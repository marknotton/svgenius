import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { IconCopy, IconRedo, IconReset, IconUndo, IconX } from "../icons"
import { elementRanges, rangeAt } from "../lib/markupMap"
import { moveElement, setAttr, setAttrs, translateAttrs, type DropPlace } from "../lib/markupEdit"
import { parsePath, serialisePath, type Seg } from "../lib/pathData"
import { ACTIONS, topLevel, type ActionContext, type EditorAction } from "../lib/editorActions"
import { ContextMenu, type MenuItem, type MenuState } from "./ContextMenu"
import { textFocus, useCommands } from "../lib/commands"
import type { Backdrop, SvgItem } from "../lib/types"
import { CodeEditor } from "./CodeEditor"
import { InspectPreview, type ElementMove } from "./InspectPreview"
import { LayersTree } from "./LayersTree"
import vectorcraftIcon from "../assets/vectorcraft.png"
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
  // Several elements can be selected; path tools show when it's just one path
  const [selection, setSelection] = useState<number[]>([])
  const selected = selection.length === 1 ? selection[0] : -1
  const setSelected = (i: number) => setSelection(i >= 0 ? [i] : [])
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [note, setNote] = useState("")
  useEffect(() => { if (!note) return; const t = setTimeout(() => setNote(""), 5000); return () => clearTimeout(t) }, [note])
  const [hover, setHover] = useState(-1)
  const [reveal, setReveal] = useState<{ start: number, end: number, n: number, focus?: boolean } | null>(null)
  const [copied, setCopied] = useState(false)
  const edited = item.fileSource !== undefined && item.source !== item.fileSource

  // Esc closes, unless Monaco is using it (find box, suggestions)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return
      if ((e.target as Element | null)?.closest?.(".monaco-editor")) return
      // A right-click menu closes first, then the selection goes
      if (document.querySelector(".context-menu")) return
      if (selRef.current.length) { setSelection([]); return }
      onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  const selRef = useRef(selection)
  selRef.current = selection

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

  // ── Undo and redo ─────────────────────────────────────────────────────────
  // One history for every kind of edit here: typing, dragging points,
  // nudging, layers. Quick runs of changes (typing, arrow nudges) are grouped
  const source = item.source ?? ""
  const hist = useRef({ past: [] as string[], future: [] as string[], prev: source, at: 0, restoring: false })
  const [, setHistTick] = useState(0)
  useEffect(() => {
    const h = hist.current
    if (source === h.prev) return
    if (h.restoring) h.restoring = false
    else {
      const now = Date.now()
      if (now - h.at > 600) { h.past.push(h.prev); h.at = now }
      if (h.past.length > 300) h.past.shift()
      h.future = []
    }
    h.prev = source
    setHistTick((n) => n + 1)
  }, [source])
  const travel = (back: boolean) => {
    const h = hist.current
    const to = back ? h.past.pop() : h.future.pop()
    if (to === undefined) return
    ;(back ? h.future : h.past).push(source)
    h.restoring = true
    h.at = 0
    // Same elements, same numbering: keep what's selected
    if (tab === "source" && elementRanges(to).length === ranges.length) own.current = true
    onEdit(to)
  }
  const travelRef = useRef(travel)
  travelRef.current = travel
  const canUndo = hist.current.past.length > 0, canRedo = hist.current.future.length > 0

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

  // Selects whatever now starts at `start` in the new markup
  const commitAndSelect = (next: { markup: string, start: number } | null) => {
    if (!next) return
    commit(next.markup)
    const i = elementRanges(next.markup).findIndex((r) => r.start === next.start)
    setSelected(i)
    setHover(-1)
  }

  // ── Actions on the selection ──────────────────────────────────────────────
  const ctx = (): ActionContext | null => elements && editable
    ? { markup, ranges, elements, selection: topLevel(selection, elements) }
    : null
  const available = (pick = selection) => {
    if (!elements || !editable) return []
    const c = { markup, ranges, elements, selection: topLevel(pick, elements) }
    return ACTIONS.filter((a) => a.applies(c))
  }
  const run = async (action: EditorAction, c = ctx()) => {
    if (!c) return
    try {
      const out = await action.run(c)
      if (!out) return
      if ("error" in out) { setNote(out.error); return }
      commit(out.markup)
      if (out.select) setSelection(out.select)
      setHover(-1)
      if (out.note) setNote(out.note)
    } catch (e) {
      setNote((e as Error).message)
    }
  }
  const runRef = useRef({ run, ctx, available })
  runRef.current = { run, ctx, available }

  /** Moves elements by (dx, dy) in their parents' units */
  const moveBy = (moves: ElementMove[]) => {
    if (!elements || !editable) return
    let next = markup
    // Back to front, so earlier offsets stay put
    for (const m of [...moves].sort((a, b) => b.index - a.index)) {
      const r = elementRanges(next)[m.index], el = elements[m.index]
      if (r && el && m.index > 0) next = setAttrs(next, r, translateAttrs(el, m.dx, m.dy))
    }
    commit(next)
  }
  const moveRef = useRef(moveBy)
  moveRef.current = moveBy

  // ⌘-shortcuts arrive as commands (the desktop menu sends them, the browser
  // turns key presses into them). One undo history here, even in Monaco
  useCommands((cmd) => {
    if (cmd === "undo" || cmd === "redo") { travelRef.current(cmd === "undo"); return true }
    const focus = textFocus()
    if (focus) return false
    const c = runRef.current.ctx()
    if (!c) return false
    if (cmd === "selectAll") {
      setSelection(c.elements.map((el, i) => (i > 0 && /^(path|rect|circle|ellipse|line|polyline|polygon|text|image|use)$/.test(el.localName) && !el.closest("defs, clipPath, mask, symbol, marker, pattern") ? i : -1)).filter((i) => i > 0))
      return true
    }
    const action = ACTIONS.find((a) => a.command === cmd)
    if (action && action.applies(c)) runRef.current.run(action, c)
    // Taken either way, so ⌘D doesn't fall through to Monaco or the page
    return true
  })

  // Plain keys: arrows nudge, Delete removes
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey) return
      if (textFocus()) return
      const c = runRef.current.ctx()
      if (!c) return
      const dir: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
      if (dir[e.key] && c.selection.length) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : e.altKey ? 0.1 : 1
        moveRef.current(c.selection.map((index) => ({ index, dx: dir[e.key][0] * step, dy: dir[e.key][1] * step })))
        return
      }
      const action = ACTIONS.find((a) => a.keys?.(e) && a.applies(c))
      if (!action) return
      e.preventDefault()
      runRef.current.run(action, c)
    }
    window.addEventListener("keydown", key)
    return () => window.removeEventListener("keydown", key)
  }, [])

  const openMenu = (i: number, e: React.MouseEvent) => {
    e.preventDefault()
    if (!editable) return
    // Right-clicking outside the selection selects that one thing
    const pick = i > 0 && !selection.includes(i) ? [i] : selection
    if (pick !== selection) setSelection(pick)
    const acts = available(pick)
    if (!acts.length) return
    const c = elements ? { markup, ranges, elements, selection: topLevel(pick, elements) } : null
    const items: Array<MenuItem | "-"> = []
    let last = ""
    for (const a of acts) {
      if (last && a.group !== last) items.push("-")
      last = a.group
      items.push({ label: a.shortcut ? `${a.label}    ${a.shortcut}` : a.label, danger: a.danger, run: () => { if (c) run(a, c) } })
    }
    setMenu({ x: e.clientX, y: e.clientY, items })
  }

  const move = (from: number, to: number, place: DropPlace) => {
    const a = ranges[from], b = ranges[to]
    if (a && b && from > 0 && from !== to) commitAndSelect(moveElement(markup, a, b, place))
  }

  // Where Shift-click ranges start from
  const anchor = useRef(-1)
  const pick = (i: number, mode: "only" | "add" | "range" = "only") => {
    if (i < 0) { if (mode === "only") setSelection([]); return }
    if (mode === "add") setSelection((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))
    else if (mode === "range" && anchor.current >= 0) {
      const [a, b] = anchor.current < i ? [anchor.current, i] : [i, anchor.current]
      setSelection([...Array.from({ length: b - a + 1 }, (_, k) => a + k).filter((k) => k !== i && k > 0), i])
    } else setSelection([i])
    if (mode !== "range") anchor.current = i
    // Show it in the markup, without taking the keyboard away from shortcuts
    const r = ranges[i]
    if (r) setReveal((x) => ({ start: r.start, end: r.end, n: (x?.n ?? 0) + 1, focus: false }))
  }
  const last = selection.length ? selection[selection.length - 1] : -1
  const markRange = hover >= 0 ? ranges[hover] : last >= 0 ? ranges[last] : null
  const actions = available()

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
          {/* A nod to a proper vector editor, for jobs beyond tidying markup */}
          <a className="markup-dialog__nod" href="https://getartcraft.com/apps/vectorcraft" target="_blank" rel="noopener"
            title="For drawing from scratch, VectorCraft is a full vector editor">
            Need a full editor? <img src={vectorcraftIcon} alt="" width={14} height={14} />
            <span className="markup-dialog__nod-mark">Vector<b>Craft</b></span>
          </a>
          <div className="markup-dialog__spacer" />
          <div className="btn-join" role="group" aria-label="History">
            <button className="btn btn--secondary btn--sm" onClick={() => travel(true)} disabled={!canUndo} title="Undo (⌘Z)" aria-label="Undo"><IconUndo width={12} height={12} /></button>
            <button className="btn btn--secondary btn--sm" onClick={() => travel(false)} disabled={!canRedo} title="Redo (⇧⌘Z)" aria-label="Redo"><IconRedo width={12} height={12} /></button>
          </div>
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
              ? <LayersTree elements={elements} selection={selection} hover={hover}
                  onPick={pick} onSelectSet={(list) => { setSelection(list); const r = ranges[list[list.length - 1]]; if (r) setReveal((x) => ({ start: r.start, end: r.end, n: (x?.n ?? 0) + 1, focus: false })) }}
                  onHover={setHover} onMenu={openMenu}
                  onDelete={editable ? (i) => { const d = ACTIONS.find((a) => a.id === "delete"); const c = elements && { markup, ranges, elements, selection: [i] }; if (d && c) run(d, c) } : undefined}
                  onMove={editable ? move : undefined} />
              : <p className="text-3">{markup ? "The markup doesn't parse, fix it to see the layers." : "Nothing here yet."}</p>}
          </div>
          <div className="markup-dialog__canvas">
            {editable && (
              <div className="edit-toolbar">
                <span className="text-3 edit-toolbar__count">
                  {selection.length ? `${selection.length} selected` : "Click, ⌘-click or drag a box to select"}
                </span>
                {actions.filter((a) => a.toolbar).map((a) => (
                  <button key={a.id} className="btn btn--secondary btn--sm" onClick={() => run(a)}
                    title={`${a.hint ?? a.label}${a.shortcut ? ` (${a.shortcut})` : ""}`}>{a.label}</button>
                ))}
                {note && <span className="edit-toolbar__note">{note}</span>}
              </div>
            )}
            <InspectPreview markup={markup} backdrop={backdrop} selection={selection}
              onPick={(i, add) => { (document.activeElement as HTMLElement | null)?.blur?.(); pick(i, add ? "add" : "only") }}
              onSelect={(found, add) => setSelection((s) => (add ? [...s, ...found.filter((i) => !s.includes(i))] : found))}
              onMoveBy={moveBy} onContextMenu={openMenu} readOnly={!editable}
              onHover={setHover} hover={hover}
              path={segs ? { index: selected, segs, readOnly: !editable, active, onActive: setActive, onCommit: writePath } : null} />
          </div>
          <div className="markup-dialog__side">
            <CodeEditor
              key={tab}
              className="markup-dialog__code"
              label={tab === "source" ? "Source markup" : "Optimised markup"}
              value={markup}
              readOnly={tab === "output"}
              onChange={tab === "source" ? onEdit : undefined}
              reveal={reveal}
              mark={markRange ? { start: markRange.start, end: markRange.end } : null}
              onCursor={(offset) => {
                // Follow the cursor into an element, but clicking between
                // elements leaves the selection (and the path tools) alone
                const i = rangeAt(ranges, offset)
                if (i > 0 && !selRef.current.includes(i)) setSelected(i)
              }}
            />
            {/* Always here, the same height, so selecting things doesn't shuffle the code around */}
            <div className="markup-dialog__tools">
              {segs && <PathPanel segs={segs} readOnly={!editable} active={active} onActive={setActive} onChange={writePath} />}
              {path && "error" in path && <p className="rule__error">This path's data doesn't parse: {path.error}</p>}
              {el && ["rect", "circle", "ellipse", "line", "polyline", "polygon"].includes(el.localName) && (
              <div className="path-panel path-panel--shape">
                <span className="text-2">This is a <code>&lt;{el.localName}&gt;</code>. Convert it to a path to edit its points.</span>
                  {!editable && <span className="text-3">Switch to Before to convert it.</span>}
              </div>
            )}
              {!segs && !(path && "error" in path) && !(el && ["rect", "circle", "ellipse", "line", "polyline", "polygon"].includes(el.localName)) && (
                <p className="text-3 markup-dialog__tools-empty">
                  {selection.length > 1 ? `${selection.length} elements selected. Path tools show when one path is selected.` : "Select a path to see its commands and edit its points here."}
                </p>
              )}
            </div>
          </div>
        </div>
        {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
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
