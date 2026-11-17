import { createContext, useContext } from "react"

// ── Preview-only CSS ──────────────────────────────────────────────────────────
// Injected into each SVG as a <style> just before </svg>, so it wins over the
// file's own styles and `:root` targets the SVG itself. Never exported.

export const PreviewCssContext = createContext("")
export const usePreviewCss = () => useContext(PreviewCssContext)

export function withPreviewCss(svg: string, css: string) {
  if (!css.trim()) return svg
  const end = svg.lastIndexOf("</svg>")
  if (end < 0) return svg
  const safe = css.replace(/]]>/g, "]] >")
  return `${svg.slice(0, end)}<style><![CDATA[\n${safe}\n]]></style>${svg.slice(end)}`
}

interface BarProps {
  css: string
  enabled: boolean
  onCss: (css: string) => void
  onEnabled: (on: boolean) => void
}

export function PreviewCssBar({ css, enabled, onCss, onEnabled }: BarProps) {
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
    </div>
  )
}
