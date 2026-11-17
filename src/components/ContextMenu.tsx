import { useEffect, useLayoutEffect, useRef, useState } from "react"

// ── Right-click menu ──────────────────────────────────────────────────────────

export interface MenuItem {
  label: string
  run: () => void
  danger?: boolean
  disabled?: boolean
}

export interface MenuState { x: number, y: number, items: Array<MenuItem | "-"> }

export function ContextMenu({ menu, onClose }: { menu: MenuState, onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: menu.x, y: menu.y })

  // Keep it on screen
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      x: Math.min(menu.x, window.innerWidth - r.width - 6),
      y: Math.min(menu.y, window.innerHeight - r.height - 6)
    })
  }, [menu])

  useEffect(() => {
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("mousedown", close)
    window.addEventListener("blur", onClose)
    window.addEventListener("keydown", key)
    return () => {
      window.removeEventListener("mousedown", close)
      window.removeEventListener("blur", onClose)
      window.removeEventListener("keydown", key)
    }
  }, [onClose])

  return (
    <div ref={ref} className="context-menu" role="menu" style={{ left: pos.x, top: pos.y }}>
      {menu.items.map((it, i) => it === "-"
        ? <div key={i} className="context-menu__sep" />
        : (
          <button key={i} role="menuitem" className={`context-menu__item${it.danger ? " is-danger" : ""}`} disabled={it.disabled}
            onClick={() => { onClose(); it.run() }}>
            {it.label}
          </button>
        ))}
    </div>
  )
}
