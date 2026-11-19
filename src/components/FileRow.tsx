import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react"
import { fmtNum, getAttr, parseViewBox, rootTag, svgSize } from "../lib/svgRoot"
import { formatBytes, formatSaving, plural, savingPercent } from "../lib/format"
import type { FileTag } from "../lib/tags"
import { FLAGS } from "../lib/filters"
import { IconFlag, IconFolder, IconPencil } from "../icons"
import { isDesktop, openInDefaultApp, reveal } from "../lib/platform"
import type { Backdrop, Preset, SvgItem } from "../lib/types"
import { Thumb } from "./Thumb"
import { TooComplex } from "./TooComplex"
import { isBlocked } from "../lib/complexity"

interface Props {
  item: SvgItem
  selected: boolean
  focused: boolean
  stale: boolean
  thumbPx: number
  compare: boolean
  details: boolean
  tags: FileTag[]
  /** The exported file name, when renaming changes it */
  exportName?: string
  backdrop: Backdrop
  presets: Preset[]
  defaultPreset: Preset
  onToggle: (id: string, e: MouseEvent) => void
  onRowClick: (id: string, e: MouseEvent) => void
  /** Double-click: open the big markup editor */
  onOpenMarkup: (id: string) => void
  /** Double-click works (Advanced), so hovering hints at it */
  canOpen?: boolean
  /** Clicking the "Exports as" name shows it in the File names tab */
  onExportName?: (id: string) => void
  onContextMenu: (id: string, e: MouseEvent) => void
  onFlag: (id: string, e: MouseEvent) => void
}

const NOT_YET = "Not optimised yet. Click Optimise, or turn on Live preview"

export const FileRow = memo(function FileRow(p: Props) {
  const { item, selected, stale, thumbPx, backdrop } = p
  const blocked = isBlocked(item)
  const dir = item.relPath.includes("/") ? item.relPath.slice(0, item.relPath.lastIndexOf("/")) : ""
  const shown = item.result?.output ?? item.source
  const size = useMemo(() => svgSize(shown), [shown])
  const original = useMemo(() => svgSize(item.source), [item.source])
  const vb = useMemo(() => {
    const tag = shown ? rootTag(shown) : null
    return tag ? parseViewBox(getAttr(tag, "viewBox")) : null
  }, [shown])
  const vbDiffers = vb && size && (Math.abs(vb.w - size.w) > 0.005 || Math.abs(vb.h - size.h) > 0.005)
  const dims = size ? `${fmtNum(size.w, 2)} × ${fmtNum(size.h, 2)}` : ""
  const resized = size && original && (Math.abs(size.w - original.w) > 0.005 || Math.abs(size.h - original.h) > 0.005)

  // Flash the dimensions when they change, so size edits are easy to spot
  const [flash, setFlash] = useState(0)
  const lastDims = useRef(dims)
  useEffect(() => {
    if (lastDims.current && dims && lastDims.current !== dims) setFlash((n) => n + 1)
    lastDims.current = dims
  }, [dims])

  // Gallery: big before/after previews, just the name and sizes
  if (!p.details) {
    return (
      <li
        className={`file-card${selected ? " is-selected" : ""}${p.focused ? " is-focused" : ""}`}
        data-id={item.id}
        onClick={(e) => p.onRowClick(item.id, e)}
        onDoubleClick={() => p.onOpenMarkup(item.id)}
        onContextMenu={(e) => p.onContextMenu(item.id, e)}
        aria-selected={selected}
      >
        <div className="file-card__head">
          <Check item={item} selected={selected} onToggle={p.onToggle} />
          <FlagButton item={item} onFlag={p.onFlag} />
          <span className="file-card__name" title={item.path}><Name item={item} to={p.exportName} onShow={p.onExportName} /></span>
          {p.canOpen && <span className="row-hint text-3">Double-click to edit</span>}
          <Stats item={item} stale={stale} />
          <FileButtons item={item} />
        </div>
        <div className="file-card__panes">
          {blocked ? <TooComplex item={item} size={thumbPx} /> : <>
          <figure className="file-card__pane">
            <Thumb svg={item.source} size={thumbPx} backdrop={backdrop} label={`${item.name} before`} />
            <figcaption className="text-3">Before{original && ` · ${fmtNum(original.w, 2)} × ${fmtNum(original.h, 2)}`}</figcaption>
          </figure>
          <figure className="file-card__pane">
            <Thumb svg={item.result?.output} pending={item.status === "running"} placeholder={item.status === "error" ? undefined : NOT_YET} size={thumbPx} backdrop={backdrop} label={`${item.name} after`} />
            <figcaption className="text-3">
              After{size && item.result && <> · <span key={flash} className={`file-row__dims${flash ? " is-flash" : ""}`}>{dims}</span></>}
            </figcaption>
          </figure>
          </>}
        </div>
      </li>
    )
  }

  return (
    <li
      className={`file-row${selected ? " is-selected" : ""}${p.focused ? " is-focused" : ""}`}
      style={{ "--thumb": `${p.compare ? thumbPx * 2 + 4 : thumbPx}px` } as CSSProperties}
      data-id={item.id}
      onClick={(e) => p.onRowClick(item.id, e)}
      onDoubleClick={() => p.onOpenMarkup(item.id)}
      onContextMenu={(e) => p.onContextMenu(item.id, e)}
      aria-selected={selected}
    >
      <span className="file-row__marks">
        <Check item={item} selected={selected} onToggle={p.onToggle} />
        <FlagButton item={item} onFlag={p.onFlag} />
      </span>
      {blocked ? (
        <TooComplex item={item} size={p.compare ? thumbPx * 2 + 4 : thumbPx} />
      ) : p.compare ? (
        <div className="file-row__compare">
          <Thumb svg={item.source} size={thumbPx} backdrop={backdrop} label={`${item.name} before`} />
          <Thumb svg={item.result?.output} pending={item.status === "running"} placeholder={item.status === "error" ? undefined : NOT_YET} size={thumbPx} backdrop={backdrop} label={`${item.name} after`} />
        </div>
      ) : (
        <Thumb svg={item.result?.output ?? item.source} pending={item.status === "running"} size={thumbPx} backdrop={backdrop} label={item.name} />
      )}
      <div className="file-row__main">
        <div className="file-row__top">
          <div className="file-row__name" title={item.path}><Name item={item} to={p.exportName} onShow={p.onExportName} /></div>
          {p.canOpen && <span className="row-hint text-3">Double-click to edit</span>}
          <Stats item={item} stale={stale} compact />
          <FileButtons item={item} />
        </div>
        <dl className="facts">
          <Fact label="Size">
            {item.result
              ? <><span className="strike text-3">{formatBytes(item.size)}</span> {formatBytes(item.result.size)}</>
              : formatBytes(item.size)}
          </Fact>
          <Fact label="Dimensions">
            <span key={flash} className={`file-row__dims${flash ? " is-flash" : ""}`}>
              {resized && original && <><span className="strike text-3">{fmtNum(original.w, 2)} × {fmtNum(original.h, 2)}</span> </>}
              {dims || "–"}
            </span>
          </Fact>
          {vbDiffers && <Fact label="viewBox">{fmtNum(vb.w, 2)} × {fmtNum(vb.h, 2)}</Fact>}
          <Fact label="Settings">{item.config ? "Own settings" : (p.presets.find((x) => x.id === item.presetId) ?? p.defaultPreset).name}</Fact>
          {dir && <Fact label="Folder" wide>{dir}</Fact>}
        </dl>
        {p.tags.length > 0 && (
          <div className="tags">
            {p.tags.map((t) => <span key={t.label} className={`tag${t.tone ? ` tag--${t.tone}` : ""}`} title={t.title}>{t.label}</span>)}
          </div>
        )}
      </div>
    </li>
  )
})

function Fact({ label, children, wide }: { label: string, children: ReactNode, wide?: boolean }) {
  return (
    <div className={`facts__item${wide ? " facts__item--wide" : ""}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Stats({ item, stale, compact }: { item: SvgItem, stale: boolean, compact?: boolean }) {
  if (item.status === "loading") return <div className="file-row__stats"><span className="spinner" /></div>
  if (item.status === "error") return <div className="file-row__stats"><span className="pill pill--error" title={item.error}>Error</span></div>
  if (item.status === "running") {
    return <div className="file-row__stats">{!compact && <span className="text-2">{formatBytes(item.size)}</span>}<span className="spinner" /></div>
  }
  if (!item.result) {
    return <div className="file-row__stats">{compact ? <span className="text-3">Not optimised</span> : <span className="text-2">{formatBytes(item.size)}</span>}</div>
  }
  const pct = savingPercent(item.size, item.result.size)
  return (
    <div className={`file-row__stats${stale ? " is-stale" : ""}`} title={stale ? "Settings have changed since this ran" : undefined}>
      {item.result.replaced > 0 && <span className="pill" title="Find & replace and attribute rule changes">{plural(item.result.replaced, "change")}</span>}
      {!compact && <span className="text-3 strike">{formatBytes(item.size)}</span>}
      {!compact && <span>{formatBytes(item.result.size)}</span>}
      <span className={`pill ${pct > 0 ? "pill--success" : "pill--warning"}`}>{formatSaving(item.size, item.result.size)}</span>
    </div>
  )
}

function Name({ item, to, onShow }: { item: SvgItem, to?: string, onShow?: (id: string) => void }) {
  if (!to || to === item.name) return <>{item.name}</>
  return (
    <span className="file-name">
      <span className="file-name__from">{item.name}</span>
      <button type="button" className="file-name__to" title="The name this file will be exported with. Click to see it in File names"
        onClick={(e) => { e.stopPropagation(); onShow?.(item.id) }} onDoubleClick={(e) => e.stopPropagation()}>
        <span className="file-name__label">Exports as</span> {to}
      </button>
    </span>
  )
}

/** The checkbox, with a bigger hit area. The only thing that changes the selection */
function Check({ item, selected, onToggle }: { item: SvgItem, selected: boolean, onToggle: (id: string, e: MouseEvent) => void }) {
  return (
    <span className="check-hit" title={selected ? "Deselect" : "Select"}
      onClick={(e) => { e.stopPropagation(); onToggle(item.id, e) }}>
      <input type="checkbox" className="checkbox" checked={selected} aria-label={`Select ${item.name}`} onChange={() => {}} />
    </span>
  )
}

/** Reveal in Finder, and open the original in the user's SVG app (desktop only: the browser has no path) */
function FileButtons({ item }: { item: SvgItem }) {
  if (!isDesktop) return null
  return (
    <span className="file-btns">
      <button type="button" className="btn btn--icon file-open" title="Show the original file in Finder"
        aria-label={`Show ${item.name} in Finder`}
        onClick={(e) => { e.stopPropagation(); reveal(item.path) }}>
        <IconFolder />
      </button>
      <button type="button" className="btn btn--icon file-open" title="Open the original file in your default SVG app"
        aria-label={`Open ${item.name} in your default app`}
        onClick={(e) => { e.stopPropagation(); openInDefaultApp(item.path) }}>
        <IconPencil />
      </button>
    </span>
  )
}

function FlagButton({ item, onFlag }: { item: SvgItem, onFlag: (id: string, e: MouseEvent) => void }) {
  const f = FLAGS.find((x) => x.value === item.flag)
  return (
    <button type="button" className={`flag-btn${f ? " is-set" : ""}`} style={f ? { color: f.colour } : undefined}
      title={f ? `${f.label} flag. Click for the next colour, the last one clears it` : "Flag this file. Click again to change the colour"}
      aria-label={f ? `${f.label} flag on ${item.name}` : `Flag ${item.name}`}
      onClick={(e) => { e.stopPropagation(); onFlag(item.id, e) }}>
      <IconFlag filled={!!f} />
    </button>
  )
}
