import { useCallback, useEffect, useRef, useState } from "react"
import { byteLength } from "../lib/format"
import { CONCURRENCY, optimiseSvg, runLimited } from "../lib/optimiser"
import { newId } from "../lib/settings"
import { errorMessage, forgetFiles, isDesktop, readSvg, scanPaths } from "../lib/platform"
import { loadSession, saveSession } from "../lib/session"
import { postProcess } from "../lib/trim"
import { optimiseAutoPrecision } from "../lib/precision"
import { assessComplexity, isBlocked } from "../lib/complexity"
import type { GeometryEffect, OptimiseResult, RunSpec, SvgItem, SvgoSettings } from "../lib/types"

// ── File list + optimisation queue ────────────────────────────────────────────

export type ResolveSpec = (item: SvgItem) => RunSpec

const reloaded = (() => {
  try {
    const was = sessionStorage.getItem("svgenius:alive") === "1"
    sessionStorage.setItem("svgenius:alive", "1")
    return was
  } catch { return false }
})()

export function useItems() {
  const [items, setItems] = useState<SvgItem[]>([])
  const itemsRef = useRef(items)
  itemsRef.current = items
  // Latest run per item, so a slow earlier run can't overwrite a newer one
  const runs = useRef(new Map<string, number>())

  // Bring back the last list after a refresh, then keep it saved. The browser
  // always does; the desktop app only on a reload (sessionStorage survives a
  // reload but not a fresh launch), so opening the app still starts empty
  const restored = useRef(false)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (isDesktop && !reloaded) { restored.current = true; setReady(true); return }
    loadSession().then((saved) => {
      restored.current = true
      setReady(true)
      if (saved.length === 0) return
      setItems((list) => {
        const known = new Set(list.map((i) => i.path))
        return [...saved.filter((i) => !known.has(i.path)), ...list]
      })
    })
  }, [])
  useEffect(() => {
    if (!restored.current) return
    const t = setTimeout(() => saveSession(items), 600)
    return () => clearTimeout(t)
  }, [items])

  const patch = useCallback((id: string, p: Partial<SvgItem>) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...p } : i)))
  }, [])

  /**
   * Scans paths (files or folders) and adds new SVGs, up to `limit` in the list.
   * Returns how many were added and how many didn't fit.
   */
  const addPaths = useCallback(async (paths: string[], limit = Infinity) => {
    const scanned = await scanPaths(paths)
    const known = new Set(itemsRef.current.map((i) => i.path))
    const all: SvgItem[] = scanned
      .filter((f) => !known.has(f.path) && (known.add(f.path), true))
      .map((f) => ({ ...f, id: newId(), status: "loading", presetId: null, rev: 0 }))
    const room = Math.max(0, limit - itemsRef.current.length)
    const fresh = all.slice(0, room)
    forgetFiles(all.slice(room).map((i) => i.path))
    const result = { added: fresh.length, skipped: all.length - fresh.length }
    if (fresh.length === 0) return result
    setItems((list) => [...list, ...fresh])

    await runLimited(fresh, 8, async (item) => {
      try {
        const source = await readSvg(item.path)
        patch(item.id, { source, fileSource: source, size: byteLength(source), status: "idle", heavy: assessComplexity(source) })
      } catch (e) {
        patch(item.id, { status: "error", error: errorMessage(e) })
      }
    })
    return result
  }, [patch])

  const remove = useCallback((ids: Set<string>) => {
    forgetFiles(itemsRef.current.filter((i) => ids.has(i.id)).map((i) => i.path))
    setItems((list) => list.filter((i) => !ids.has(i.id)))
  }, [])

  const clear = useCallback(() => {
    forgetFiles(itemsRef.current.map((i) => i.path))
    setItems([])
  }, [])

  /** Swaps the whole list for a project's files */
  const replaceAll = useCallback((files: SvgItem[]) => {
    forgetFiles(itemsRef.current.map((i) => i.path))
    history.current.clear()
    setItems(files.map((f) => ({ ...f, heavy: assessComplexity(f.source ?? "") })))
  }, [])

  const setPreset = useCallback((ids: string[], presetId: string | null) => {
    const set = new Set(ids)
    setItems((list) => list.map((i) => (set.has(i.id) ? { ...i, presetId, config: undefined } : i)))
  }, [])

  const setFlag = useCallback((ids: string[], flag: SvgItem["flag"]) => {
    const set = new Set(ids)
    setItems((list) => list.map((i) => (set.has(i.id) ? { ...i, flag } : i)))
  }, [])

  // Per-file edit history, so undo works outside the editor too (after a
  // Revert in the sidebar, say). Quick runs of typing are grouped
  const history = useRef(new Map<string, { past: string[], future: string[], at: number }>())
  const record = (id: string, before: string | undefined, grouped: boolean) => {
    if (before === undefined) return
    const h = history.current.get(id) ?? { past: [], future: [], at: 0 }
    const now = Date.now()
    if (!grouped || now - h.at > 600) h.past.push(before)
    if (h.past.length > 200) h.past.shift()
    h.at = grouped ? now : 0
    h.future = []
    history.current.set(id, h)
  }
  const withSource = (i: SvgItem, source: string): SvgItem =>
    ({ ...i, source, size: byteLength(source), heavy: assessComplexity(source), rev: i.rev + 1, status: i.status === "error" ? "idle" : i.status, errorKey: undefined })

  /** In-app edit of the markup. Never written back to the original file */
  const editSource = useCallback((id: string, source: string) => {
    const cur = itemsRef.current.find((i) => i.id === id)
    if (cur && cur.source !== source) record(id, cur.source, true)
    setItems((list) => list.map((i) => (i.id === id ? withSource(i, source) : i)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const revertSource = useCallback((id: string) => {
    const cur = itemsRef.current.find((i) => i.id === id)
    if (!cur || cur.fileSource === undefined || cur.source === cur.fileSource) return
    record(id, cur.source, false)
    setItems((list) => list.map((i) => (i.id === id && i.fileSource !== undefined ? withSource(i, i.fileSource) : i)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Steps a file's markup back or forward. False when there's nothing to go to */
  const travelSource = useCallback((id: string, back: boolean) => {
    const h = history.current.get(id)
    const cur = itemsRef.current.find((i) => i.id === id)
    const to = back ? h?.past.pop() : h?.future.pop()
    if (!h || !cur || to === undefined) return false
    ;(back ? h.future : h.past).push(cur.source ?? "")
    h.at = 0
    setItems((list) => list.map((i) => (i.id === id ? withSource(i, to) : i)))
    return true
  }, [])

  /**
   * The file changed on disk (saved in another app). Untouched files take the
   * new markup; files edited in here keep their edits, and Revert loads the
   * new version. Settings, flags and presets stay as they are.
   */
  const reloadFromDisk = useCallback((path: string, text: string): "updated" | "kept" | "same" => {
    const item = itemsRef.current.find((i) => i.path === path)
    if (!item || item.fileSource === text) return "same"
    const edited = item.fileSource !== undefined && item.source !== item.fileSource
    setItems((list) => list.map((i) => (i.path !== path ? i
      : edited ? { ...i, fileSource: text }
      : { ...i, source: text, fileSource: text, size: byteLength(text), heavy: assessComplexity(text), rev: i.rev + 1, status: i.status === "error" ? "idle" : i.status, errorKey: undefined })))
    return edited ? "kept" : "updated"
  }, [])

  /** Render and optimise a heavy file at the user's own risk */
  const forceRender = useCallback((id: string) => patch(id, { forceRender: true }), [patch])

  /** Give a file its own settings (or undefined to go back to its preset) */
  const setConfig = useCallback((id: string, config: SvgoSettings | undefined) => patch(id, { config }), [patch])

  /**
   * Optimises the given items. Already up-to-date results are skipped unless
   * `force`. Resolves with the fresh result for every item that has one.
   */
  const optimise = useCallback(async (ids: string[], resolve: ResolveSpec, force = false) => {
    const set = new Set(ids)
    const results = new Map<string, OptimiseResult>()
    const jobs = itemsRef.current
      .filter((i) => set.has(i.id) && i.source !== undefined && !isBlocked(i))
      .map((item) => ({ item, spec: resolve(item) }))
      .filter(({ item, spec }) => {
        if (!force && item.result && item.result.key === spec.key) {
          results.set(item.id, item.result)
          return false
        }
        return true
      })

    await runLimited(jobs, CONCURRENCY, async ({ item, spec }) => {
      const run = (runs.current.get(item.id) ?? 0) + 1
      runs.current.set(item.id, run)
      patch(item.id, { status: "running", error: undefined })
      try {
        const auto = spec.svgo.autoPrecision
        const { data, replaced, precision } = auto
          ? await optimiseAutoPrecision(item.source as string, spec)
          : { ...await optimiseSvg(item.source as string, spec), precision: undefined }
        const effects: GeometryEffect[] = []
        const output = await postProcess(data, precision === undefined ? spec.svgo : { ...spec.svgo, floatPrecision: precision }, effects)
        if (runs.current.get(item.id) !== run) return
        const result = { output, size: byteLength(output), replaced, effects, precision, key: spec.key }
        results.set(item.id, result)
        patch(item.id, { status: "done", result, errorKey: undefined })
      } catch (e) {
        if (runs.current.get(item.id) !== run) return
        patch(item.id, { status: "error", error: errorMessage(e), errorKey: spec.key })
      }
    })
    return results
  }, [patch])

  return { items, ready, itemsRef, addPaths, remove, clear, setPreset, setFlag, editSource, revertSource, travelSource, replaceAll, setConfig, optimise, reloadFromDisk, forceRender }
}
