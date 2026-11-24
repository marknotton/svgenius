import { useState, type DragEvent } from "react"

// ── Drag to reorder ───────────────────────────────────────────────────────────
// Rows only become draggable while the grip is held, so text inputs inside a
// row still select text normally.

export function useDragSort<T extends { id: string }>(list: T[], onChange: (next: T[]) => void) {
  const [armed, setArmed] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<{ id: string, after: boolean } | null>(null)

  const end = () => { setArmed(null); setDragId(null); setOver(null) }

  const drop = () => {
    if (!dragId || !over || dragId === over.id) return end()
    const moving = list.find((x) => x.id === dragId)
    if (!moving) return end()
    const rest = list.filter((x) => x.id !== dragId)
    let at = rest.findIndex((x) => x.id === over.id)
    if (at < 0) return end()
    if (over.after) at++
    onChange([...rest.slice(0, at), moving, ...rest.slice(at)])
    end()
  }

  /** Spread onto each row */
  const rowProps = (id: string) => ({
    draggable: armed === id,
    "data-drag": dragId === id ? "self" : over?.id === id ? (over.after ? "after" : "before") : undefined,
    onDragStart: (e: DragEvent) => {
      setDragId(id)
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/plain", id)
    },
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!dragId) return
      e.preventDefault()
      const r = e.currentTarget.getBoundingClientRect()
      const after = e.clientY > r.top + r.height / 2
      if (over?.id !== id || over.after !== after) setOver({ id, after })
    },
    onDrop: (e: DragEvent) => { e.preventDefault(); drop() },
    onDragEnd: end
  })

  /** Spread onto the grip handle */
  const handleProps = (id: string) => ({
    onMouseDown: () => setArmed(id),
    onMouseUp: () => { if (!dragId) setArmed(null) }
  })

  return { rowProps, handleProps, dragging: dragId !== null }
}
