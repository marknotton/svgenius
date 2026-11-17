import type { MouseEvent } from "react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { Logo } from "../icons"

export function AppBar({ subtitle }: { subtitle?: string }) {
  const drag = (e: MouseEvent) => {
    if (e.button === 0 && e.target === e.currentTarget) getCurrentWindow().startDragging().catch(() => {})
  }
  return (
    <header className="appbar" data-tauri-drag-region onMouseDown={drag}>
      <span className="appbar__title" data-tauri-drag-region>
        <Logo width={14} height={14} /> SVGenius
        {subtitle && <span className="text-3"> · {subtitle}</span>}
      </span>
    </header>
  )
}
