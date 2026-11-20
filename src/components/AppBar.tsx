import type { MouseEvent } from "react"
import { IconDownload, IconGear, Logo } from "../icons"
import { isDesktop, startWindowDrag } from "../lib/platform"
import { useDesktopDownload } from "../lib/download"

// ── Title strip (desktop only) ────────────────────────────────────────────────
// The Mac window draws its traffic lights over the top of the page, so the
// desktop app keeps a slim, empty strip for them and for dragging the window.
// Everything that used to live up here is in the footer's brand bar.

export function AppBar() {
  if (!isDesktop) return null
  const drag = (e: MouseEvent) => {
    if (e.button === 0 && e.target === e.currentTarget) startWindowDrag()
  }
  return <header className="appbar" data-tauri-drag-region onMouseDown={drag} />
}

// ── Brand bar (footer, bottom left) ───────────────────────────────────────────

interface Props {
  onSettings: () => void
  onAbout: () => void
}

export function BrandBar({ onSettings, onAbout }: Props) {
  const downloadUrl = useDesktopDownload()
  return (
    <div className="brand">
      <button className="brand__name" onClick={onAbout} title="About SVGenius: version history and credits">
        <Logo width={18} height={18} /> <span className="brand__label">SVGenius</span>
      </button>
      {!isDesktop && (
        <a className="brand__link" href={downloadUrl} target="_blank" rel="noopener"
          title="Get the desktop app: it reads and writes folders in place">
          <IconDownload width={12} height={12} /> <span className="brand__label">Desktop app</span>
        </a>
      )}
      <button className="btn btn--icon" title="Settings (⌘,)" aria-label="Settings" onClick={onSettings}><IconGear /></button>
    </div>
  )
}

/** Shows every option. Sits at the right-hand end of the sidebar's tabs */
export function AdvancedToggle({ advanced, onAdvanced }: { advanced: boolean, onAdvanced: (on: boolean) => void }) {
  return (
    <label className="advanced-toggle" title="Show every option: viewBox and contents editing, rules, all SVGO plugins, the markup editor, import and export, and Beta tools">
      <span>Advanced</span>
      <input type="checkbox" className="toggle__input" checked={advanced} onChange={(e) => onAdvanced(e.target.checked)} />
      <span className="toggle__track" aria-hidden="true"><span className="toggle__thumb" /></span>
    </label>
  )
}
