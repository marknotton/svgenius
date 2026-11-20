import { useEffect, useState, type ReactNode, type RefObject } from "react"
import { IconCode, IconCrop, IconExpand, IconFile, IconFlask, IconGear, IconPencil, IconPuzzle, IconSliders, IconStar, IconSwap, IconTag } from "../icons"

// ── Section footer ────────────────────────────────────────────────────────────
// A row of icons along the bottom of a settings panel, one per section
// ([data-nav] elements in the scroller). The one in view is highlighted as you
// scroll, and clicking one glides there. It follows whatever sections are
// showing, so Advanced on or off just works.

const ICONS: Record<string, ReactNode> = {
  file: <IconFile />, preset: <IconStar />, customise: <IconPencil />, markup: <IconCode />,
  output: <IconSliders />, contents: <IconExpand />, viewbox: <IconCrop />, replace: <IconSwap />,
  attrs: <IconTag />, plugins: <IconGear />, beta: <IconFlask />, custom: <IconPuzzle />
}

interface Section { key: string, title: string, el: HTMLElement }

export function SectionNav({ scroller }: { scroller: RefObject<HTMLElement | null> }) {
  const [sections, setSections] = useState<Section[]>([])
  const [active, setActive] = useState(0)

  // Which sections are there: re-read whenever the panel's contents change
  useEffect(() => {
    const root = scroller.current
    if (!root) return
    const scan = () => {
      const found = [...root.querySelectorAll<HTMLElement>("[data-nav]")]
        .filter((el) => el.offsetParent !== null)
        .map((el) => ({ key: el.dataset.nav!, title: el.dataset.navTitle ?? el.dataset.nav!, el }))
      setSections((old) => (old.length === found.length && old.every((s, i) => s.el === found[i].el && s.title === found[i].title) ? old : found))
    }
    scan()
    const mo = new MutationObserver(scan)
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "data-nav-title"] })
    return () => mo.disconnect()
  }, [scroller])

  // The section in view: the last one whose top has reached the top of the panel
  useEffect(() => {
    const root = scroller.current
    if (!root || !sections.length) return
    const onScroll = () => {
      const top = root.getBoundingClientRect().top
      // At the very bottom, the last section counts even if it's short
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) { setActive(sections.length - 1); return }
      let at = 0
      sections.forEach((s, i) => { if (s.el.getBoundingClientRect().top - top <= 24) at = i })
      setActive(at)
    }
    onScroll()
    root.addEventListener("scroll", onScroll, { passive: true })
    return () => root.removeEventListener("scroll", onScroll)
  }, [scroller, sections])

  if (sections.length < 2) return null
  const go = (s: Section) => {
    const root = scroller.current
    if (!root) return
    const y = s.el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop
    root.scrollTo({ top: Math.max(0, y), behavior: "smooth" })
  }
  return (
    <nav className="section-nav" aria-label="Sections">
      {sections.map((s, i) => (
        <button key={`${s.key}-${i}`} type="button" className={`section-nav__btn${i === active ? " is-active" : ""}`}
          title={s.title} aria-label={s.title} aria-current={i === active ? "true" : undefined} onClick={() => go(s)}>
          {ICONS[s.key] ?? <IconSliders />}
        </button>
      ))}
    </nav>
  )
}
