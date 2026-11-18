import type { MouseEvent } from "react"
import { IconDownload, IconGear, IconInfo, Logo } from "../icons"
import { DOWNLOAD_URL, isDesktop, startWindowDrag } from "../lib/platform"

export function AppBar({ onSettings, onAbout }: { onSettings: () => void, onAbout: () => void }) {
  const drag = (e: MouseEvent) => {
    if (e.button === 0 && e.target === e.currentTarget) startWindowDrag()
  }
  return (
    <header className="appbar" data-tauri-drag-region onMouseDown={drag}>
      <span className="appbar__title" data-tauri-drag-region>
        <Logo width={18} height={18} /> SVGenius
      </span>
      {!isDesktop && (
        <a className="appbar__get" href={DOWNLOAD_URL} target="_blank" rel="noopener"
          title="The desktop app works on folders in place and has no file limit">
          <IconDownload width={12} height={12} /> Get the desktop app
        </a>
      )}
      <button className="btn btn--icon appbar__about" title="About SVGenius" aria-label="About" onClick={onAbout}><IconInfo /></button>
      <button className="btn btn--icon appbar__settings" title="Settings (⌘,)" aria-label="Settings" onClick={onSettings}><IconGear /></button>
    </header>
  )
}
