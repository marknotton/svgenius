import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { Backdrop } from "../lib/types"
import { usePreviewCss, withPreviewCss } from "./PreviewCss"

// ── Inspectable preview ───────────────────────────────────────────────────────
// Renders the SVG inline (scripts and event handlers stripped) so elements can
// be hovered and clicked, like a browser's element picker. Elements are
// numbered in tree order, which matches their order in the markup.

interface Props {
  markup: string
  backdrop: Backdrop
  /** Tree-order index of the picked element */
  selected: number
  onPick: (index: number) => void
  onHover: (index: number) => void
}

const ATTR = "data-svgenius-i"

function prepare(markup: string) {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml")
  const root = doc.documentElement
  if (root.localName !== "svg" || doc.querySelector("parsererror")) return null
  const all = [root, ...root.querySelectorAll("*")]
  all.forEach((el, i) => el.setAttribute(ATTR, String(i)))
  // Nothing in the preview gets to run
  for (const el of all) {
    if (el.localName === "script" || el.localName === "foreignObject") { el.remove(); continue }
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name) || (/href$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name)
    }
  }
  root.setAttribute("width", "100%")
  root.setAttribute("height", "100%")
  return root
}

export function InspectPreview({ markup, backdrop, selected, onPick, onHover }: Props) {
  const stage = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(-1)
  const [boxes, setBoxes] = useState<{ sel: DOMRect | null, hov: DOMRect | null }>({ sel: null, hov: null })
  const css = usePreviewCss()
  // Preview CSS goes in last, so element numbers still match the markup
  const root = useMemo(() => prepare(withPreviewCss(markup, css)), [markup, css])

  useLayoutEffect(() => {
    const el = stage.current
    if (!el) return
    // A shadow root keeps the SVG's own <style> from leaking into the app
    const shadow = el.shadowRoot ?? el.attachShadow({ mode: "open" })
    const base = document.createElement("style")
    base.textContent = ":host{display:block}svg{display:block;width:100%;height:100%}"
    shadow.replaceChildren(base)
    if (root) shadow.appendChild(document.importNode(root, true))
  }, [root])

  // Outline boxes follow the picked and hovered elements
  useEffect(() => {
    const measure = () => {
      const el = stage.current
      if (!el) return
      const base = el.getBoundingClientRect()
      const box = (i: number) => {
        if (i < 0) return null
        const t = el.shadowRoot?.querySelector(`[${ATTR}="${i}"]`)
        if (!t) return null
        const r = t.getBoundingClientRect()
        return new DOMRect(r.x - base.x, r.y - base.y, r.width, r.height)
      }
      setBoxes({ sel: box(selected), hov: hover !== selected ? box(hover) : null })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (stage.current) ro.observe(stage.current)
    return () => ro.disconnect()
  }, [selected, hover, root])

  // Events from inside the shadow root are retargeted, so use the real target
  const indexOf = (e: { nativeEvent: Event }) => {
    const target = e.nativeEvent.composedPath()[0] as Element | undefined
    const el = target?.closest?.(`[${ATTR}]`)
    return el ? Number(el.getAttribute(ATTR)) : -1
  }

  return (
    <div className={`inspect thumb--${backdrop}`}>
      <div ref={stage} className="inspect__stage"
        onMouseMove={(e) => { const i = indexOf(e); if (i !== hover) { setHover(i); onHover(i) } }}
        onMouseLeave={() => { setHover(-1); onHover(-1) }}
        onClick={(e) => { const i = indexOf(e); if (i >= 0) onPick(i) }} />
      {boxes.hov && <div className="inspect__box inspect__box--hover" style={rect(boxes.hov)} />}
      {boxes.sel && <div className="inspect__box" style={rect(boxes.sel)} />}
      {!root && <p className="inspect__error text-3">This markup doesn't parse, so it can't be previewed.</p>}
    </div>
  )
}

const rect = (r: DOMRect) => ({ left: r.x, top: r.y, width: Math.max(r.width, 1), height: Math.max(r.height, 1) })
