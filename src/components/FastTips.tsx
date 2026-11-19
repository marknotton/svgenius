import { useEffect, useLayoutEffect, useRef, useState } from "react"

// ── Quick tooltips ────────────────────────────────────────────────────────────
// The browser waits a second or so before showing a title, which feels slow on
// toolbars. Buttons' titles show here instead, after a short pause, and at
// once while you move along a row of them. The title moves to data-tip while
// it's ours, so the native one doesn't show as well.

const TARGETS = "button[title], label[title], a[title], [role=button][title], [data-tip]"
const DELAY = 300
/** Moving to the next button within this long shows its tip straight away */
const WARM = 600

interface Tip { text: string, x: number, top: number, bottom: number }

export function FastTips() {
  const [tip, setTip] = useState<Tip | null>(null)
  const el = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ left: number, top: number } | null>(null)

  useEffect(() => {
    let timer = 0
    let current: HTMLElement | null = null
    let visible = false
    let lastHidden = 0
    const hide = () => {
      clearTimeout(timer)
      if (visible) lastHidden = Date.now()
      visible = false
      current = null
      setTip(null)
    }
    const over = (e: MouseEvent) => {
      const t = (e.target as Element | null)?.closest?.(TARGETS) as HTMLElement | null
      if (t === current) return
      hide()
      const warm = Date.now() - lastHidden < WARM
      if (!t || t.closest(".monaco-editor")) return
      if (t.title) { t.dataset.tip = t.title; t.removeAttribute("title") }
      const text = t.dataset.tip
      if (!text) return
      current = t
      const show = () => {
        if (current !== t || !t.isConnected) return
        const r = t.getBoundingClientRect()
        visible = true
        setTip({ text, x: r.left + r.width / 2, top: r.top, bottom: r.bottom })
      }
      if (warm) show()
      else timer = window.setTimeout(show, DELAY)
    }
    const out = (e: MouseEvent) => {
      if (!current) return
      const to = e.relatedTarget as Node | null
      if (!to || !current.contains(to)) hide()
    }
    document.addEventListener("mouseover", over)
    document.addEventListener("mouseout", out)
    window.addEventListener("pointerdown", hide, true)
    window.addEventListener("keydown", hide, true)
    window.addEventListener("scroll", hide, true)
    window.addEventListener("blur", hide)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("mouseover", over)
      document.removeEventListener("mouseout", out)
      window.removeEventListener("pointerdown", hide, true)
      window.removeEventListener("keydown", hide, true)
      window.removeEventListener("scroll", hide, true)
      window.removeEventListener("blur", hide)
    }
  }, [])

  // Below the button, or above it near the bottom; never off the sides
  useLayoutEffect(() => {
    const d = el.current
    if (!tip || !d) { setPlace(null); return }
    const w = d.offsetWidth, h = d.offsetHeight
    const left = Math.min(Math.max(8, tip.x - w / 2), window.innerWidth - w - 8)
    const top = tip.bottom + 6 + h > window.innerHeight - 8 ? tip.top - 6 - h : tip.bottom + 6
    setPlace({ left, top })
  }, [tip])

  if (!tip) return null
  return (
    <div ref={el} className="fast-tip" role="tooltip" style={place ?? { left: -9999, top: -9999 }}>{tip.text}</div>
  )
}
