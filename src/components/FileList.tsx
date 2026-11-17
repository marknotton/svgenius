import { useEffect, useRef, type MouseEvent, type ReactNode } from "react"
import { LIVE_BUFFER_PX } from "../lib/config"
import { IconFile, IconFolder, IconTrash } from "../icons"
import { plural } from "../lib/format"
import type { FileTag } from "../lib/tags"
import type { AppSettings, Preset, SvgItem } from "../lib/types"
import { FileRow } from "./FileRow"

interface Props {
  items: SvgItem[]
  selection: Set<string>
  focusId: string | null
  onRowClick: (id: string, e: MouseEvent) => void
  onVisible: (ids: Set<string>) => void
  liveToggle: ReactNode
  settings: AppSettings
  defaultPreset: Preset
  isStale: (item: SvgItem) => boolean
  onToggle: (id: string, e: MouseEvent) => void
  onSelectAll: (all: boolean) => void
  onPreset: (id: string, presetId: string | null) => void
  onNewPreset: (item: SvgItem) => void
  onContextMenu: (id: string, e: MouseEvent) => void
  tagsFor: (item: SvgItem) => FileTag[]
  onAddFiles: () => void
  onAddFolder: () => void
  onRemove: () => void
  viewControls: ReactNode
  cssBar: ReactNode
}

const NO_TAGS: FileTag[] = []

export function FileList(p: Props) {
  const { items, selection, settings } = p
  const allSelected = items.length > 0 && selection.size === items.length
  const someSelected = selection.size > 0 && !allSelected

  // ── Which rows are on (or near) screen, for live updates ──────────────────
  const listRef = useRef<HTMLUListElement>(null)
  const observer = useRef<IntersectionObserver | null>(null)
  const visible = useRef(new Set<string>())
  const onVisible = useRef(p.onVisible)
  onVisible.current = p.onVisible

  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      let changed = false
      for (const e of entries) {
        const id = (e.target as HTMLElement).dataset.id
        if (!id) continue
        if (e.isIntersecting && !visible.current.has(id)) { visible.current.add(id); changed = true }
        else if (!e.isIntersecting && visible.current.delete(id)) changed = true
      }
      if (changed) onVisible.current(new Set(visible.current))
    }, { root: listRef.current, rootMargin: `${LIVE_BUFFER_PX}px 0px` })
    observer.current = io
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const io = observer.current
    if (!io) return
    const ids = new Set(items.map((i) => i.id))
    let pruned = false
    for (const id of visible.current) if (!ids.has(id)) { visible.current.delete(id); pruned = true }
    if (pruned) onVisible.current(new Set(visible.current))
    listRef.current?.querySelectorAll<HTMLElement>("[data-id]").forEach((el) => io.observe(el))
  }, [items])

  return (
    <section className="list">
      <div className="toolbar">
        <input
          type="checkbox"
          className="checkbox"
          aria-label="Select all"
          checked={allSelected}
          ref={(el) => { if (el) el.indeterminate = someSelected }}
          onChange={() => p.onSelectAll(!allSelected)}
        />
        <span className="toolbar__count">
          {selection.size > 0 ? `${selection.size} of ${plural(items.length, "file")} selected` : plural(items.length, "file")}
        </span>
        <div className="toolbar__group">
          <button className="btn btn--ghost btn--sm" onClick={p.onAddFiles}><IconFile /> Files</button>
          <button className="btn btn--ghost btn--sm" onClick={p.onAddFolder}><IconFolder /> Folder</button>
          <button className="btn btn--ghost btn--sm" onClick={p.onRemove} disabled={items.length === 0}
            title={selection.size ? "Remove selected from the list" : "Clear the list"}>
            <IconTrash /> {selection.size ? "Remove" : "Clear"}
          </button>
        </div>
        <div className="toolbar__spacer" />
        {p.liveToggle}
        {p.viewControls}
      </div>
      {p.cssBar}

      <ul ref={listRef} className={`file-list${!settings.showDetails ? " file-list--gallery" : settings.thumbPx <= 40 ? " file-list--tiny" : ""}`}>
        {items.map((item) => (
          <FileRow
            key={item.id}
            item={item}
            selected={selection.has(item.id)}
            focused={p.focusId === item.id}
            onRowClick={p.onRowClick}
            stale={p.isStale(item)}
            thumbPx={settings.showDetails ? settings.thumbPx : settings.galleryPx}
            compare={settings.listCompare}
            details={settings.showDetails}
            tags={settings.showDetails ? p.tagsFor(item) : NO_TAGS}
            onContextMenu={p.onContextMenu}
            backdrop={settings.backdrop}
            presets={settings.presets}
            defaultPreset={p.defaultPreset}
            onToggle={p.onToggle}
            onPreset={p.onPreset}
            onNewPreset={p.onNewPreset}
          />
        ))}
      </ul>
    </section>
  )
}
