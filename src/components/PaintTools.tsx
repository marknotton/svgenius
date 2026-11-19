import { useEffect, useRef, useState, type ReactNode } from "react"
import { toHex, type Gradient, type Paint } from "../lib/paint"
import { Segmented } from "./Segmented"

// ── Fill and stroke swatches for the editor toolbar ───────────────────────────
// Two swatches, like a drawing app: click one for its panel. Changes apply to
// everything selected; the panel shows the first selected item's values.

interface Props {
  /** The first selected item's paint, or null when nothing paintable is selected */
  paint: Paint | null
  /** Several items selected with different values */
  mixed: { fill: boolean, stroke: boolean }
  onPaint: (patch: Record<string, string | null>) => void
  onGradient: (g: Gradient) => void
  /** Which way the toolbar runs, so panels open beside it rather than over it */
  side: "top" | "left"
}

type FillMode = "none" | "solid" | "linear" | "radial"

export function PaintTools({ paint, mixed, onPaint, onGradient, side }: Props) {
  const [open, setOpen] = useState<"fill" | "stroke" | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(null) }
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(null) } }
    window.addEventListener("mousedown", close)
    window.addEventListener("keydown", key, true)
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", key, true) }
  }, [open])
  useEffect(() => { if (!paint) setOpen(null) }, [paint])

  const disabled = !paint
  const fill = paint?.fill ?? null
  // No fill attribute means the default, black
  const fillHex = toHex(fill ?? "#000000")
  const strokeHex = toHex(paint?.stroke ?? null)
  const fillMode: FillMode = paint?.gradient ? paint.gradient.type : fill === "none" ? "none" : "solid"
  const strokeOn = !!paint?.stroke && paint.stroke !== "none"

  const swatchBg = (v: string | null, hex: string | null, g: Gradient | null) =>
    g ? (g.type === "linear" ? `linear-gradient(${g.angle + 90}deg, ${g.stops[0]}, ${g.stops[1]})` : `radial-gradient(${g.stops[0]}, ${g.stops[1]})`)
      : v === "none" ? undefined : hex ?? "transparent"

  return (
    <div ref={ref} className={`paint paint--${side}`}>
      <button type="button" className={`paint__swatch paint__swatch--fill${fillMode === "none" ? " is-none" : ""}${open === "fill" ? " is-open" : ""}${mixed.fill ? " is-mixed" : ""}`}
        disabled={disabled} aria-expanded={open === "fill"} aria-label="Fill"
        title={disabled ? "Fill: select something to colour it" : `Fill: ${mixed.fill ? "mixed" : paint?.gradient ? `${paint.gradient.type} gradient` : fill ?? "black (default)"}`}
        onClick={() => setOpen((o) => (o === "fill" ? null : "fill"))}>
        <span style={{ background: swatchBg(fill, fillHex, paint?.gradient ?? null) }} />
      </button>
      <button type="button" className={`paint__swatch paint__swatch--stroke${!strokeOn ? " is-none" : ""}${open === "stroke" ? " is-open" : ""}${mixed.stroke ? " is-mixed" : ""}`}
        disabled={disabled} aria-expanded={open === "stroke"} aria-label="Stroke"
        title={disabled ? "Stroke: select something to outline it" : `Stroke: ${mixed.stroke ? "mixed" : strokeOn ? `${paint?.stroke}, ${paint?.strokeWidth ?? 1} wide` : "none"}`}
        onClick={() => setOpen((o) => (o === "stroke" ? null : "stroke"))}>
        <span style={{ borderColor: strokeOn ? strokeHex ?? "currentColor" : undefined }} />
      </button>

      {open === "fill" && paint && (
        <Pop title="Fill" side={side}>
          <Segmented<FillMode> label="Fill type" value={fillMode}
            onChange={(m) => {
              if (m === "none") onPaint({ fill: "none" })
              else if (m === "solid") onPaint({ fill: fillHex ?? toHex(paint.gradient?.stops[0] ?? null) ?? "#000000" })
              else onGradient({ type: m, stops: paint.gradient?.stops ?? [fillHex ?? "#000000", "#ffffff"], angle: paint.gradient?.angle ?? 90 })
            }}
            options={[
              { value: "none", label: "None" }, { value: "solid", label: "Solid" },
              { value: "linear", label: "Linear", title: "Linear gradient" }, { value: "radial", label: "Radial", title: "Radial gradient" }
            ]} />
          {fillMode === "solid" && <ColourRow label="Colour" value={fillHex} raw={fill} onChange={(v) => onPaint({ fill: v })} />}
          {paint.gradient && (fillMode === "linear" || fillMode === "radial") && (() => {
            const g = paint.gradient
            const set = (patch: Partial<Gradient>) => onGradient({ ...g, ...patch })
            return <>
              <ColourRow label="Start" value={toHex(g.stops[0])} raw={g.stops[0]} onChange={(v) => set({ stops: [v, g.stops[1]] })} />
              <ColourRow label="End" value={toHex(g.stops[1])} raw={g.stops[1]} onChange={(v) => set({ stops: [g.stops[0], v] })} />
              {g.type === "linear" && (
                <label className="paint__row">
                  <span>Angle</span>
                  <input type="range" min={-180} max={180} step={5} value={g.angle} onChange={(e) => set({ angle: Number(e.target.value) })} />
                  <span className="paint__num">{g.angle}°</span>
                </label>
              )}
              <button className="link" onClick={() => set({ stops: [g.stops[1], g.stops[0]] })}>Swap colours</button>
            </>
          })()}
          {fill && /^(currentcolor|var\()/i.test(fill) && <p className="text-3 paint__hint">Uses {fill}, so it follows the page's colour. Pick a colour to replace it.</p>}
        </Pop>
      )}

      {open === "stroke" && paint && (
        <Pop title="Stroke" side={side}>
          <Segmented<"none" | "solid"> label="Stroke" value={strokeOn ? "solid" : "none"}
            onChange={(m) => onPaint(m === "none" ? { stroke: "none" } : { stroke: strokeHex ?? "#000000", "stroke-width": paint.strokeWidth ?? "1" })}
            options={[{ value: "none", label: "None" }, { value: "solid", label: "Solid" }]} />
          {strokeOn && <>
            <ColourRow label="Colour" value={strokeHex} raw={paint.stroke} onChange={(v) => onPaint({ stroke: v })} />
            <label className="paint__row">
              <span>Width</span>
              <input type="range" min={0} max={20} step={0.25} value={Math.min(20, Number(paint.strokeWidth ?? 1) || 0)}
                onChange={(e) => onPaint({ "stroke-width": e.target.value })} />
              <input className="input input--sm paint__num-input" inputMode="decimal" value={paint.strokeWidth ?? "1"} aria-label="Stroke width"
                onChange={(e) => { const v = e.target.value.trim(); if (v === "" || Number.isFinite(Number(v))) onPaint({ "stroke-width": v || null }) }} />
            </label>
            <div className="paint__row">
              <span>Caps</span>
              <Segmented label="Line caps" value={(paint.cap ?? "butt") as string} onChange={(v) => onPaint({ "stroke-linecap": v === "butt" ? null : v })}
                options={[
                  { value: "butt", label: <CapIcon kind="butt" />, title: "Butt: the line stops at its end" },
                  { value: "round", label: <CapIcon kind="round" />, title: "Round ends" },
                  { value: "square", label: <CapIcon kind="square" />, title: "Square: extends past the end by half the width" }
                ]} />
            </div>
            <div className="paint__row">
              <span>Corners</span>
              <Segmented label="Line joins" value={(paint.join ?? "miter") as string} onChange={(v) => onPaint({ "stroke-linejoin": v === "miter" ? null : v })}
                options={[
                  { value: "miter", label: <JoinIcon kind="miter" />, title: "Miter: sharp corners" },
                  { value: "round", label: <JoinIcon kind="round" />, title: "Round corners" },
                  { value: "bevel", label: <JoinIcon kind="bevel" />, title: "Bevel: cut-off corners" }
                ]} />
            </div>
          </>}
        </Pop>
      )}
    </div>
  )
}

function Pop({ title, side, children }: { title: string, side: "top" | "left", children: ReactNode }) {
  return (
    <div className={`paint__pop paint__pop--${side}`} role="dialog" aria-label={title}>
      <div className="panel__label">{title}</div>
      {children}
    </div>
  )
}

/** Colour picker plus a hex box */
function ColourRow({ label, value, raw, onChange }: { label: string, value: string | null, raw: string | null, onChange: (v: string) => void }) {
  const [text, setText] = useState(value ?? raw ?? "")
  useEffect(() => setText(value ?? raw ?? ""), [value, raw])
  return (
    <label className="paint__row">
      <span>{label}</span>
      <input type="color" className="canvas-bg__picker" value={value ?? "#000000"} onChange={(e) => onChange(e.target.value)} aria-label={`${label} colour`} />
      <input className="input input--sm paint__hex" value={text} spellCheck={false} aria-label={`${label} hex`}
        onChange={(e) => {
          setText(e.target.value)
          const m = e.target.value.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
          if (m) onChange(`#${m[1]}`.toLowerCase())
        }} />
    </label>
  )
}

const CapIcon = ({ kind }: { kind: "butt" | "round" | "square" }) => (
  <svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
    <line x1="4" y1="6" x2="14" y2="6" stroke="currentColor" strokeWidth="6" strokeLinecap={kind} opacity=".85" />
    <line x1="4" y1="6" x2="14" y2="6" stroke="var(--bg, #fff)" strokeWidth="1" />
  </svg>
)
const JoinIcon = ({ kind }: { kind: "miter" | "round" | "bevel" }) => (
  <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
    <polyline points="3,12 3,4 13,4" fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin={kind} opacity=".85" />
  </svg>
)
