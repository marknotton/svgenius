import { useMemo, useState } from "react"
import { IconCopy, IconReset } from "../icons"
import { formatBytes, formatSaving, plural, savingPercent } from "../lib/format"
import { PREVIEW_PX } from "../lib/settings"
import type { FileTag } from "../lib/tags"
import { fmtNum, getAttr, parseViewBox, rootTag, svgSize } from "../lib/svgRoot"
import type { Backdrop, CustomPlugin, Preset, SvgItem, SvgoSettings } from "../lib/types"
import { PresetSelect } from "./PresetSelect"
import { Segmented } from "./Segmented"
import { PresetEditor } from "./PresetEditor"
import { SliderField } from "./SliderField"
import { Thumb } from "./Thumb"

// ── Per-file inspector ────────────────────────────────────────────────────────
// Info, tags, a live markup editor and the file's preset or own settings.

interface Props {
  item: SvgItem
  presets: Preset[]
  defaultPreset: Preset
  backdrop: Backdrop
  previewPx: number
  onPreviewPx: (px: number) => void
  onPreset: (presetId: string | null) => void
  onNewPreset: () => void
  onEdit: (source: string) => void
  onRevert: () => void
  tags: FileTag[]
  /** Name of the preset in use (when the file has no settings of its own) */
  presetName: string
  /** Copy the preset's settings into the file, so they can be changed */
  onCustomise: () => void
  onConfig: (fn: (s: SvgoSettings) => SvgoSettings) => void
  onSaveAsPreset: () => void
  onUsePreset: () => void
  customPlugins: CustomPlugin[]
  onLoadPlugin: () => void
  onRemovePlugin: (p: CustomPlugin) => void
}

function viewBoxOf(svg?: string) {
  const tag = svg ? rootTag(svg) : null
  return tag ? parseViewBox(getAttr(tag, "viewBox")) : null
}

const dims = (s: { w: number, h: number } | null) => (s ? `${fmtNum(s.w, 2)} × ${fmtNum(s.h, 2)}` : "–")

export function FileInspector({ item, presets, defaultPreset, backdrop, previewPx, ...p }: Props) {
  const [tab, setTab] = useState<"source" | "output">("source")
  const [copied, setCopied] = useState(false)
  const out = item.result?.output
  const before = useMemo(() => ({ size: svgSize(item.source), vb: viewBoxOf(item.source) }), [item.source])
  const after = useMemo(() => ({ size: svgSize(out), vb: viewBoxOf(out) }), [out])
  const edited = item.fileSource !== undefined && item.source !== item.fileSource

  const copy = async () => {
    if (!out) return
    try {
      await navigator.clipboard.writeText(out)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="inspector">
      <div className="panel__head inspector__head">
        <div className="inspector__previews">
          <figure className="pane">
            <Thumb svg={item.source} size={previewPx} backdrop={backdrop} label={`${item.name} before`} />
            <figcaption className="text-2">Before</figcaption>
          </figure>
          <figure className="pane">
            <Thumb svg={out} size={previewPx} backdrop={backdrop} label={`${item.name} after`} />
            <figcaption className="text-2">After{item.status === "running" && <span className="spinner spinner--xs" />}</figcaption>
          </figure>
        </div>
        <SliderField label="Preview" value={previewPx} min={PREVIEW_PX.inspector.min} max={PREVIEW_PX.inspector.max} step={4} suffix="px"
          hint="Size of the before and after previews. Click the number to type any size." accept={(n) => n >= PREVIEW_PX.inspector.min && n <= 2000}
          onChange={(px) => p.onPreviewPx(Math.round(px))} />
      </div>

      <div className="panel__scroll">
        <section className="panel__section">
          <div className="panel__label">File</div>
          <dl className="info">
            <dt>Path</dt><dd className="info__path" title={item.path}>{item.relPath}</dd>
            <dt>Size</dt>
            <dd>
              {formatBytes(item.size)}
              {item.result && <> → {formatBytes(item.result.size)} <span className={`pill ${savingPercent(item.size, item.result.size) > 0 ? "pill--success" : "pill--warning"}`}>{formatSaving(item.size, item.result.size)}</span></>}
            </dd>
            <dt>Width × height</dt><dd>{dims(before.size)}{out && <> → {dims(after.size)}</>}</dd>
            <dt>viewBox</dt><dd>{dims(before.vb)}{out && <> → {dims(after.vb)}</>}</dd>
            {!!item.result?.replaced && <><dt>Rule changes</dt><dd>{plural(item.result.replaced, "change")}</dd></>}
          </dl>
          {p.tags.length > 0 && (
            <div className="tags">
              {p.tags.map((t) => <span key={t.label} className={`tag${t.tone ? ` tag--${t.tone}` : ""}`} title={t.title}>{t.label}</span>)}
            </div>
          )}
        </section>

        <section className="panel__section inspector__code">
          <div className="plugins__head">
            <Segmented label="Markup" value={tab} onChange={setTab}
              options={[{ value: "source", label: "Before (editable)" }, { value: "output", label: "After" }]} />
            {tab === "source" && edited && <button className="link" onClick={p.onRevert} title="Throw away edits and reload the file's markup"><IconReset width={11} height={11} /> Revert</button>}
            {tab === "output" && <button className="link" onClick={copy} disabled={!out}><IconCopy width={11} height={11} /> {copied ? "Copied" : "Copy"}</button>}
          </div>
          {tab === "source" ? (
            <>
              <textarea className="input input--mono code" spellCheck={false} value={item.source ?? ""}
                aria-label="Source markup" onChange={(e) => p.onEdit(e.target.value)} />
              <p className="text-3 inspector__hint">
                {edited ? "Edited here only. Your original file isn't touched, exports use this version." : "The file as it is on disk, before any settings. Edit it to see changes live, the original isn't touched."}
              </p>
            </>
          ) : (
            <textarea className="input input--mono code" readOnly value={out ?? ""} aria-label="Optimised markup" />
          )}
          {item.status === "error" && <p className="rule__error">{item.error}</p>}
        </section>

        <section className="panel__section">
          <div className="panel__label">Settings for this file</div>
          {item.config ? (
            <>
              <p className="text-3 inspector__hint">This file has its own copy of every setting. Changes here only affect it.</p>
              <div className="inspector__own">
                <button className="btn btn--secondary btn--sm" onClick={p.onSaveAsPreset} title="Turn these settings into a preset you can use on other files">Save as preset…</button>
                <button className="btn btn--ghost btn--sm" onClick={p.onUsePreset} title="Drop this file's own settings">Use a preset again</button>
              </div>
            </>
          ) : (
            <>
              <label className="field-row">
                <span>Preset</span>
                <PresetSelect label={`Preset for ${item.name}`} presets={presets} defaultPreset={defaultPreset}
                  value={item.presetId} onChange={p.onPreset} onCreateNew={p.onNewPreset} newLabel="New preset for this file…" />
              </label>
              <button className="btn btn--secondary btn--sm inspector__customise" onClick={p.onCustomise}
                title={`Starts as a copy of “${p.presetName}”`}>Customise this file…</button>
              <p className="text-3 inspector__hint">Gives this file every preset setting to change on its own, starting from “{p.presetName}”.</p>
            </>
          )}
        </section>
        {item.config && (
          <PresetEditor settings={item.config} edit={p.onConfig} customPlugins={p.customPlugins}
            onLoadPlugin={p.onLoadPlugin} onRemovePlugin={p.onRemovePlugin} />
        )}
      </div>
    </div>
  )
}
