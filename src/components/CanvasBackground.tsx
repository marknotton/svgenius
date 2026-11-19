import { createContext, useContext } from "react"
import { IconChecker, IconInkDrop, IconMoon, IconSun } from "../icons"
import type { Backdrop } from "../lib/types"

// ── Preview background ────────────────────────────────────────────────────────
// One setting for every preview, in the list and the editor: light or dark,
// the checkerboard on or off, and an optional solid colour. With the
// checkerboard off, previews sit on that colour (or plain light or dark).

export interface CanvasBg { tone: Backdrop, checker: boolean, colour: string | null }

export const CanvasBgContext = createContext<{ value: CanvasBg, set: (bg: CanvasBg) => void }>({
  value: { tone: "light", checker: true, colour: null }, set: () => {}
})
export const useCanvasBg = () => useContext(CanvasBgContext)

/** What previews paint behind the artwork when the checkerboard is off */
export const solidOf = (bg: CanvasBg) => (bg.checker ? null : bg.colour ?? (bg.tone === "dark" ? "#1c1c22" : "#ffffff"))

/** Sun, moon, checkerboard, ink drop */
export function CanvasBackground() {
  const { value, set } = useCanvasBg()
  const swatch = value.colour ?? (value.tone === "dark" ? "#1c1c22" : "#ffffff")
  return (
    <div className="canvas-bg btn-join" role="group" aria-label="Preview background">
      <button type="button" className={`btn btn--secondary btn--sm${value.tone === "light" && !value.colour ? " is-on" : ""}`} aria-pressed={value.tone === "light"}
        title="Light background" aria-label="Light background" onClick={() => set({ ...value, tone: "light", colour: null })}><IconSun /></button>
      <button type="button" className={`btn btn--secondary btn--sm${value.tone === "dark" && !value.colour ? " is-on" : ""}`} aria-pressed={value.tone === "dark"}
        title="Dark background" aria-label="Dark background" onClick={() => set({ ...value, tone: "dark", colour: null })}><IconMoon /></button>
      <button type="button" className={`btn btn--secondary btn--sm${value.checker ? " is-on" : ""}`} aria-pressed={value.checker}
        title={value.checker ? "Checkerboard on: shows where the artwork is transparent. Click to turn it off" : "Checkerboard off. Click to show where the artwork is transparent"}
        aria-label="Checkerboard" onClick={() => set({ ...value, checker: !value.checker })}><IconChecker /></button>
      {/* The native picker, which also takes a hex value. Picking a colour turns the checkerboard off so you can see it */}
      <label className={`btn btn--secondary btn--sm canvas-bg__ink${value.colour ? " is-on" : ""}`} title="Solid background colour: pick one or type a hex value">
        <IconInkDrop />
        <span className="canvas-bg__swatch" style={{ background: swatch }} />
        <input type="color" aria-label="Solid background colour" value={swatch}
          onChange={(e) => set({ ...value, colour: e.target.value, checker: false })} />
      </label>
    </div>
  )
}
