import type { MouseEvent } from "react"
import { IconDownload, IconGear, IconInfo, Logo } from "../icons"
import { DOWNLOAD_URL, isDesktop, startWindowDrag } from "../lib/platform"

interface Props {
  onSettings: () => void
  onAbout: () => void
  advanced: boolean
  onAdvanced: (on: boolean) => void
}

export function AppBar({ onSettings, onAbout, advanced, onAdvanced }: Props) {
  const drag = (e: MouseEvent) => {
    if (e.button === 0 && e.target === e.currentTarget) startWindowDrag()
  }
  return (
    <header className="appbar" data-tauri-drag-region onMouseDown={drag}>
      <span className="appbar__title" data-tauri-drag-region>
        <Logo width={18} height={18} /> SVGenius
      </span>
      <div className="appbar__right">
        <label className="appbar__advanced" title="Show every option: viewBox and contents editing, rules, all SVGO plugins, filters, import and export, and Beta tools">
          <span>Advanced</span>
          <input type="checkbox" className="toggle__input" checked={advanced} onChange={(e) => onAdvanced(e.target.checked)} />
          <span className="toggle__track" aria-hidden="true"><span className="toggle__thumb" /></span>
        </label>
      {!isDesktop && (
        <a className="appbar__link" href={DOWNLOAD_URL} target="_blank" rel="noopener"
          title="The desktop app reads and writes folders in place">
          <IconDownload width={12} height={12} /> Get the desktop app
        </a>
      )}
      <button className="btn btn--icon" title="About SVGenius" aria-label="About" onClick={onAbout}><IconInfo /></button>
      <button className="btn btn--icon" title="Settings (⌘,)" aria-label="Settings" onClick={onSettings}><IconGear /></button>
      </div>
    </header>
  )
}
