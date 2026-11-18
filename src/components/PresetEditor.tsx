import type { CustomPlugin, SvgoSettings } from "../lib/types"
import { AttrRuleList } from "./AttrRuleList"
import { CustomPluginList } from "./CustomPluginList"
import { CutMatcherList } from "./CutMatcherList"
import { EditContents, EditViewBox } from "./EditSections"
import { PluginList } from "./PluginList"
import { ReplaceList } from "./ReplaceList"
import { Toggle } from "./Toggle"

// ── Every setting a preset holds ──────────────────────────────────────────────
// Used for presets in the sidebar and for a single file's own settings.

interface Props {
  settings: SvgoSettings
  edit: (fn: (s: SvgoSettings) => SvgoSettings) => void
  customPlugins: CustomPlugin[]
  onLoadPlugin: () => void
  onRemovePlugin: (p: CustomPlugin) => void
}

export function PresetEditor({ settings: s, edit, customPlugins, onLoadPlugin, onRemovePlugin }: Props) {
  const trim = (patch: Partial<SvgoSettings["trim"]>) => edit((x) => ({ ...x, trim: { ...x.trim, ...patch } }))
  return (
    <>
      <section className="panel__section">
        <div className="panel__label">Output</div>
        <Toggle label="Multipass" hint="Run the plugins repeatedly until nothing more is saved"
          checked={s.multipass} onChange={(v) => edit((x) => ({ ...x, multipass: v }))} />
        <Toggle label="Pretty print" hint="Indent the markup. Bigger files, easier to read"
          checked={s.pretty} onChange={(v) => edit((x) => ({ ...x, pretty: v }))} />
        <label className="range" title="Decimal places kept in numbers, paths and transforms">
          <span className="range__label">Precision</span>
          <input type="range" min={0} max={8} step={1} value={s.floatPrecision}
            onChange={(e) => edit((x) => ({ ...x, floatPrecision: Number(e.target.value) }))} />
          <span className="range__value">{s.floatPrecision}</span>
        </label>
      </section>

      <section className="panel__section">
        <EditViewBox trim={s.trim} onChange={trim} />
      </section>

      <section className="panel__section">
        <EditContents trim={s.trim} onChange={trim}
          markup={s.appendMarkup} onMarkup={(appendMarkup) => edit((x) => ({ ...x, appendMarkup }))} />
      </section>

      <section className="panel__section">
        <ReplaceList rules={s.replacements} onChange={(replacements) => edit((x) => ({ ...x, replacements }))} />
      </section>

      <section className="panel__section">
        <AttrRuleList rules={s.attrRules} onChange={(attrRules) => edit((x) => ({ ...x, attrRules }))} />
      </section>

      <section className="panel__section">
        <PluginList
          settings={s}
          onToggle={(name, on) => edit((x) => ({ ...x, plugins: { ...x.plugins, [name]: on } }))}
          onSetGroup={(names, on) => edit((x) => ({
            ...x,
            plugins: { ...x.plugins, ...Object.fromEntries(names.map((n) => [n, on])) }
          }))}
        />
      </section>

      <section className="panel__section">
        <div className="panel__label">Beta <span className="pill pill--beta">Experimental</span></div>
        <p className="panel__hint text-3">Geometry changes made after SVGO. Check the results before exporting.</p>
        <Toggle label="Flatten transforms"
          hint="Bakes transform, rotate and matrix attributes into the path data, so no transforms are left. Text, images, masks, filters, gradients and stretched strokes keep theirs"
          checked={s.flattenTransforms} onChange={(v) => edit((x) => ({ ...x, flattenTransforms: v }))} />
        <Toggle label="Strokes become cut-outs"
          hint="Removes strokes and cuts the area they covered out of the shapes painted beneath, so fake clipping becomes real holes. Strokes that don't cover anything stay. Dashed strokes are left alone"
          checked={s.cutOutStrokes} onChange={(v) => edit((x) => ({ ...x, cutOutStrokes: v }))} />
        <CutMatcherList matchers={s.cutOutShapes} onChange={(cutOutShapes) => edit((x) => ({ ...x, cutOutShapes }))} />
        <Toggle label="Merge overlapping paths"
          hint="Joins shapes that share a fill and opacity into one path (a boolean union), so see-through overlaps don't show and files get smaller. Shapes with strokes, IDs, masks or filters are left alone"
          checked={s.mergePaths} onChange={(v) => edit((x) => ({ ...x, mergePaths: v }))} />
      </section>

      <section className="panel__section">
        <CustomPluginList
          plugins={customPlugins}
          settings={s}
          onLoad={onLoadPlugin}
          onRemove={onRemovePlugin}
          onChange={(id, patch) => edit((x) => ({
            ...x,
            custom: { ...x.custom, [id]: { on: x.custom[id]?.on ?? false, params: x.custom[id]?.params ?? "", ...patch } }
          }))}
        />
      </section>
    </>
  )
}
