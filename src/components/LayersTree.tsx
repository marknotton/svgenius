import { useEffect, useMemo, useRef, useState } from "react"
import { IconCaret, IconTrash } from "../icons"

// ── Layers: every element of the SVG as a tree ────────────────────────────────
// Indices are tree order, the same numbering as the inspect preview and the
// element ranges in the markup.

interface Props {
  elements: Element[]
  selected: number
  hover: number
  onPick: (index: number) => void
  onHover: (index: number) => void
  /** Only in the editable markup */
  onDelete?: (index: number) => void
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

export function LayersTree({ elements, selected, hover, onPick, onHover, onDelete }: Props) {
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

  const onKey = (e: React.KeyboardEvent) => {
    if (selected < 0) return
    const at = visible.findIndex((n) => n.i === selected)
    if (e.key === "ArrowDown" && at < visible.length - 1) { e.preventDefault(); onPick(visible[at + 1].i) }
    else if (e.key === "ArrowUp" && at > 0) { e.preventDefault(); onPick(visible[at - 1].i) }
    else if (e.key === "ArrowLeft" && nodes[selected].kids && !collapsed.has(selected)) { e.preventDefault(); toggle(selected) }
    else if (e.key === "ArrowRight" && collapsed.has(selected)) { e.preventDefault(); toggle(selected) }
    else if ((e.key === "Delete" || e.key === "Backspace") && onDelete && selected > 0) { e.preventDefault(); onDelete(selected) }
  }

  return (
    <div className="layers" ref={list} role="tree" aria-label="Layers" tabIndex={0} onKeyDown={onKey}
      onMouseLeave={() => onHover(-1)}>
      {visible.map((n) => (
        <div key={n.i} data-layer={n.i} role="treeitem" aria-selected={n.i === selected}
          aria-expanded={n.kids ? !collapsed.has(n.i) : undefined}
          className={`layer${n.i === selected ? " is-selected" : ""}${n.i === hover ? " is-hover" : ""}`}
          style={{ paddingLeft: 4 + n.depth * 12 }}
          onMouseEnter={() => onHover(n.i)}
          onClick={() => onPick(n.i)}>
          {n.kids > 0
            ? <button className={`layer__caret${collapsed.has(n.i) ? "" : " is-open"}`} tabIndex={-1} aria-label={collapsed.has(n.i) ? "Expand" : "Collapse"}
                onClick={(e) => { e.stopPropagation(); toggle(n.i) }}><IconCaret /></button>
            : <span className="layer__caret" />}
          <span className="layer__tag">{n.label}</span>
          {n.detail && <span className="layer__detail text-3">{n.detail}</span>}
          {onDelete && n.i > 0 && (
            <button className="layer__delete" tabIndex={-1} title="Delete this element (Delete key)" aria-label={`Delete ${n.label}`}
              onClick={(e) => { e.stopPropagation(); onDelete(n.i) }}><IconTrash width={11} height={11} /></button>
          )}
        </div>
      ))}
    </div>
  )
}
