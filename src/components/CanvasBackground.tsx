import { useEffect, useRef, useState } from "react"
import { IconMoon, IconSun } from "../icons"
import { Segmented } from "./Segmented"
import type { Backdrop } from "../lib/types"

// ── Editor canvas background ──────────────────────────────────────────────────
// Light or dark, and from the ▾ panel: checkerboard on or off, or a solid
// colour (picker or hex). Kept per device, separate from the file list's.

export interface CanvasBg { tone: Backdrop, checker: boolean, colour: string | null }

const KEY = "svgenius:editor-bg"
const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

export function useCanvasBg(fallback: Backdrop) {
  const [bg, setBg] = useState<CanvasBg>(() => {
    try { return { tone: fallback, checker: true, colour: null, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") } } catch { return { tone: fallback, checker: true, colour: null } }
  })
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(bg)) } catch { /* unavailable */ } }, [bg])
  return [bg, setBg] as const
}

/** What the canvas paints behind the artwork when the checkerboard is off */
export const solidOf = (bg: CanvasBg) => (bg.checker ? null : bg.colour ?? (bg.tone === "dark" ? "#1c1c22" : "#ffffff"))

export function CanvasBackground({ value, onChange }: { value: CanvasBg, onChange: (bg: CanvasBg) => void }) {
  const [open, setOpen] = useState(false)
  const [hex, setHex] = useState(value.colour ?? "")
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => setHex(value.colour ?? ""), [value.colour])
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false) } }
    window.addEventListener("mousedown", close)
    window.addEventListener("keydown", key, true)
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", key, true) }
  }, [open])
  // Picking a colour means you want to see it, so the checkerboard goes
  const setColour = (colour: string | null) => onChange({ ...value, colour, checker: colour ? false : value.checker })

  return (
    <div ref={ref} className="canvas-bg">
      <Segmented label="Canvas background" value={value.tone} onChange={(tone) => onChange({ ...value, tone, colour: null })}
        options={[
          { value: "light", label: <IconSun />, title: "Light background" },
          { value: "dark", label: <IconMoon />, title: "Dark background" }
        ]} />
      <button type="button" className={`btn btn--secondary btn--sm canvas-bg__more${open ? " is-on" : ""}`} aria-expanded={open}
        title="More background options: checkerboard and solid colour" onClick={() => setOpen((o) => !o)}>
        {value.colour && <span className="canvas-bg__swatch" style={{ background: value.colour }} />}▾
      </button>
      {open && (
        <div className="canvas-bg__panel" role="dialog" aria-label="Canvas background">
          <div className="panel__label">Canvas background</div>
          <label className="toggle">
            <span className="toggle__label">Checkerboard</span>
            <input type="checkbox" className="toggle__input" checked={value.checker} onChange={(e) => onChange({ ...value, checker: e.target.checked })} />
            <span className="toggle__track" aria-hidden="true"><span className="toggle__thumb" /></span>
          </label>
          <div className="canvas-bg__row">
            <span className="text-2">Solid colour</span>
            <input type="color" className="canvas-bg__picker" aria-label="Pick a colour" value={value.colour ?? (value.tone === "dark" ? "#1c1c22" : "#ffffff")}
              onChange={(e) => setColour(e.target.value)} />
            <input className="input input--sm canvas-bg__hex" placeholder="#ffffff" aria-label="Hex colour" value={hex} spellCheck={false}
              onChange={(e) => {
                setHex(e.target.value)
                const m = e.target.value.trim().match(HEX)
                if (m) setColour(`#${m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1]}`.toLowerCase())
              }} />
          </div>
          {value.colour && <button className="link" onClick={() => setColour(null)}>Back to {value.tone}</button>}
          <p className="text-3 canvas-bg__hint">The checkerboard shows through transparent areas. Turn it off to see the artwork on a plain colour.</p>
        </div>
      )}
    </div>
  )
}
