import { createContext, useContext } from "react"
import { IconChecker, IconInkDrop, IconMoon, IconSun } from "../icons"
import type { Backdrop } from "@svgenius/core/types"

// ── Preview background ────────────────────────────────────────────────────────
// One setting for every preview, in the list and the editor: light or dark,
// an optional colour of your own, and the checkerboard on or off. The
// checkerboard works on top of any of them: with a colour picked, its squares
// are a shade of that colour.

export interface CanvasBg { tone: Backdrop, checker: boolean, colour: string | null }

export const CanvasBgContext = createContext<{ value: CanvasBg, set: (bg: CanvasBg) => void }>({
  value: { tone: "light", checker: true, colour: null }, set: () => {}
})
export const useCanvasBg = () => useContext(CanvasBgContext)

/** The colour previews sit on: your own, or plain light or dark with the checkerboard off. Null means the usual checkerboard */
export const solidOf = (bg: CanvasBg) => bg.colour ?? (bg.checker ? null : bg.tone === "dark" ? "#1c1c22" : "#ffffff")

/** Sun, moon, ink drop, checkerboard */
export function CanvasBackground() {
  const { value, set } = useCanvasBg()
  const swatch = value.colour ?? (value.tone === "dark" ? "#1c1c22" : "#ffffff")
  return (
    <div className="canvas-bg btn-join" role="group" aria-label="Preview background">
      <button type="button" className={`btn btn--secondary btn--sm${value.tone === "light" && !value.colour ? " is-on" : ""}`} aria-pressed={value.tone === "light"}
        title="Light background" aria-label="Light background" onClick={() => set({ ...value, tone: "light", colour: null })}><IconSun /></button>
      <button type="button" className={`btn btn--secondary btn--sm${value.tone === "dark" && !value.colour ? " is-on" : ""}`} aria-pressed={value.tone === "dark"}
        title="Dark background" aria-label="Dark background" onClick={() => set({ ...value, tone: "dark", colour: null })}><IconMoon /></button>
      {/* The native picker, which also takes a hex value */}
      <label className={`btn btn--secondary btn--sm canvas-bg__ink${value.colour ? " is-on" : ""}`} title="Background colour: pick one or type a hex value. The checkerboard still works on top">
        <IconInkDrop />
        <span className="canvas-bg__swatch" style={{ background: swatch }} />
        <input type="color" aria-label="Background colour" value={swatch}
          onChange={(e) => set({ ...value, colour: e.target.value })} />
      </label>
      <button type="button" className={`btn btn--secondary btn--sm${value.checker ? " is-on" : ""}`} aria-pressed={value.checker}
        title={value.checker ? "Checkerboard on: shows where the artwork is transparent. Click to turn it off" : "Checkerboard off. Click to show where the artwork is transparent"}
        aria-label="Checkerboard" onClick={() => set({ ...value, checker: !value.checker })}><IconChecker /></button>
    </div>
  )
}
