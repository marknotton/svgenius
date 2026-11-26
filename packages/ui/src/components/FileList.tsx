import { useEffect, useRef, type MouseEvent, type ReactNode } from "react"
import { LIVE_BUFFER_PX } from "@marknotton/svgenius-core/config"
import { IconFilter, IconSort, IconPlus, IconTrash, IconProject } from "../icons"
import { plural } from "@marknotton/svgenius-core/format"
import type { FileTag } from "@marknotton/svgenius-core/tags"
import type { ShapeFrame } from "@marknotton/svgenius-core/shapes"
import type { AppSettings, DesignPrinciple, Preset, SvgItem } from "@marknotton/svgenius-core/types"
import { FileRow } from "./FileRow"

interface Props {
  /** The files to show (already filtered by the search) */
  items: SvgItem[]
  total: number
  query: string
  onQuery: (q: string) => void
  selection: Set<string>
  focusId: string | null
  onRowClick: (id: string, e: MouseEvent) => void
  onOpenMarkup: (id: string) => void
  /** Double-click opens the editor (Advanced), so rows hint at it */
  canOpen?: boolean
  onExportName?: (id: string) => void
  onVisible: (ids: Set<string>) => void
  settings: AppSettings
  defaultPreset: Preset
  isStale: (item: SvgItem) => boolean
  onToggle: (id: string, e: MouseEvent) => void
  onSelectAll: (all: boolean) => void
  onContextMenu: (id: string, e: MouseEvent) => void
  onFlag: (id: string, e: MouseEvent) => void
  /** Number of active filter rules, and the filter panel itself */
  filterCount: number
  filtersOpen: boolean
  /** Advanced view only */
  showFilters: boolean
  onFilters: () => void
  filterBar: ReactNode
  /** The sort in use, or null for the list's own order */
  sortLabel: string | null
  onSort: (e: React.MouseEvent) => void
  onClearFilters: () => void
  tagsFor: (item: SvgItem) => FileTag[]
  /** Design principle guides over each thumbnail, when on */
  guidesFor?: (item: SvgItem) => DesignPrinciple | null
  /** With guidesFor: the alignment keylines too */
  alignmentGuides?: boolean
  /** The shape guide and clip sit in each preset's design principle live area */
  frameFor?: (item: SvgItem) => ShapeFrame | null
  /** The design principle whose grid each thumbnail's checkerboard follows */
  checkerFor?: (item: SvgItem) => DesignPrinciple | null
  /** Row buttons: the full editor and Quick Edit */
  onEdit?: (id: string) => void
  onQuickEdit?: (id: string) => void
  exportNames: Map<string, string> | null
  /** Opens the Add SVGs dialog: files, a folder or pasted code */
  onAdd: () => void
  /** Open and save .svgenius projects */
  onProjectMenu?: (e: React.MouseEvent) => void
  projectName?: string
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
          {selection.size > 0
            ? `${selection.size} of ${plural(p.total, "file")} selected`
            : p.query.trim() || p.filterCount ? `${items.length} of ${plural(p.total, "file")}` : plural(p.total, "file")}
        </span>
        <div className="toolbar__group">
          <button className="btn btn--ghost btn--sm" onClick={p.onAdd} title="Add SVGs: files, a folder, or code pasted from the clipboard"><IconPlus /> Add</button>
          {p.onProjectMenu && (
            <button className="btn btn--ghost btn--sm" onClick={p.onProjectMenu}
              title={p.projectName ? `Project: ${p.projectName}. Open or save projects (all files, settings and edits)` : "Open or save a project: every file, its settings and edits, in one .svgenius file"}>
              <IconProject /> {p.projectName ? p.projectName.replace(/\.svgenius$/i, "") : "Project"}
            </button>
          )}
          <button className="btn btn--ghost btn--sm" onClick={p.onRemove} disabled={items.length === 0}
            title={selection.size ? "Remove selected from the list" : "Clear the list"}>
            <IconTrash /> {selection.size ? "Remove" : "Clear"}
          </button>
        </div>
        <input className="input input--sm list-search" type="search" placeholder="Search names, or shape:tall" title="Search names. shape:square, shape:tall or shape:wide match by the artwork, vb:… by the viewBox, is:tuned finds files placed in Quick Edit, and a leading - leaves any of them out" aria-label="Search files by name"
          value={p.query} onChange={(e) => p.onQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") p.onQuery("") }} />
        {p.showFilters && <button className={`btn btn--ghost btn--sm filters-btn${p.filtersOpen || p.filterCount ? " is-on" : ""}`} onClick={p.onFilters}
          aria-pressed={p.filtersOpen} title="Advanced filters: markup, colours, elements, attributes, flags and status">
          <IconFilter /> Filters{p.filterCount > 0 && <span className="filters-btn__count">{p.filterCount}</span>}
        </button>}
        <button className={`btn btn--ghost btn--sm filters-btn${p.sortLabel ? " is-on" : ""}`} onClick={p.onSort} aria-haspopup="menu"
          title="Sort the files shown: name, folder, size, saving, viewBox, nodes, last updated or preset, and group by flag">
          <IconSort /> {p.sortLabel ? `Sort: ${p.sortLabel}` : "Sort"}
        </button>
        <div className="toolbar__spacer" />
        {p.viewControls}
      </div>
      {p.filtersOpen && p.filterBar}
      {p.cssBar}

      {items.length === 0 && p.total > 0 && (p.query.trim() || p.filterCount > 0) && (
        <p className="list-empty text-3">No files match{p.query.trim() ? ` “${p.query.trim()}”` : " the filters"}.{" "}
          {p.query.trim() && <button className="link" onClick={() => p.onQuery("")}>Clear search</button>}{" "}
          {p.filterCount > 0 && <button className="link" onClick={p.onClearFilters}>Clear filters</button>}</p>
      )}
      <ul ref={listRef} className={`file-list${!settings.showDetails ? " file-list--gallery" : settings.thumbPx <= 40 ? " file-list--tiny" : ""}${p.alignmentGuides === false ? " no-align" : ""}`}>
        {items.map((item) => (
          <FileRow
            key={item.id}
            item={item}
            selected={selection.has(item.id)}
            focused={p.focusId === item.id}
            onRowClick={p.onRowClick}
            onOpenMarkup={p.onOpenMarkup}
            canOpen={p.canOpen}
            onExportName={p.onExportName}
            stale={p.isStale(item)}
            thumbPx={settings.showDetails ? settings.thumbPx : settings.galleryPx}
            compare
            details={settings.showDetails}
            tags={settings.showDetails ? p.tagsFor(item) : NO_TAGS}
            exportName={p.exportNames?.get(item.id)}
            onContextMenu={p.onContextMenu}
            backdrop={settings.backdrop}
            presets={settings.presets}
            defaultPreset={p.defaultPreset}
            onToggle={p.onToggle}
            onFlag={p.onFlag}
            guides={p.guidesFor?.(item) ?? null}
            frame={p.frameFor?.(item) ?? null}
            checker={p.checkerFor?.(item) ?? null}
            onEdit={p.onEdit}
            onQuickEdit={p.onQuickEdit}
          />
        ))}
      </ul>
    </section>
  )
}
