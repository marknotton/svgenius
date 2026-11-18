import { createContext, useContext } from "react"
import type { CssWarning } from "../lib/cssCheck"

// ── Preview-only CSS ──────────────────────────────────────────────────────────
// Injected into each SVG as a <style> just before </svg>, so it wins over the
// file's own styles and `:root` targets the SVG itself. Never exported.

export const PreviewCssContext = createContext("")
export const usePreviewCss = () => useContext(PreviewCssContext)

/**
 * Every declaration becomes !important. Optimised files often carry their
 * styles inline (style="fill:…"), which would otherwise beat preview CSS, so
 * the After preview would ignore it while the Before one didn't.
 */
export function importantCss(css: string) {
  return css.replace(/\{([^{}]*)\}/g, (_, body: string) => `{${body.split(";").map((d) => {
    const t = d.trim()
    if (!t || !t.includes(":") || /!important\s*$/i.test(t)) return d
    return `${d.replace(/\s+$/, "")} !important`
  }).join(";")}}`)
}

export function withPreviewCss(svg: string, css: string) {
  if (!css.trim()) return svg
  const end = svg.lastIndexOf("</svg>")
  if (end < 0) return svg
  const safe = importantCss(css).replace(/]]>/g, "]] >")
  return `${svg.slice(0, end)}<style><![CDATA[\n${safe}\n]]></style>${svg.slice(end)}`
}

interface BarProps {
  css: string
  enabled: boolean
  onCss: (css: string) => void
  onEnabled: (on: boolean) => void
  warnings?: CssWarning[]
}

export function PreviewCssBar({ css, enabled, onCss, onEnabled, warnings = [] }: BarProps) {
  return (
    <div className="css-bar">
      <div className="css-bar__head">
        <label className="footer__check">
          <input type="checkbox" className="checkbox" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} />
          Apply preview CSS
        </label>
        <span className="text-3">Only affects previews, never exported files</span>
      </div>
      <textarea
        className="input input--mono css-bar__input"
        spellCheck={false}
        placeholder={":root { --symbol-colour: red; }\npath { stroke: currentColor; }"}
        value={css}
        onChange={(e) => onCss(e.target.value)}
      />
      {warnings.length > 0 && (
        <ul className="css-bar__warnings">
          {warnings.map((w) => (
            <li key={w.selector}>
              <code>{w.selector}</code> matches the original but nothing after optimising{w.files > 1 ? ` (${w.files} files)` : ""}. {w.hint}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
