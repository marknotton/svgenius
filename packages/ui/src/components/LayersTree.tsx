import { useEffect, useMemo, useRef, useState } from "react"
import { IconCaret, IconEye, IconEyeOff, IconLock, IconTrash, IconUnlock } from "../icons"
import type { DropPlace } from "@marknotton/svgenius-core/markupEdit"

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
  onPick: (index: number, mode: "only" | "add") => void
  /** Shift-click: everything shown between the last click and this one */
  onSelectSet: (indices: number[]) => void
  onMenu?: (index: number, e: React.MouseEvent) => void
  onHover: (index: number) => void
  /** The rest only in the editable markup */
  onDelete?: (index: number) => void
  onMove?: (from: number, to: number, place: DropPlace) => void
  /** Locked layers, and everything inside them */
  locked?: Set<number>
  /** The layers locked themselves (not through a parent) */
  ownLocked?: Set<number>
  onLock?: (index: number) => void
  /** Layers hidden in the editor, and the ones hidden themselves */
  hidden?: Set<number>
  ownHidden?: Set<number>
  onHide?: (index: number) => void
  /** Rows to flash, like just-pasted elements. n changes each time */
  flash?: { indices: number[], n: number } | null
}

interface Node { i: number, depth: number, parent: number, kids: number, label: string, detail: string }

function describe(el: Element) {
  // Both the id and every class, so a well-labelled file reads at a glance
  const id = el.getAttribute("id")?.trim()
  const cls = el.getAttribute("class")?.trim().split(/\s+/).filter(Boolean) ?? []
  let detail = [id ? `#${id}` : "", ...cls.map((c) => `.${c}`)].filter(Boolean).join(" ")
  if (!detail && (el.localName === "text" || el.localName === "title" || el.localName === "desc")) {
    const t = el.textContent?.trim().replace(/\s+/g, " ") ?? ""
    detail = t.length > 24 ? `${t.slice(0, 24)}…` : t
  }
  return { label: el.localName, detail }
}

export function LayersTree({ elements, selection, hover, onPick, onSelectSet, onMenu, onHover, onDelete, onMove, locked, ownLocked, onLock, hidden, ownHidden, onHide, flash }: Props) {
  // Flash new rows once they're on screen
  useEffect(() => {
    if (!flash) return
    const raf = requestAnimationFrame(() => {
      for (const i of flash.indices) {
        const row = list.current?.querySelector(`[data-layer="${i}"]`) as HTMLElement | null
        if (!row) continue
        row.classList.remove("is-flash")
        void row.offsetWidth
        row.classList.add("is-flash")
        row.scrollIntoView({ block: "nearest" })
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [flash])
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

  // over: the row under the pointer. target: what the drop lands next to or in,
  // which can be one of over's parents when the pointer pulls left to step out of a group
  const [drag, setDrag] = useState<{ from: number, over: number, place: DropPlace, target: number, depth: number } | null>(null)
  const ROW_INDENT = 12

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

  /** Dropping below the last row of a group: pull left to land after the group itself */
  const outdent = (e: React.DragEvent, n: Node): { target: number, depth: number } => {
    const at = visible.findIndex((v) => v.i === n.i)
    const next = visible[at + 1]
    const minDepth = Math.max(1, next ? next.depth : 1)
    if (n.depth <= minDepth) return { target: n.i, depth: n.depth }
    const left = (list.current?.getBoundingClientRect().left ?? 0) + 4
    const want = Math.max(minDepth, Math.min(n.depth, Math.floor((e.clientX - left) / ROW_INDENT)))
    let t = n.i
    while (nodes[t].depth > want && nodes[t].parent > 0) t = nodes[t].parent
    return { target: t, depth: nodes[t].depth }
  }
  const dropOnBlank = (e: React.DragEvent) => {
    if (!drag || e.target !== e.currentTarget) return
    // Below the last row: after the last top-level element
    const last = [...nodes].reverse().find((n) => n.depth === 1)
    if (!last || !canDrop(drag.from, last.i)) return
    e.preventDefault()
    const lastRow = visible[visible.length - 1]
    if (drag.over !== lastRow.i || drag.target !== last.i || drag.place !== "after") setDrag({ ...drag, over: lastRow.i, target: last.i, place: "after", depth: 1 })
  }

  // Finder rules: click selects, ⌘-click toggles, Shift-click selects the
  // rows shown between the last click and this one (⌘⇧ adds them)
  const anchor = useRef(-1)
  const click = (i: number, e: { shiftKey: boolean, metaKey: boolean, ctrlKey: boolean }) => {
    const toggle = e.metaKey || e.ctrlKey
    if (e.shiftKey && anchor.current >= 0) {
      const a = visible.findIndex((n) => n.i === anchor.current), b = visible.findIndex((n) => n.i === i)
      if (a >= 0 && b >= 0) {
        const span = visible.slice(Math.min(a, b), Math.max(a, b) + 1).map((n) => n.i).filter((k) => k > 0)
        const rest = toggle ? selection.filter((k) => !span.includes(k)) : []
        onSelectSet([...rest, ...span.filter((k) => k !== i), i])
        return
      }
    }
    anchor.current = i
    onPick(i, toggle ? "add" : "only")
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (selected < 0) return
    const at = visible.findIndex((n) => n.i === selected)
    if (e.key === "ArrowDown" && at < visible.length - 1) { e.preventDefault(); e.stopPropagation(); click(visible[at + 1].i, { shiftKey: e.shiftKey, metaKey: false, ctrlKey: false }) }
    else if (e.key === "ArrowUp" && at > 0) { e.preventDefault(); e.stopPropagation(); click(visible[at - 1].i, { shiftKey: e.shiftKey, metaKey: false, ctrlKey: false }) }
    else if (e.key === "ArrowLeft" && nodes[selected].kids && !collapsed.has(selected)) { e.preventDefault(); toggle(selected) }
    else if (e.key === "ArrowRight" && collapsed.has(selected)) { e.preventDefault(); toggle(selected) }
  }

  return (
    <div className="layers" ref={list} role="tree" aria-label="Layers" tabIndex={0} onKeyDown={onKey}
      onMouseLeave={() => onHover(-1)}
      onDragOver={dropOnBlank}
      onDrop={(e) => { if (e.target !== e.currentTarget) return; e.preventDefault(); if (drag && drag.over >= 0) onMove?.(drag.from, drag.target, drag.place); setDrag(null) }}>
      {visible.map((n) => (
        <div key={n.i} data-layer={n.i} role="treeitem" aria-selected={chosen.has(n.i)}
          aria-expanded={n.kids ? !collapsed.has(n.i) : undefined}
          className={`layer${chosen.has(n.i) ? " is-selected" : ""}${n.i === hover ? " is-hover" : ""}${drag?.over === n.i ? ` is-drop-${drag.place}` : ""}${drag?.from === n.i ? " is-dragging" : ""}${locked?.has(n.i) ? " is-locked" : ""}${hidden?.has(n.i) ? " is-hidden" : ""}`}
          style={{ paddingLeft: 4 + n.depth * ROW_INDENT, ...(drag?.over === n.i ? { "--drop-x": `${4 + drag.depth * ROW_INDENT}px` } : {}) } as React.CSSProperties}
          draggable={!!onMove && n.i > 0 && !locked?.has(n.i)}
          onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(n.i)); setDrag({ from: n.i, over: -1, place: "before", target: -1, depth: 0 }) }}
          onDragOver={(e) => {
            if (!drag) return
            const place = placeFor(e, n.i)
            const { target, depth } = place === "after" ? outdent(e, n) : { target: n.i, depth: n.depth }
            if (!canDrop(drag.from, target)) return
            e.preventDefault()
            e.stopPropagation()
            if (drag.over !== n.i || drag.place !== place || drag.target !== target) setDrag({ ...drag, over: n.i, place, target, depth })
          }}
          onDragLeave={() => { if (drag?.over === n.i) setDrag({ ...drag, over: -1 }) }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (drag && drag.over >= 0) onMove?.(drag.from, drag.target, drag.place); setDrag(null) }}
          onDragEnd={() => setDrag(null)}
          onContextMenu={(e) => { e.preventDefault(); onMenu?.(n.i, e) }}
          onMouseEnter={() => onHover(n.i)}
          onMouseDown={(e) => { if (e.shiftKey) e.preventDefault() }}
          onClick={(e) => { if (!locked?.has(n.i) && !hidden?.has(n.i)) click(n.i, e) }}>
          {n.kids > 0
            ? <button className={`layer__caret${collapsed.has(n.i) ? "" : " is-open"}`} tabIndex={-1} aria-label={collapsed.has(n.i) ? "Expand" : "Collapse"}
                onClick={(e) => { e.stopPropagation(); toggle(n.i) }}><IconCaret /></button>
            : <span className="layer__caret" />}
          <span className="layer__tag">{n.label}</span>
          {n.detail && <span className="layer__detail text-3" title={n.detail}>{n.detail}</span>}
          {/* Always there, in fixed slots, so nothing shifts on hover or select */}
          {n.i > 0 && (onHide || onLock || onDelete) && (
            <span className="layer__acts">
              {onHide && (
                <button className={`layer__act${ownHidden?.has(n.i) ? " is-on" : ""}`} tabIndex={-1}
                  title={ownHidden?.has(n.i) ? "Show it again" : hidden?.has(n.i) ? "Hidden by a group it's in" : "Hide it in the editor (the file isn't changed)"}
                  aria-label={`${ownHidden?.has(n.i) ? "Show" : "Hide"} ${n.label}`} disabled={!ownHidden?.has(n.i) && hidden?.has(n.i)}
                  onClick={(e) => { e.stopPropagation(); onHide(n.i) }}>
                  {hidden?.has(n.i) ? <IconEyeOff width={14} height={14} /> : <IconEye width={14} height={14} />}
                </button>
              )}
              {onLock && (
                <button className={`layer__act${ownLocked?.has(n.i) ? " is-on" : ""}`} tabIndex={-1}
                  title={ownLocked?.has(n.i) ? "Unlock: it can be selected and edited again" : locked?.has(n.i) ? "Locked by a group it's in" : "Lock: it can't be selected or edited until unlocked"}
                  aria-label={`${ownLocked?.has(n.i) ? "Unlock" : "Lock"} ${n.label}`} disabled={!ownLocked?.has(n.i) && locked?.has(n.i)}
                  onClick={(e) => { e.stopPropagation(); onLock(n.i) }}>
                  {locked?.has(n.i) ? <IconLock width={14} height={14} /> : <IconUnlock width={14} height={14} />}
                </button>
              )}
              {onDelete && (
                <button className="layer__act layer__act--danger" tabIndex={-1} title="Delete this element (Delete key)" aria-label={`Delete ${n.label}`}
                  disabled={locked?.has(n.i)} onClick={(e) => { e.stopPropagation(); onDelete(n.i) }}><IconTrash width={14} height={14} /></button>
              )}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
