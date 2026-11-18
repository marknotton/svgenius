import { useCallback, useEffect, useRef, useState } from "react"
import { byteLength } from "../lib/format"
import { CONCURRENCY, optimiseSvg, runLimited } from "../lib/optimiser"
import { newId } from "../lib/settings"
import { errorMessage, forgetFiles, isDesktop, readSvg, scanPaths } from "../lib/platform"
import { loadSession, saveSession } from "../lib/session"
import { postProcess } from "../lib/trim"
import type { GeometryEffect, OptimiseResult, RunSpec, SvgItem, SvgoSettings } from "../lib/types"

// ── File list + optimisation queue ────────────────────────────────────────────

export type ResolveSpec = (item: SvgItem) => RunSpec

export function useItems() {
  const [items, setItems] = useState<SvgItem[]>([])
  const itemsRef = useRef(items)
  itemsRef.current = items
  // Latest run per item, so a slow earlier run can't overwrite a newer one
  const runs = useRef(new Map<string, number>())

  // Browser: bring back the last list after a refresh, then keep it saved
  const restored = useRef(isDesktop)
  useEffect(() => {
    if (isDesktop) return
    loadSession().then((saved) => {
      restored.current = true
      if (saved.length === 0) return
      setItems((list) => {
        const known = new Set(list.map((i) => i.path))
        return [...saved.filter((i) => !known.has(i.path)), ...list]
      })
    })
  }, [])
  useEffect(() => {
    if (isDesktop || !restored.current) return
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
        patch(item.id, { source, fileSource: source, size: byteLength(source), status: "idle" })
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

  const setPreset = useCallback((ids: string[], presetId: string | null) => {
    const set = new Set(ids)
    setItems((list) => list.map((i) => (set.has(i.id) ? { ...i, presetId, config: undefined } : i)))
  }, [])

  const setFlag = useCallback((ids: string[], flag: SvgItem["flag"]) => {
    const set = new Set(ids)
    setItems((list) => list.map((i) => (set.has(i.id) ? { ...i, flag } : i)))
  }, [])

  /** In-app edit of the markup. Never written back to the original file */
  const editSource = useCallback((id: string, source: string) => {
    setItems((list) => list.map((i) => (i.id === id
      ? { ...i, source, size: byteLength(source), rev: i.rev + 1, status: i.status === "error" ? "idle" : i.status, errorKey: undefined }
      : i)))
  }, [])

  const revertSource = useCallback((id: string) => {
    setItems((list) => list.map((i) => (i.id === id && i.fileSource !== undefined
      ? { ...i, source: i.fileSource, size: byteLength(i.fileSource), rev: i.rev + 1, errorKey: undefined }
      : i)))
  }, [])

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
      .filter((i) => set.has(i.id) && i.source !== undefined)
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
        const { data, replaced } = await optimiseSvg(item.source as string, spec)
        const effects: GeometryEffect[] = []
        const output = await postProcess(data, spec.svgo, effects)
        if (runs.current.get(item.id) !== run) return
        const result = { output, size: byteLength(output), replaced, effects, key: spec.key }
        results.set(item.id, result)
        patch(item.id, { status: "done", result, errorKey: undefined })
      } catch (e) {
        if (runs.current.get(item.id) !== run) return
        patch(item.id, { status: "error", error: errorMessage(e), errorKey: spec.key })
      }
    })
    return results
  }, [patch])

  return { items, itemsRef, addPaths, remove, clear, setPreset, setFlag, editSource, revertSource, setConfig, optimise }
}
