import type { CustomPlugin, PrecisionTolerance, SvgoSettings } from "../lib/types"
import { AttrRuleList } from "./AttrRuleList"
import { CustomPluginList } from "./CustomPluginList"
import { CutMatcherList } from "./CutMatcherList"
import { EditContents, EditViewBox } from "./EditSections"
import { PluginList } from "./PluginList"
import { ReplaceList } from "./ReplaceList"
import { Segmented } from "./Segmented"
import { Toggle } from "./Toggle"

// ── Every setting a preset holds ──────────────────────────────────────────────
// Used for presets in the sidebar and for a single file's own settings.

interface Props {
  settings: SvgoSettings
  edit: (fn: (s: SvgoSettings) => SvgoSettings) => void
  customPlugins: CustomPlugin[]
  onLoadPlugin: () => void
  onRemovePlugin: (p: CustomPlugin) => void
  /** Off: just the output options. Everything else still applies, just hidden */
  advanced: boolean
}

export function PresetEditor({ settings: s, edit, customPlugins, onLoadPlugin, onRemovePlugin, advanced }: Props) {
  const trim = (patch: Partial<SvgoSettings["trim"]>) => edit((x) => ({ ...x, trim: { ...x.trim, ...patch } }))
  return (
    <>
      <section className="panel__section" data-nav="output" data-nav-title="Output">
        <div className="panel__label">Output</div>
        <Toggle label="Multipass" hint="Run the plugins repeatedly until nothing more is saved"
          checked={s.multipass} onChange={(v) => edit((x) => ({ ...x, multipass: v }))} />
        <Toggle label="Pretty print" hint="Indent the markup. Bigger files, easier to read"
          checked={s.pretty} onChange={(v) => edit((x) => ({ ...x, pretty: v }))} />
        <Toggle label="Auto precision"
          hint="Finds the fewest decimal places each file can have without looking any different. Every attempt is rendered and compared with the full-precision result, so files that need more keep more"
          checked={s.autoPrecision} onChange={(v) => edit((x) => ({ ...x, autoPrecision: v }))} />
        <label className="range" title={s.autoPrecision ? "The most decimal places a file may keep. Auto precision goes lower wherever it can" : "Decimal places kept in numbers, paths and transforms"}>
          <span className="range__label">{s.autoPrecision ? "Max precision" : "Precision"}</span>
          <input type="range" min={0} max={8} step={1} value={s.floatPrecision}
            onChange={(e) => edit((x) => ({ ...x, floatPrecision: Number(e.target.value) }))} />
          <span className="range__value">{s.floatPrecision}</span>
        </label>
        {s.autoPrecision && (
          <div className="field-row">
            <span className="text-3">Allowed change</span>
            <Segmented<PrecisionTolerance> label="How much the render may change" value={s.autoTolerance}
              onChange={(autoTolerance) => edit((x) => ({ ...x, autoTolerance }))}
              options={[
                { value: "strict", label: "None", title: "No edge moves more than a quarter of a pixel at 512px" },
                { value: "balanced", label: "Tiny", title: "Edges may shift up to about half a pixel at 256px. Invisible at icon sizes" },
                { value: "loose", label: "Small", title: "Smallest files. Edges may shift about half a pixel at 128px, so check big uses" }
              ]} />
          </div>
        )}
      </section>

      {advanced && <>
      <section className="panel__section" data-nav="contents" data-nav-title="Edit contents">
        <EditContents trim={s.trim} onChange={trim}
          markup={s.appendMarkup} onMarkup={(appendMarkup) => edit((x) => ({ ...x, appendMarkup }))} />
      </section>

      <section className="panel__section" data-nav="viewbox" data-nav-title="Edit viewBox">
        <EditViewBox trim={s.trim} onChange={trim} />
      </section>

      <section className="panel__section" data-nav="replace" data-nav-title="Find & replace">
        <ReplaceList rules={s.replacements} onChange={(replacements) => edit((x) => ({ ...x, replacements }))} />
      </section>

      <section className="panel__section" data-nav="attrs" data-nav-title="Attribute rules">
        <AttrRuleList rules={s.attrRules} onChange={(attrRules) => edit((x) => ({ ...x, attrRules }))} />
      </section>

      </>}

      <section className="panel__section" data-nav="plugins" data-nav-title="SVGO plugins">
        <PluginList
          settings={s}
          onToggle={(name, on) => edit((x) => ({ ...x, plugins: { ...x.plugins, [name]: on } }))}
          onSetGroup={(names, on) => edit((x) => ({
            ...x,
            plugins: { ...x.plugins, ...Object.fromEntries(names.map((n) => [n, on])) }
          }))}
        />
      </section>

      {advanced && <>
      <section className="panel__section" data-nav="beta" data-nav-title="Beta">
        <div className="panel__label">Beta <span className="pill pill--beta">Experimental</span></div>
        <p className="panel__hint text-3">Geometry changes made after SVGO. Check the results before exporting.</p>
        <Toggle label="Flatten transforms"
          hint="Removes transform attributes (translate, rotate, scale, matrix) and rewrites the shapes so they sit exactly where the transform put them"
          info={<>
            <p>Finds <code>transform="…"</code> attributes, like <code>translate(10 5)</code> or <code>matrix(…)</code>, and removes them. The shapes they moved are rewritten as paths at their final position.</p>
            <p><strong>Nothing should look different.</strong> The markup is just cleaner and easier to edit, with no hidden offsets.</p>
            <p>Text, images, masks, filters, gradients and strokes that would stretch keep their transforms.</p>
          </>}
          checked={s.flattenTransforms} onChange={(v) => edit((x) => ({ ...x, flattenTransforms: v }))} />
        <Toggle label="Strokes become cut-outs"
          hint="Removes strokes and cuts the area they covered out of the shapes painted beneath, so fake clipping becomes real holes. Strokes that don't cover anything stay. Dashed strokes are left alone"
          checked={s.cutOutStrokes} onChange={(v) => edit((x) => ({ ...x, cutOutStrokes: v }))} />
        <CutMatcherList matchers={s.cutOutShapes} onChange={(cutOutShapes) => edit((x) => ({ ...x, cutOutShapes }))} />
        <Toggle label="Optical centring"
          hint="Centres the artwork by where its weight is, not by its outline, so lopsided icons stop looking too high or too low. Uses the space around the artwork (add trim padding for room) and never pushes it past an edge"
          checked={s.opticalCentre} onChange={(v) => edit((x) => ({ ...x, opticalCentre: v }))} />
        {s.opticalCentre && (
          <label className="range" title="0% is the plain box centre, 100% puts the centre of mass dead centre">
            <span className="range__label">Strength</span>
            <input type="range" min={0} max={100} step={5} value={s.opticalStrength}
              onChange={(e) => edit((x) => ({ ...x, opticalStrength: Number(e.target.value) }))} />
            <span className="range__value">{s.opticalStrength}%</span>
          </label>
        )}
        <Toggle label="Merge overlapping paths"
          hint="Joins shapes that share a fill and opacity into one path (a boolean union), so see-through overlaps don't show and files get smaller. Shapes with strokes, IDs, masks or filters are left alone"
          checked={s.mergePaths} onChange={(v) => edit((x) => ({ ...x, mergePaths: v }))} />
      </section>

      <section className="panel__section" data-nav="custom" data-nav-title="Custom plugins">
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
      </>}
      {!advanced && (
        <p className="panel__simple text-3">Switch on <strong>Advanced</strong> at the top for the viewBox and contents tools, rules, custom plugins and Beta tools.</p>
      )}
    </>
  )
}
