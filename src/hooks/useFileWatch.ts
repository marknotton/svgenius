import { useEffect, useRef, type MutableRefObject } from "react"
import { fileMtimes, isDesktop, readSvg } from "../lib/platform"
import type { SvgItem } from "@svgenius/core/types"

// ── Watch files on disk ───────────────────────────────────────────────────────
// Desktop only. Polls modified times while the app is visible, so a file saved
// in another editor shows up here a moment later.

const EVERY_MS = 1500

export function useFileWatch(
  itemsRef: MutableRefObject<SvgItem[]>,
  reload: (path: string, text: string) => "updated" | "kept" | "same",
  onChanged: (changes: Array<{ name: string, result: "updated" | "kept" }>) => void
) {
  const seen = useRef(new Map<string, number>())
  const latest = useRef({ reload, onChanged })
  latest.current = { reload, onChanged }

  useEffect(() => {
    if (!isDesktop) return
    let busy = false
    const tick = async () => {
      if (busy || document.visibilityState !== "visible") return
      const items = itemsRef.current.filter((i) => i.fileSource !== undefined)
      if (items.length === 0) return
      busy = true
      try {
        const times = await fileMtimes(items.map((i) => i.path))
        const changes: Array<{ name: string, result: "updated" | "kept" }> = []
        for (let k = 0; k < items.length; k++) {
          const t = times[k], item = items[k]
          if (t == null) continue
          const before = seen.current.get(item.path)
          seen.current.set(item.path, t)
          // The first look just records a starting point
          if (before === undefined || before === t) continue
          const text = await readSvg(item.path).catch(() => null)
          if (text === null) continue
          const result = latest.current.reload(item.path, text)
          if (result !== "same") changes.push({ name: item.name, result })
        }
        if (changes.length) latest.current.onChanged(changes)
      } catch {
        // Try again next time
      } finally {
        busy = false
      }
    }
    const timer = setInterval(tick, EVERY_MS)
    window.addEventListener("focus", tick)
    return () => { clearInterval(timer); window.removeEventListener("focus", tick) }
  }, [itemsRef])
}
