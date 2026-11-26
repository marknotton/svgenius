import { useEffect, useRef, useState } from "react"
import { IconChevronDown, IconMagnet } from "../icons"
import { Pop } from "./PaintTools"
import { SNAP_DEFAULTS, type SnapOptions } from "./InspectPreview"

// ── Snapping in the editor ────────────────────────────────────────────────────
// The magnet turns snapping on or off. ▾ picks what it snaps to. Holding Shift
// snaps while it's off; ⌘ drags freely while it's on. Kept between sessions.

const OPTS_KEY = "svgenius:snap-options"
const ON_KEY = "svgenius:snap"

export function useSnap() {
  const [on, setOnState] = useState(() => { try { return localStorage.getItem(ON_KEY) !== "0" } catch { return true } })
  const [opts, setOptsState] = useState<SnapOptions>(() => {
    try { return { ...SNAP_DEFAULTS, ...JSON.parse(localStorage.getItem(OPTS_KEY) ?? "{}") } } catch { return SNAP_DEFAULTS }
  })
  const setOn = (v: boolean) => { setOnState(v); try { localStorage.setItem(ON_KEY, v ? "1" : "0") } catch { /* unavailable */ } }
  const setOpts = (v: SnapOptions) => { setOptsState(v); try { localStorage.setItem(OPTS_KEY, JSON.stringify(v)) } catch { /* unavailable */ } }
  return { on, setOn, opts, setOpts }
}

const ROWS: { key: keyof SnapOptions, label: string, hint: string, dp?: boolean }[] = [
  { key: "objects", label: "Other shapes", hint: "Edges and centres of other shapes and the viewBox" },
  { key: "keylines", label: "Keylines", hint: "The design principle's live area and keyline edges", dp: true },
  { key: "grid", label: "Grid", hint: "The design principle's grid lines", dp: true },
  { key: "pixel", label: "Whole pixels", hint: "Whole viewBox units" }
]

export function SnapTools({ snap, side, hasDp }: { snap: ReturnType<typeof useSnap>, side: "top" | "left", hasDp: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false) } }
    window.addEventListener("mousedown", close)
    window.addEventListener("keydown", key, true)
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", key, true) }
  }, [open])
  const what = ROWS.filter((r) => snap.opts[r.key] && (!r.dp || hasDp)).map((r) => r.label.toLowerCase()).join(", ") || "nothing yet"
  return (
    // The popover sits outside the joined buttons, so the toolbar's button sizing and corners leave it alone
    <span ref={ref} className="snap-tools arrange__anchor">
      <span className="btn-join">
        <button className={`btn btn--secondary btn--sm edit-toolbar__btn${snap.on ? " is-on" : ""}`} aria-pressed={snap.on} onClick={() => snap.setOn(!snap.on)}
        title={snap.on ? `Snapping on, to ${what}. Hold ⌘ to drag freely` : `Snapping off. Hold Shift to snap while dragging, or click to turn it on`}
        aria-label="Snapping"><IconMagnet width={14} height={14} /></button>
        <button className={`btn btn--secondary btn--sm edit-toolbar__btn snap-tools__more${open ? " is-on" : ""}`} aria-expanded={open}
        title="What to snap to" aria-label="Snap options" onClick={() => setOpen((o) => !o)}><IconChevronDown width={10} height={10} /></button>
      </span>
      {open && (
        <Pop title="Snap to" side={side}>
          <div className="snap-tools__list">
            {ROWS.map((r) => {
              const off = r.dp && !hasDp
              return (
                <label key={r.key} className={`snap-tools__row${off ? " is-off" : ""}`} title={off ? `${r.hint}. This file's preset has no design principle` : r.hint}>
                  <input type="checkbox" checked={snap.opts[r.key] && !off} disabled={off}
                    onChange={(e) => snap.setOpts({ ...snap.opts, [r.key]: e.target.checked })} />
                  <span>{r.label}</span>
                </label>
              )
            })}
          </div>
          <p className="text-3 snap-tools__note">Works when moving shapes, dragging points and resizing. Hold Shift to snap while snapping is off, ⌘ to drag freely while it's on.</p>
        </Pop>
      )}
    </span>
  )
}
