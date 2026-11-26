import { createContext, useContext, type MouseEvent } from "react"
import type { DiffSection } from "@marknotton/svgenius-core/settingsDiff"
import { IconUndo } from "../icons"

// ── "3 changes ↺" beside a settings heading ───────────────────────────────────
// Only inside a file's own settings (Customise this file): how many settings in
// the section differ from its preset, and a button to put them back

export interface SettingsDiffValue {
  counts: Record<DiffSection, number>
  revert: (section: DiffSection) => void
}

export const SettingsDiffContext = createContext<SettingsDiffValue | null>(null)

export function DiffBadge({ section }: { section: DiffSection }) {
  const ctx = useContext(SettingsDiffContext)
  const n = ctx?.counts[section] ?? 0
  if (!ctx || n === 0) return null
  return <ChangeCount n={n} onRevert={() => ctx.revert(section)} />
}

/** The pill and its revert button. Clicks never open or close a surrounding <details> */
export function ChangeCount({ n, onRevert, all }: { n: number, onRevert: () => void, all?: boolean }) {
  const label = `${n} ${n === 1 ? "change" : "changes"}`
  const tip = all ? `Revert all ${label}: this file follows its preset again` : `Revert ${label} to the preset`
  const stop = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation() }
  return (
    <span className="diff-badge" title={`${label} from the preset`}>
      <span className="diff-badge__count">{label}</span>
      <button type="button" className="diff-badge__revert" title={tip} aria-label={tip}
        onClick={(e) => { stop(e); onRevert() }}>
        <IconUndo width={11} height={11} />{all && <span>Revert all</span>}
      </button>
    </span>
  )
}
