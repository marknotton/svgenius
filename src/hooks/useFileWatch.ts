import { useEffect, useRef, type MutableRefObject } from "react"
import { fileMtimes, isDesktop, isPasted, readSvg } from "../lib/platform"
import type { SvgItem } from "@marknotton/svgenius-core/types"

// ── Watch files on disk ───────────────────────────────────────────────────────
// Desktop only. Polls modified times while the app is visible, so a file saved
// in another editor shows up here a moment later.

const EVERY_MS = 1500

export function useFileWatch(
  itemsRef: MutableRefObject<SvgItem[]>,
  reload: (path: string, text: string) => "updated" | "kept" | "same",
  onChanged: (changes: Array<{ name: string, result: "updated" | "kept" }>) => void,
  onGone: (paths: string[]) => void
) {
  const seen = useRef(new Map<string, number>())
  const latest = useRef({ reload, onChanged, onGone })
  latest.current = { reload, onChanged, onGone }

  useEffect(() => {
    if (!isDesktop) return
    let busy = false
    const tick = async () => {
      if (busy || document.visibilityState !== "visible") return
      const items = itemsRef.current.filter((i) => !isPasted(i.path) && (i.fileSource !== undefined || i.missing))
      if (items.length === 0) return
      busy = true
      try {
        const times = await fileMtimes(items.map((i) => i.path))
        const changes: Array<{ name: string, result: "updated" | "kept" }> = []
        const gone: string[] = []
        for (let k = 0; k < items.length; k++) {
          const t = times[k], item = items[k]
          if (t == null) {
            // Was there a moment ago, so it's been deleted or moved
            if (!item.missing && seen.current.get(item.path) !== undefined) gone.push(item.path)
            seen.current.delete(item.path)
            continue
          }
          const before = seen.current.get(item.path)
          seen.current.set(item.path, t)
          // The first look just records a starting point, unless the file was missing and is back
          if (!item.missing && (before === undefined || before === t)) continue
          const text = await readSvg(item.path).catch(() => null)
          if (text === null) continue
          const result = latest.current.reload(item.path, text)
          if (result !== "same") changes.push({ name: item.name, result })
        }
        if (changes.length) latest.current.onChanged(changes)
        if (gone.length) latest.current.onGone(gone)
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
