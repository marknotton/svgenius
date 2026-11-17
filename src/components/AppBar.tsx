import type { MouseEvent } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { IconGear, Logo } from "../icons"

export function AppBar({ onSettings }: { onSettings: () => void }) {
  const drag = (e: MouseEvent) => {
    if (e.button === 0 && e.target === e.currentTarget) getCurrentWindow().startDragging().catch(() => {})
  }
  return (
    <header className="appbar" data-tauri-drag-region onMouseDown={drag}>
      <span className="appbar__title" data-tauri-drag-region>
        <Logo width={14} height={14} /> SVGenius
      </span>
      <button className="btn btn--icon appbar__settings" title="Settings (⌘,)" aria-label="Settings" onClick={onSettings}><IconGear /></button>
    </header>
  )
}
