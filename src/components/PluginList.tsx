import { useState } from "react"
import { IconInfo } from "../icons"
import { PLUGINS, type PluginInfo } from "../lib/plugins"
import { isPluginOn } from "../lib/settings"
import type { SvgoSettings } from "../lib/types"
import { Toggle } from "./Toggle"

interface Props {
  settings: SvgoSettings
  onToggle: (name: string, on: boolean) => void
  onSetGroup: (names: string[], on: boolean) => void
}

const GROUPS: Array<{ id: PluginInfo["group"], title: string }> = [
  { id: "default", title: "Standard" },
  { id: "extra", title: "Extras" }
]

export function PluginList({ settings, onToggle, onSetGroup }: Props) {
  const [filter, setFilter] = useState("")
  const [details, setDetails] = useState(true)
  const q = filter.trim().toLowerCase()

  return (
    <div className="plugins">
      <div className="plugins__head">
        <span className="panel__label">SVGO plugins</span>
        <button type="button" className={`flag${details ? " is-on" : ""}`} aria-pressed={details}
          title="Show what each plugin does" onClick={() => setDetails((d) => !d)}><IconInfo /> Details</button>
      </div>
      <input
        className="input input--sm"
        type="search"
        placeholder="Filter plugins"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {GROUPS.map((g) => {
        const all = PLUGINS.filter((p) => p.group === g.id)
        const shown = all.filter((p) => !q || `${p.label} ${p.name} ${p.description}`.toLowerCase().includes(q))
        if (shown.length === 0) return null
        const onCount = all.filter((p) => isPluginOn(settings, p.name)).length
        return (
          <div className="plugins__group" key={g.id}>
            <div className="plugins__head">
              <span className="panel__label">{g.title} <span className="text-3">{onCount}/{all.length}</span></span>
              <button className="link" onClick={() => onSetGroup(all.map((p) => p.name), onCount < all.length)}>
                {onCount < all.length ? "All on" : "All off"}
              </button>
            </div>
            {shown.map((p) => (
              <div key={p.name} className="plugin">
                <Toggle
                  label={p.label}
                  hint={`${p.name}: ${p.description}`}
                  checked={isPluginOn(settings, p.name)}
                  onChange={(on) => onToggle(p.name, on)}
                />
                {details && <p className="plugin__desc text-3">{p.description} <code>{p.name}</code></p>}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
