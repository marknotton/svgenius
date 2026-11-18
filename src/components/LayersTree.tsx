import { useEffect, useMemo, useRef, useState } from "react"
import { IconCaret, IconTrash } from "../icons"
import type { DropPlace } from "../lib/markupEdit"

/** Elements that can hold others, so things can be dropped into them */
const CONTAINERS = new Set(["svg", "g", "defs", "symbol", "mask", "clipPath", "a", "switch", "pattern", "marker"])

// ── Layers: every element of the SVG as a tree ────────────────────────────────
// Indices are tree order, the same numbering as the inspect preview and the
// element ranges in the markup.

interface Props {
  elements: Element[]
  /** Selected indices; the last is the one most recently picked */
  selection: number[]
  hover: number
  /** add: Cmd/Ctrl-click toggles, range: Shift-click extends */
  onPick: (index: number, mode: "only" | "add" | "range") => void
  onMenu?: (index: number, e: React.MouseEvent) => void
  onHover: (index: number) => void
  /** The rest only in the editable markup */
  onDelete?: (index: number) => void
  onMove?: (from: number, to: number, place: DropPlace) => void
}

interface Node { i: number, depth: number, parent: number, kids: number, label: string, detail: string }

function describe(el: Element) {
  const id = el.getAttribute("id")
  const cls = el.getAttribute("class")?.trim().split(/\s+/)[0]
  let detail = id ? `#${id}` : cls ? `.${cls}` : ""
  if (!detail && (el.localName === "text" || el.localName === "title" || el.localName === "desc")) {
    const t = el.textContent?.trim().replace(/\s+/g, " ") ?? ""
    detail = t.length > 24 ? `${t.slice(0, 24)}…` : t
  }
  return { label: el.localName, detail }
}

export function LayersTree({ elements, selection, hover, onPick, onMenu, onHover, onDelete, onMove }: Props) {
  const selected = selection.length ? selection[selection.length - 1] : -1
  const chosen = useMemo(() => new Set(selection), [selection])
  const nodes = useMemo(() => {
    const index = new Map(elements.map((el, i) => [el, i]))
    return elements.map((el, i): Node => {
      const parent = el.parentElement ? index.get(el.parentElement) ?? -1 : -1
      let depth = 0
      for (let p = el.parentElement; p && index.has(p); p = p.parentElement) depth++
      return { i, depth, parent, kids: el.children.length, ...describe(el) }
    })
  }, [elements])

  // Big files start with their groups folded
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set())
  const big = nodes.length > 300
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current || !big) return
    seeded.current = true
    setCollapsed(new Set(nodes.filter((n) => n.i > 0 && n.kids > 0).map((n) => n.i)))
  }, [big, nodes])

  // Open the folders around whatever gets selected
  useEffect(() => {
    if (selected < 0 || !nodes[selected]) return
    setCollapsed((c) => {
      let changed = false
      const next = new Set(c)
      for (let p = nodes[selected].parent; p >= 0; p = nodes[p].parent) if (next.delete(p)) changed = true
      return changed ? next : c
    })
  }, [selected, nodes])

  const visible = useMemo(() => {
    const out: Node[] = []
    let skipBelow = -1
    for (const n of nodes) {
      if (skipBelow >= 0 && n.depth > skipBelow) continue
      skipBelow = -1
      out.push(n)
      if (collapsed.has(n.i) && n.kids > 0) skipBelow = n.depth
    }
    return out
  }, [nodes, collapsed])

  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    list.current?.querySelector(`[data-layer="${selected}"]`)?.scrollIntoView({ block: "nearest" })
  }, [selected, visible])

  const toggle = (i: number) => setCollapsed((c) => {
    const next = new Set(c)
    if (!next.delete(i)) next.add(i)
    return next
  })

  const [drag, setDrag] = useState<{ from: number, over: number, place: DropPlace } | null>(null)

  const placeFor = (e: React.DragEvent, i: number): DropPlace => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = (e.clientY - r.top) / r.height
    if (i === 0) return "inside"
    if (CONTAINERS.has(elements[i].localName)) return y < 0.25 ? "before" : y > 0.75 ? "after" : "inside"
    return y < 0.5 ? "before" : "after"
  }
  const canDrop = (from: number, to: number) => {
    // Not onto itself or into its own children
    for (let p: Element | null = elements[to]; p; p = p.parentElement) if (p === elements[from]) return false
    return true
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (selected < 0) return
    const at = visible.findIndex((n) => n.i === selected)
    if (e.key === "ArrowDown" && at < visible.length - 1) { e.preventDefault(); e.stopPropagation(); onPick(visible[at + 1].i, e.shiftKey ? "range" : "only") }
    else if (e.key === "ArrowUp" && at > 0) { e.preventDefault(); e.stopPropagation(); onPick(visible[at - 1].i, e.shiftKey ? "range" : "only") }
    else if (e.key === "ArrowLeft" && nodes[selected].kids && !collapsed.has(selected)) { e.preventDefault(); toggle(selected) }
    else if (e.key === "ArrowRight" && collapsed.has(selected)) { e.preventDefault(); toggle(selected) }
  }

  return (
    <div className="layers" ref={list} role="tree" aria-label="Layers" tabIndex={0} onKeyDown={onKey}
      onMouseLeave={() => onHover(-1)}>
      {visible.map((n) => (
        <div key={n.i} data-layer={n.i} role="treeitem" aria-selected={chosen.has(n.i)}
          aria-expanded={n.kids ? !collapsed.has(n.i) : undefined}
          className={`layer${chosen.has(n.i) ? " is-selected" : ""}${n.i === hover ? " is-hover" : ""}${drag?.over === n.i ? ` is-drop-${drag.place}` : ""}${drag?.from === n.i ? " is-dragging" : ""}`}
          style={{ paddingLeft: 4 + n.depth * 12 }}
          draggable={!!onMove && n.i > 0}
          onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(n.i)); setDrag({ from: n.i, over: -1, place: "before" }) }}
          onDragOver={(e) => {
            if (!drag || !canDrop(drag.from, n.i)) return
            e.preventDefault()
            const place = placeFor(e, n.i)
            if (drag.over !== n.i || drag.place !== place) setDrag({ ...drag, over: n.i, place })
          }}
          onDragLeave={() => { if (drag?.over === n.i) setDrag({ ...drag, over: -1 }) }}
          onDrop={(e) => { e.preventDefault(); if (drag && drag.over >= 0) onMove?.(drag.from, drag.over, drag.place); setDrag(null) }}
          onDragEnd={() => setDrag(null)}
          onContextMenu={(e) => { e.preventDefault(); onMenu?.(n.i, e) }}
          onMouseEnter={() => onHover(n.i)}
          onClick={(e) => onPick(n.i, e.shiftKey ? "range" : e.metaKey || e.ctrlKey ? "add" : "only")}>
          {n.kids > 0
            ? <button className={`layer__caret${collapsed.has(n.i) ? "" : " is-open"}`} tabIndex={-1} aria-label={collapsed.has(n.i) ? "Expand" : "Collapse"}
                onClick={(e) => { e.stopPropagation(); toggle(n.i) }}><IconCaret /></button>
            : <span className="layer__caret" />}
          <span className="layer__tag">{n.label}</span>
          {n.detail && <span className="layer__detail text-3">{n.detail}</span>}
          {onDelete && n.i > 0 && chosen.has(n.i) && (
            <button className="layer__delete" tabIndex={-1} title="Delete this element (Delete key)" aria-label={`Delete ${n.label}`}
              onClick={(e) => { e.stopPropagation(); onDelete(n.i) }}><IconTrash width={11} height={11} /></button>
          )}
        </div>
      ))}
    </div>
  )
}
