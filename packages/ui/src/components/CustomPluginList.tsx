import { useState } from "react"
import { IconPlus, IconTrash } from "../icons"
import type { CustomPlugin, SvgoSettings } from "@svgenius/core/types"
import { Toggle } from "./Toggle"

// ── Third-party plugins ───────────────────────────────────────────────────────

interface Props {
  plugins: CustomPlugin[]
  settings: SvgoSettings
  onChange: (id: string, patch: Partial<{ on: boolean, params: string }>) => void
  onLoad: () => void
  onRemove: (plugin: CustomPlugin) => void
}

const jsonError = (s: string) => {
  if (!s.trim()) return null
  try { JSON.parse(s); return null } catch { return "Not valid JSON" }
}

export function CustomPluginList({ plugins, settings, onChange, onLoad, onRemove }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggleOpen = (id: string) => setOpen((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const onCount = plugins.filter((p) => settings.custom[p.id]?.on).length

  return (
    <div className="plugins__group">
      <div className="plugins__head">
        <span className="panel__label">Custom {plugins.length > 0 && <span className="text-3">{onCount}/{plugins.length}</span>}</span>
        <button className="link" onClick={onLoad} title="Load a single-file SVGO plugin (.js or .mjs)">
          <IconPlus width={11} height={11} /> Load plugin
        </button>
      </div>
      {plugins.length === 0 && (
        <p className="rules__empty text-3">Load a third-party SVGO plugin file. It runs after the built-in plugins.</p>
      )}
      {plugins.map((p) => {
        const cfg = settings.custom[p.id] ?? { on: false, params: "" }
        const err = jsonError(cfg.params)
        const expanded = open.has(p.id) || !!err
        return (
          <div key={p.id} className="custom-plugin">
            <div className="rule__row">
              <div className="custom-plugin__toggle">
                <Toggle label={p.name} hint={`${p.fileName}${p.description ? `: ${p.description}` : ""}`}
                  checked={cfg.on} onChange={(on) => onChange(p.id, { on })} />
              </div>
              <button type="button" className={`flag${expanded || cfg.params.trim() ? " is-on" : ""}`}
                title="Params (JSON)" aria-pressed={expanded} onClick={() => toggleOpen(p.id)}>{"{}"}</button>
              <button className="btn btn--icon" title="Remove plugin" aria-label={`Remove ${p.name}`} onClick={() => onRemove(p)}><IconTrash /></button>
            </div>
            {expanded && (
              <>
                <textarea className="input input--mono custom-plugin__params" spellCheck={false}
                  placeholder={'{ "option": true }'} value={cfg.params}
                  onChange={(e) => onChange(p.id, { params: e.target.value })} />
                {err && <p className="rule__error">{err}</p>}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
