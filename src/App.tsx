import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react"
import { CanvasBgContext, solidOf, type CanvasBg } from "./components/CanvasBackground"
import { FastTips } from "./components/FastTips"
import { AdvancedToggle, AppBar, BrandBar } from "./components/AppBar"
import { ConfigPanel } from "./components/ConfigPanel"
import { ContextMenu, type MenuState } from "./components/ContextMenu"
import { useDialogs } from "./components/Dialogs"
import { clampDrawer, clampSidebar, Divider, DRAWER } from "./components/Divider"
import { DropOverlay, EmptyState } from "./components/EmptyState"
import { FileInspector } from "./components/FileInspector"
import { FileList } from "./components/FileList"
import { Footer } from "./components/Footer"
import { PreviewCssBar, PreviewCssContext } from "./components/PreviewCss"
import { RenamePanel } from "./components/RenamePanel"
import { FilterBar } from "./components/FilterBar"
import { activeRules, emptyFilters, matchesFilters, nextFlag, type FilterSet } from "./lib/filters"
import { ReportDialog } from "./components/ReportDialog"
import { SettingsDialog } from "./components/SettingsDialog"
import { AboutDialog } from "./components/AboutDialog"
import { UpdateNotice } from "./components/Updates"
import { Toasts, useToasts } from "./components/Toast"
import { ViewControls } from "./components/ViewControls"
import { presetActions, presetById, uniqueName, useAppSettings } from "./hooks/useAppSettings"
import { useItems } from "./hooks/useItems"
import { IconX } from "./icons"
import { planExport } from "./lib/exportPlan"
import { plural } from "./lib/format"
import { activeCustom, buildExport, defaultLayout, hashCode, mergeImport, newId, PREVIEW_PX, runSpec, SIDEBAR } from "./lib/settings"
import { exportNames } from "./lib/rename"
import { fileTags } from "./lib/tags"
import { LIVE_DEBOUNCE_MS } from "./lib/config"
import { probePlugin } from "./lib/optimiser"
import { canReveal, openInDefaultApp, errorMessage, exportSvgFile, exportSvgs, listenFor, listenForDrops, listenForOpenedFiles, listenForQuit, quitApp, setUnsavedGuard, openJson, openPlugin, openProjectFile, PROJECT_EXT, pickSvgs, readProjectFile, reveal, saveJson, saveProjectFile } from "./lib/platform"
import { buildProject, countChanges, readProject } from "./lib/project"
import { SORT_KEYS, sortItems, sortStore, type SortState } from "./lib/sort"
import { preloadMonaco, setEditorTheme } from "./components/CodeEditor"
import { RenderAnywayContext } from "./components/TooComplex"
import { isBlocked } from "./lib/complexity"
import { checkPreviewCss, type CssWarning } from "./lib/cssCheck"
import { useTheme } from "./lib/theme"
import { listenForCommands, textFocus, useCommands } from "./lib/commands"
import { useFileWatch } from "./hooks/useFileWatch"
import type { AppSettings, CustomPlugin, SvgItem, SvgoSettings } from "./lib/types"

/** Where the last page load left off: the open file and whether its editor was up */
const lastView: { focusId?: string | null, sidebarTab?: "preset" | "names" | "file", markupOpen?: boolean } = (() => {
  try { return JSON.parse(sessionStorage.getItem("svgenius:view") ?? "{}") } catch { return {} }
})()

const noop = () => {}

export default function App() {
  const { settings, update, loadError } = useAppSettings()
  const dark = useTheme(settings?.theme)
  useEffect(() => setEditorTheme(dark), [dark])
  if (!settings) return <div className="app app--loading"><span className="spinner" /></div>
  return <Workspace settings={settings} update={update} loadError={loadError} />
}

interface WorkspaceProps {
  settings: AppSettings
  update: (fn: (s: AppSettings) => AppSettings) => void
  loadError: string | null
}

function Workspace({ settings, update, loadError }: WorkspaceProps) {
  const { items, ready, itemsRef, addPaths, remove, clear, setPreset, setFlag, editSource, revertSource, travelSource, replaceAll, setConfig, optimise, reloadFromDisk, forceRender } = useItems()
  // Once there are files, get the code editor ready before anyone opens it
  const hasItems = items.length > 0
  useEffect(() => { if (hasItems) preloadMonaco() }, [hasItems])
  const dialogs = useDialogs()
  const { toasts, push, dismiss } = useToasts()
  const actions = useMemo(() => presetActions(update), [update])

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  // The big markup editor, for the focused file
  const [markupOpen, setMarkupOpen] = useState(() => lastView.markupOpen === true)
  const openMarkup = useCallback((id: string) => {
    setFocusId(id)
    setSidebarTab("file")
    setMarkupOpen(true)
  }, [])
  const [reportOpen, setReportOpen] = useState(false)
  // A row's "Exports as" name, shown and flashed in the File names tab
  const [nameFlash, setNameFlash] = useState<{ id: string, n: number } | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const anchor = useRef<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(() => lastView.focusId ?? null)
  const focusIdRef = useRef(focusId)
  focusIdRef.current = focusId
  const [sidebarTab, setSidebarTab] = useState<"preset" | "names" | "file">(() => lastView.sidebarTab ?? "preset")
  // Remember where you were, so a refresh lands back on the same file and editor
  useEffect(() => {
    try { sessionStorage.setItem("svgenius:view", JSON.stringify({ focusId, sidebarTab, markupOpen })) } catch { /* unavailable */ }
  }, [focusId, sidebarTab, markupOpen])
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set())

  // ── Presets ─────────────────────────────────────────────────────────────────

  const defaultPreset = presetById(settings, settings.defaultPresetId)
  const editing = presetById(settings, settings.editingPresetId)
  const presetFor = useCallback((item: SvgItem) => presetById(settings, item.presetId), [settings])
  const specs = useMemo(
    () => new Map(settings.presets.map((p) => [p.id, runSpec(p.settings, settings.customPlugins)])),
    [settings.presets, settings.customPlugins]
  )
  /** The settings a file actually runs with: its own, or its preset's */
  const settingsFor = useCallback((item: SvgItem): SvgoSettings => item.config ?? presetFor(item).settings, [presetFor])
  // Per-file spec: the file's own settings or its preset's, plus any in-app edits
  const resolve = useCallback((item: SvgItem) => {
    const base = item.config
      ? runSpec(item.config, settings.customPlugins)
      : specs.get(presetFor(item).id) ?? runSpec(presetFor(item).settings, settings.customPlugins)
    return { ...base, key: `${base.key}|r${item.rev}` }
  }, [specs, presetFor, settings.customPlugins])
  const tagsFor = useCallback((item: SvgItem) => {
    const s = settingsFor(item)
    return fileTags(item, s, activeCustom(s, settings.customPlugins).length)
  }, [settingsFor, settings.customPlugins])
  const isStale = useCallback(
    (item: SvgItem) => !!item.result && item.result.key !== resolve(item).key,
    [resolve]
  )

  const usageOf = useCallback((id: string) => items.filter((i) => !i.config && presetFor(i).id === id).length, [items, presetFor])
  const usage = usageOf(editing.id)

  // ── Adding files ────────────────────────────────────────────────────────────

  const add = useCallback(async (all: string[]) => {
    // A project dropped or opened from Finder opens as a project
    const project = all.find((p) => p.toLowerCase().endsWith(`.${PROJECT_EXT}`))
    if (project) { openProjectRef.current(project); return }
    const paths = all
    if (paths.length === 0) {
      push({ tone: "info", text: "No SVGs found there" })
      return
    }
    try {
      const { added } = await addPaths(paths)
      if (added === 0) push({ tone: "info", text: "No new SVGs found there" })
    } catch (e) {
      push({ tone: "error", text: errorMessage(e) })
    }
  }, [addPaths, push])

  const addFiles = async () => {
    const picked = await pickSvgs("files")
    if (picked) add(picked)
  }

  const addFolder = async () => {
    const picked = await pickSvgs("folder")
    if (picked) add(picked)
  }

  useEffect(() => listenForDrops({ onHover: setDragging, onDrop: add }), [add])

  // Finder "Open With", including cold launches
  useEffect(() => listenForOpenedFiles(add), [add])

  // Files saved in another app come straight back in
  useFileWatch(itemsRef, reloadFromDisk, (changes) => {
    const kept = changes.filter((c) => c.result === "kept")
    const one = changes.length === 1 ? changes[0].name : plural(changes.length, "file")
    push({
      tone: "info",
      text: kept.length
        ? `${one} changed on disk. ${kept.length === 1 ? "It has" : "Some have"} edits made here, so those were kept: use Revert to load the saved version`
        : `Reloaded ${one}: saved in another app`
    })
  })

  useEffect(() => {
    if (loadError) push({ tone: "error", text: `Couldn't load saved presets: ${loadError}` })
  }, [loadError, push])

  // ── Selection ───────────────────────────────────────────────────────────────

  // Drop selected ids that no longer exist
  useEffect(() => {
    setSelection((sel) => {
      const ids = new Set(items.map((i) => i.id))
      const next = new Set([...sel].filter((id) => ids.has(id)))
      return next.size === sel.size ? sel : next
    })
  }, [items])

  // Finder-style: Shift extends a range from the last clicked row
  const rangeTo = useCallback((sel: Set<string>, id: string) => {
    const list = itemsRef.current
    const a = list.findIndex((i) => i.id === anchor.current)
    const b = list.findIndex((i) => i.id === id)
    if (a < 0 || b < 0) return null
    const next = new Set(sel)
    const [from, to] = a < b ? [a, b] : [b, a]
    for (let i = from; i <= to; i++) next.add(list[i].id)
    return next
  }, [itemsRef])

  /** Checkbox, or Cmd/Ctrl-click: toggle one row. Shift: add a range */
  const toggle = useCallback((id: string, e: MouseEvent) => {
    setSelection((sel) => {
      if (e.shiftKey && anchor.current) {
        const range = rangeTo(sel, id)
        if (range) return range
      }
      const next = new Set(sel)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      anchor.current = id
      return next
    })
  }, [rangeTo])

  /** A click opens the row in the inspector. Only the checkbox (or ⌘/Shift-click) changes the selection */
  const rowClick = useCallback((id: string, e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return toggle(id, e)
    setFocusId(id)
    setSidebarTab("file")
  }, [toggle])

  /** Cycles the flag colour. On a selected row it flags every selected file; Alt-click clears */
  const flagClick = useCallback((id: string, e: MouseEvent) => {
    const item = itemsRef.current.find((i) => i.id === id)
    if (!item) return
    const flag = e.altKey ? undefined : nextFlag(item.flag)
    setFlag(selection.has(id) && selection.size > 1 ? [...selection] : [id], flag)
  }, [itemsRef, selection, setFlag])

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<FilterSet>(emptyFilters)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterCount = activeRules(filters).length
  const filtered = useMemo(() => (filterCount ? items.filter((i) => matchesFilters(i, filters)) : items), [items, filters, filterCount])

  const selectAll = (all: boolean) => setSelection(all ? new Set(shownItems.map((i) => i.id)) : new Set())

  // Menu and keyboard commands; ⌘A on the list selects every file
  useEffect(() => listenForCommands(), [])
  useCommands((cmd) => {
    if (textFocus() || document.querySelector(".modal")) return false
    // Undo and redo step the open file's markup back and forward (a Revert included)
    if ((cmd === "undo" || cmd === "redo") && focusIdRef.current) return travelSource(focusIdRef.current, cmd === "undo")
    if (cmd !== "selectAll") return false
    selectAll(true)
    return true
  })

  // Selected files, or else every file the filters let through
  const targets = useMemo(() => (selection.size ? items.filter((i) => selection.has(i.id)) : filtered), [items, selection, filtered])
  // Export names, previewed on the rows of the files that would be exported
  const previewNames = useMemo(
    () => (settings.rename.enabled ? exportNames(targets.filter((i) => i.status !== "error"), settings.rename) : null),
    [targets, settings.rename]
  )

  // Only built while the report is open
  const reportEntries = useMemo(() => {
    if (!reportOpen) return []
    const all = settings.rename.enabled ? exportNames(items.filter((i) => i.status !== "error"), settings.rename) : null
    return items.map((item) => ({
      item,
      settings: settingsFor(item),
      preset: item.config ? "Own settings" : presetFor(item).name,
      exportName: previewNames?.get(item.id) ?? all?.get(item.id),
      tags: tagsFor(item).filter((t) => t.label !== "Own settings").map((t) => t.label),
      stale: isStale(item)
    }))
  }, [reportOpen, items, settings.rename, settingsFor, presetFor, previewNames, tagsFor, isStale])

  // Search by original or export name; the rest of the list is hidden
  const [query, setQuery] = useState("")
  const usedFlags = useMemo(() => new Set(items.flatMap((i) => i.flag ? [i.flag as string] : [])), [items])
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return filtered
    return filtered.filter((i) => i.name.toLowerCase().includes(q) || i.relPath.toLowerCase().includes(q)
      || (previewNames?.get(i.id) ?? "").toLowerCase().includes(q))
  }, [filtered, query, previewNames])

  // Sort what's left after search and filters
  const [sort, setSortState] = useState<SortState>(sortStore.get)
  const setSort = (next: Partial<SortState>) => setSortState((s) => { const v = { ...s, ...next }; sortStore.set(v); return v })
  const shownItems = useMemo(() => sortItems(searched, sort, settings), [searched, sort, settings])
  const sortMenu = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const tick = (on: boolean, label: string) => `${on ? "✓" : "\u2003"}  ${label}`
    setMenu({
      x: r.left, y: r.bottom + 4,
      items: [
        ...SORT_KEYS.map((k) => ({ label: tick(sort.key === k.value, k.label), run: () => setSort({ key: k.value }) })),
        "-",
        { label: tick(!sort.desc, sort.key === "name" || sort.key === "folder" ? "A to Z" : sort.key === "updated" ? "Oldest first" : "Smallest first"), run: () => setSort({ desc: false }), disabled: sort.key === "added" },
        { label: tick(sort.desc, sort.key === "name" || sort.key === "folder" ? "Z to A" : sort.key === "updated" ? "Newest first" : "Largest first"), run: () => setSort({ desc: true }), disabled: sort.key === "added" },
        "-",
        { label: tick(sort.byFlag, "Group by flag colour"), run: () => setSort({ byFlag: !sort.byFlag }) }
      ]
    })
  }
  const sortLabel = `${SORT_KEYS.find((k) => k.value === sort.key)?.short ?? "Sort"}${sort.key !== "added" ? (sort.desc ? " ↓" : " ↑") : ""}${sort.byFlag ? " · flags" : ""}`


  // ── Running ─────────────────────────────────────────────────────────────────

  const run = async (list: SvgItem[], force = false) => {
    setBusy(true)
    try {
      return await optimise(list.map((i) => i.id), resolve, force)
    } finally {
      setBusy(false)
    }
  }

  // ── Live updates ────────────────────────────────────────────────────────────
  // Rows on or near screen (and the inspected file) re-run as settings change.
  // Off-screen rows catch up when they're scrolled near.

  const needsRun = useCallback((i: SvgItem) => {
    if (i.source === undefined || i.status === "loading" || i.status === "running" || isBlocked(i)) return false
    const key = resolve(i).key
    return i.result?.key !== key && i.errorKey !== key
  }, [resolve])

  const liveIds = useMemo(() => {
    const pool = settings.liveUpdates ? items.filter((i) => visibleIds.has(i.id)) : []
    const focused = items.find((i) => i.id === focusId)
    const list = focused && !pool.includes(focused) ? [...pool, focused] : pool
    return list.filter(needsRun).map((i) => i.id).join(",")
  }, [items, visibleIds, focusId, settings.liveUpdates, needsRun])

  useEffect(() => {
    if (!liveIds) return
    const t = setTimeout(() => { optimise(liveIds.split(","), resolve) }, LIVE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [liveIds, optimise, resolve])

  const focused = items.find((i) => i.id === focusId) ?? null
  useEffect(() => {
    // Wait for a refresh's list to come back before giving up on the file
    if (ready && focusId && !focused) { setFocusId(null); setSidebarTab("preset"); setMarkupOpen(false) }
  }, [ready, focusId, focused])

  // ── Export ──────────────────────────────────────────────────────────────────

  const isFresh = useCallback((i: SvgItem) => !!i.result && i.result.key === resolve(i).key && i.status !== "running", [resolve])
  const readyCount = targets.filter(isFresh).length
  const failedCount = targets.filter((i) => i.status === "error").length

  // Export writes the results already on screen; the footer only enables it
  // once every target is up to date
  const doExport = async (clearAfter = false) => {
    const list = targets
    const ready = list.filter(isFresh)
    const results = new Map(ready.map((i) => [i.id, i.result]))
    if (ready.length === 0) {
      push({ tone: "error", text: "Nothing to export. Check the files for errors." })
      return
    }
    const plan = planExport(ready, settings.keepStructure, exportNames(ready, settings.rename))
    try {
      const confirmReplace = (clashes: string[]) =>
        dialogs.confirm({
          title: `Replace ${plural(clashes.length, "file")}?`,
          body: <>
            <p>These already exist in the export folder and will be overwritten:</p>
            <ul className="modal__list">{clashes.slice(0, 6).map((c) => <li key={c}>{c}</li>)}</ul>
            {clashes.length > 6 && <p className="text-2">…and {clashes.length - 6} more</p>}
          </>,
          confirmLabel: "Replace",
          danger: true
        })
      setBusy(true)
      const written = await exportSvgs(plan.map(({ item, relPath }) => ({
        relPath,
        contents: (results.get(item.id)?.output) ?? ""
      })), `Export ${plural(ready.length, "file")} to…`, confirmReplace)
      if (!written) return
      const skipped = list.length - ready.length
      // Job done: only the exported files leave the list, failures stay to fix
      if (clearAfter) remove(new Set(ready.map((i) => i.id)))
      push({
        tone: "success",
        text: `${written.download ? `Downloaded ${written.download} with` : "Exported"} ${plural(written.count, "file")}${clearAfter ? " and cleared them from the list" : ""}${skipped ? `, skipped ${skipped} with errors` : ""}`,
        action: written.reveal ? { label: "Show in Finder", run: written.reveal } : undefined
      })
    } catch (e) {
      push({ tone: "error", text: `Export failed: ${errorMessage(e)}` })
    } finally {
      setBusy(false)
    }
  }

  // One file from its right-click menu: optimised with its current preset
  // (run now if the result is stale), then saved wherever you pick
  const exportOne = async (id: string) => {
    const item = itemsRef.current.find((i) => i.id === id)
    if (!item) return
    try {
      setBusy(true)
      const result = (await optimise([id], resolve)).get(id)
      if (!result) {
        const now = itemsRef.current.find((i) => i.id === id)
        push({ tone: "error", text: `Couldn't optimise ${item.name}${now?.error ? `: ${now.error}` : ""}` })
        return
      }
      // Same name a full export would give it, renaming rules included
      const name = exportNames(itemsRef.current, settings.rename).get(id) ?? item.name
      const written = await exportSvgFile(name, result.output, canReveal ? item.path : undefined)
      if (!written) return
      push({
        tone: "success",
        text: written.download ? `Downloaded ${written.download}` : `Exported ${name}`,
        action: written.reveal ? { label: "Show in Finder", run: written.reveal } : undefined
      })
    } catch (e) {
      push({ tone: "error", text: `Export failed: ${errorMessage(e)}` })
    } finally {
      setBusy(false)
    }
  }
  const exportOneRef = useRef(exportOne)
  exportOneRef.current = exportOne

  // ── Preset management ───────────────────────────────────────────────────────

  const newPreset = async () => {
    const name = await dialogs.prompt({
      title: "New preset",
      hint: `Starts as a copy of “${editing.name}”.`,
      initial: uniqueName(settings, `${editing.name} copy`),
      confirmLabel: "Create"
    })
    if (name) actions.create(uniqueName(settings, name), editing.settings)
  }

  const newPresetForItem = async (item: SvgItem) => {
    const base = presetFor(item)
    const name = await dialogs.prompt({
      title: `New preset for ${item.name}`,
      hint: `Starts as a copy of “${base.name}” and opens in the settings panel.`,
      initial: uniqueName(settings, item.name.replace(/\.svg$/i, "")),
      confirmLabel: "Create"
    })
    if (!name) return
    const preset = actions.create(uniqueName(settings, name), base.settings)
    setPreset([item.id], preset.id)
  }

  const renamePreset = async () => {
    const name = await dialogs.prompt({ title: "Rename preset", initial: editing.name, confirmLabel: "Rename" })
    if (name && name !== editing.name) actions.rename(editing.id, uniqueName(settings, name))
  }

  const removePreset = (id: string) => {
    setPreset(items.filter((i) => i.presetId === id && !i.config).map((i) => i.id), null)
    actions.remove(id)
  }

  const deletePreset = async () => {
    const ok = await dialogs.confirm({
      title: `Delete “${editing.name}”?`,
      body: usage ? `${plural(usage, "file")} using it will switch to the default preset.` : "This can't be undone.",
      confirmLabel: "Delete",
      danger: true
    })
    if (ok) removePreset(editing.id)
  }

  // ── A file's own settings ───────────────────────────────────────────────────

  const customiseItem = (item: SvgItem) => setConfig(item.id, structuredClone(presetFor(item).settings))

  const saveItemAsPreset = async (item: SvgItem) => {
    if (!item.config) return
    const name = await dialogs.prompt({
      title: "Save as preset",
      hint: `${item.name}'s settings become a preset you can use on other files.`,
      initial: uniqueName(settings, item.name.replace(/\.svg$/i, "")),
      confirmLabel: "Save"
    })
    if (!name) return
    const preset = actions.create(uniqueName(settings, name), item.config)
    setPreset([item.id], preset.id)
    push({ tone: "success", text: `Saved “${preset.name}” and switched ${item.name} to it` })
  }

  const importPresets = async () => {
    try {
      const json = await openJson()
      if (json === null) return
      const { next, added, updated } = mergeImport(settings, JSON.parse(json))
      update(() => next)
      push({ tone: "success", text: `Imported presets: ${added} added, ${updated} updated` })
    } catch (e) {
      push({ tone: "error", text: `Import failed: ${errorMessage(e)}` })
    }
  }

  const exportPresets = async () => {
    try {
      if (!(await saveJson("svgenius-presets.json", JSON.stringify(buildExport(settings), null, 2)))) return
      push({ tone: "success", text: `Exported ${plural(settings.presets.length, "preset")}` })
    } catch (e) {
      push({ tone: "error", text: `Export failed: ${errorMessage(e)}` })
    }
  }

  // ── Custom plugins ──────────────────────────────────────────────────────────

  const loadPlugin = async () => {
    try {
      const picked = await openPlugin()
      if (!picked) return
      const { fileName, code } = picked
      const { name, description } = await probePlugin(code)
      const existing = settings.customPlugins.find((c) => c.name === name)
      const plugin: CustomPlugin = { id: existing?.id ?? newId(), name, description, fileName, code, hash: hashCode(code) }
      update((s) => ({
        ...s,
        customPlugins: existing ? s.customPlugins.map((c) => (c.id === plugin.id ? plugin : c)) : [...s.customPlugins, plugin],
        presets: s.presets.map((p) => (p.id !== editing.id ? p : {
          ...p,
          settings: { ...p.settings, custom: { ...p.settings.custom, [plugin.id]: { params: p.settings.custom[plugin.id]?.params ?? "", on: true } } }
        }))
      }))
      push({ tone: "success", text: `${existing ? "Reloaded" : "Loaded"} “${name}” and switched it on for ${editing.name}` })
    } catch (e) {
      push({ tone: "error", text: `Couldn't load plugin: ${errorMessage(e)}` })
    }
  }

  const removePlugin = async (plugin: CustomPlugin) => {
    const ok = await dialogs.confirm({
      title: `Remove “${plugin.name}”?`,
      body: "It's removed from every preset.",
      confirmLabel: "Remove",
      danger: true
    })
    if (!ok) return
    update((s) => ({
      ...s,
      customPlugins: s.customPlugins.filter((c) => c.id !== plugin.id),
      presets: s.presets.map((p) => {
        const { [plugin.id]: _gone, ...custom } = p.settings.custom
        return { ...p, settings: { ...p.settings, custom } }
      })
    }))
  }

  const removeIds = useCallback((ids: Set<string>) => {
    remove(ids)
    push({ tone: "info", text: `Removed ${plural(ids.size, "file")} from the list` })
  }, [remove, push])

  // ── Projects ────────────────────────────────────────────────────────────────
  // Save and open everything in the list as one .svgenius file. On the desktop
  // ⌘S saves back to the project it came from
  const [project, setProject] = useState<{ path: string | null, name: string } | null>(null)

  // Unsaved changes: only for a list that belongs to a project file. A
  // fingerprint of what the file holds is taken on open, new and save, and
  // compared with what it would hold now. Anonymous sessions skip all this
  const projectSig = useMemo(() => {
    if (!project) return ""
    const { savedAt: _s, focusId: _f, appVersion: _v, ...rest } = buildProject(settings, items, null)
    return JSON.stringify(rest)
  }, [project, settings, items])
  const [savedSig, setSavedSig] = useState<string | null>(null)
  const snapNext = useRef(false)
  useEffect(() => {
    if (!snapNext.current || !project) return
    snapNext.current = false
    setSavedSig(projectSig)
  }, [project, projectSig])
  const dirty = !!project && savedSig !== null && projectSig !== savedSig
  useEffect(() => { setUnsavedGuard(dirty) }, [dirty])
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const leaveProject = () => { setProject(null); setSavedSig(null) }

  /** Saves the project; resolves true once it's written */
  const saveProject = async (as = false): Promise<boolean> => {
    if (!items.length && !project) { push({ tone: "info", text: "Add some SVGs first, there's nothing to save yet" }); return false }
    try {
      const data = JSON.stringify(buildProject(settings, items, focusId), null, 2)
      const name = project?.name ?? `${items[0].relPath.includes("/") ? items[0].relPath.split("/")[0] : "SVGenius project"}.${PROJECT_EXT}`
      const to = await saveProjectFile(as ? null : project?.path ?? null, name, data)
      if (!to) return false
      const savedName = to.split(/[\\/]/).pop() ?? to
      snapNext.current = true
      setProject({ path: to.includes("/") || to.includes("\\") ? to : null, name: savedName })
      push({ tone: "success", text: `Saved ${savedName}` })
      return true
    } catch (e) {
      push({ tone: "error", text: `Couldn't save the project: ${errorMessage(e)}` })
      return false
    }
  }

  /** With unsaved project changes, asks first. Resolves false to stay put */
  const settleUnsaved = async (action: string): Promise<boolean> => {
    if (!dirtyRef.current || !project) return true
    const n = savedSig ? countChanges(savedSig, projectSig) : 1
    const choice = await dialogs.unsaved({
      title: `Save changes to ${project.name.replace(/\.svgenius$/i, "")}?`,
      body: `${n === 1 ? "1 change" : `${n} changes`} will be lost if you ${action} without saving.`
    })
    if (choice === null) return false
    if (choice === "save") return saveProjectRef.current()
    return true
  }
  const settleRef = useRef(settleUnsaved)
  settleRef.current = settleUnsaved

  // Quitting or closing the window with unsaved project changes
  useEffect(() => listenForQuit(() => {
    void settleRef.current("quit").then((ok) => { if (ok) quitApp() })
  }), [])

  /** Starts an empty project, saved where you choose straight away */
  const newProject = async () => {
    if (!await settleUnsaved("start a new project")) return
    if (itemsRef.current.length && !project) {
      const ok = await dialogs.confirm({
        title: "Start a new project?",
        body: `It clears the ${plural(itemsRef.current.length, "file")} in the list. Files on disk aren't touched. To keep them in a project, use Save project instead.`,
        confirmLabel: "New project"
      })
      if (!ok) return
    }
    try {
      const data = JSON.stringify(buildProject(settings, [], null), null, 2)
      const to = await saveProjectFile(null, `Untitled.${PROJECT_EXT}`, data)
      if (!to) return
      const savedName = to.split(/[\\/]/).pop() ?? to
      clear()
      setSelection(new Set())
      setFocusId(null)
      setMarkupOpen(false)
      snapNext.current = true
      setProject({ path: to.includes("/") || to.includes("\\") ? to : null, name: savedName })
      push({ tone: "success", text: `Created ${savedName}. Add some SVGs, then ⌘S saves them to it` })
    } catch (e) {
      push({ tone: "error", text: `Couldn't create the project: ${errorMessage(e)}` })
    }
  }
  const newProjectRef = useRef(newProject)
  newProjectRef.current = newProject

  const openProject = async (path?: string) => {
    try {
      if (!await settleUnsaved("open another project")) return
      const file = path ? await readProjectFile(path) : await openProjectFile()
      if (!file) return
      const { files, focusId: fid, settings: next } = readProject(file.text, settings)
      if (itemsRef.current.length && !dirtyRef.current && !project) {
        const ok = await dialogs.confirm({
          title: `Open ${file.name}?`,
          body: `It replaces the ${plural(itemsRef.current.length, "file")} in the list now. Files on disk aren't touched.`,
          confirmLabel: "Open project"
        })
        if (!ok) return
      }
      update(() => next)
      replaceAll(files)
      setSelection(new Set())
      setFocusId(fid)
      setSidebarTab(fid ? "file" : "preset")
      setMarkupOpen(false)
      snapNext.current = true
      setProject({ path: file.path, name: file.name })
      push({ tone: "success", text: `Opened ${file.name}: ${plural(files.length, "file")}` })
    } catch (e) {
      push({ tone: "error", text: `Couldn't open the project: ${errorMessage(e)}` })
    }
  }
  const openProjectRef = useRef(openProject)
  openProjectRef.current = openProject
  const saveProjectRef = useRef(saveProject)
  saveProjectRef.current = saveProject
  useCommands((cmd) => {
    if (cmd === "openProject") { openProjectRef.current(); return true }
    if (cmd === "newProject") { newProjectRef.current(); return true }
    if (cmd === "saveProject" || cmd === "saveProjectAs") { saveProjectRef.current(cmd === "saveProjectAs"); return true }
    return false
  })
  const projectMenu = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenu({
      x: r.left, y: r.bottom + 4,
      items: [
        { label: "New project…    ⌘N", run: () => newProjectRef.current() },
        { label: "Open project…    ⌘O", run: () => openProjectRef.current() },
        "-",
        { label: `Save project${project?.path ? "" : "…"}    ⌘S`, run: () => saveProjectRef.current(), disabled: !items.length && !project },
        { label: "Save project as…    ⇧⌘S", run: () => saveProjectRef.current(true), disabled: !items.length && !project },
        ...(project ? ["-" as const, { label: "Close project", run: () => void settleRef.current("close it").then((ok) => { if (ok) leaveProject() }) }] : [])
      ]
    })
  }

  const removeItems = async () => {
    if (selection.size) return removeIds(selection)
    const ok = await dialogs.confirm({ title: "Clear the list?", body: "Files on disk aren't touched.", confirmLabel: "Clear" })
    if (ok) { clear(); if (!project) setProject(null) }
  }

  // Delete / Backspace removes the selected files (not while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest("input, textarea, select, [contenteditable]") || document.querySelector(".modal")) return
      if ((e.key === "Delete" || e.key === "Backspace") && selection.size) {
        e.preventDefault()
        removeIds(selection)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selection, removeIds])

  // Right-click a row
  const rowMenu = useCallback((id: string, e: MouseEvent) => {
    e.preventDefault()
    const item = itemsRef.current.find((i) => i.id === id)
    if (!item) return
    const inSelection = selection.has(id) && selection.size > 1
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Open in editor", run: () => openMarkup(id) },
        { label: "Export optimised SVG…", run: () => exportOneRef.current(id), disabled: item.source === undefined || isBlocked(item) },
        ...(canReveal ? [
          { label: "Open in default app", run: () => openInDefaultApp(item.path) },
          { label: "Reveal in Finder", run: () => reveal(item.path) }
        ] : []),
        "-",
        { label: "Remove from list", run: () => removeIds(new Set([id])) },
        ...(inSelection ? [{ label: `Remove ${plural(selection.size, "selected file")}`, danger: true, run: () => removeIds(new Set(selection)) }] : [])
      ]
    })
  }, [itemsRef, selection, removeIds, openMarkup])

  // Settings: ⌘, from the menu or the keyboard
  useEffect(() => {
    const unlisten = listenFor("menu:settings", () => setSettingsOpen(true))
    // Check for Updates… opens About, which checks as it opens
    const unlistenUpdates = listenFor("menu:updates", () => setAboutOpen(true))
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") { e.preventDefault(); setSettingsOpen(true) }
    }
    window.addEventListener("keydown", onKey)
    return () => { unlisten(); unlistenUpdates(); window.removeEventListener("keydown", onKey) }
  }, [])

  const setViewPrefs = (patch: Partial<Pick<AppSettings, "thumbPx" | "galleryPx" | "inspectorPx" | "listCompare" | "showDetails" | "backdrop" | "checker" | "backdropColour" | "previewCss" | "previewCssEnabled" | "circleOverlay" | "circleClip">>) =>
    update((s) => ({ ...s, ...patch }))

  // ── Layout ──────────────────────────────────────────────────────────────────

  // Keep the stored width but squeeze it if the window is narrow
  const [winW, setWinW] = useState(window.innerWidth)
  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  const sidebarWidth = useMemo(() => clampSidebar(settings.sidebarWidth), [settings.sidebarWidth, winW])

  // Phone-sized windows: the sidebar becomes a drawer along the bottom, with
  // its own height (kept per device, it's about the screen, not the work)
  const narrow = winW < 760
  const [drawerH, setDrawerH] = useState(() => {
    try { const v = Number(localStorage.getItem("svgenius:drawer")); if (v > 0) return v } catch { /* unavailable */ }
    return Math.round(window.innerHeight * DRAWER.default)
  })
  useEffect(() => { try { localStorage.setItem("svgenius:drawer", String(drawerH)) } catch { /* unavailable */ } }, [drawerH])
  useEffect(() => {
    const onResize = () => setDrawerH((h) => clampDrawer(h))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const resetLayout = useCallback(() => {
    update((s) => ({ ...s, ...defaultLayout(), previewCss: s.previewCss, previewCssEnabled: s.previewCssEnabled }))
    setCssOpen(false)
    push({ tone: "info", text: "Layout reset" })
  }, [update, push])

  useEffect(() => listenFor("menu:reset-layout", resetLayout), [resetLayout])

  // ── Preview CSS ─────────────────────────────────────────────────────────────

  const [cssOpen, setCssOpen] = useState(false)
  const [appliedCss, setAppliedCss] = useState("")
  const wantedCss = settings.previewCssEnabled ? settings.previewCss : ""
  useEffect(() => {
    const t = setTimeout(() => setAppliedCss(wantedCss), 200)
    return () => clearTimeout(t)
  }, [wantedCss])

  // One preview background for the list and the editor
  const canvasBg = useMemo(() => ({
    value: { tone: settings.backdrop, checker: settings.checker, colour: settings.backdropColour } as CanvasBg,
    set: (bg: CanvasBg) => setViewPrefs({ backdrop: bg.tone, checker: bg.checker, backdropColour: bg.colour })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [settings.backdrop, settings.checker, settings.backdropColour])
  const solid = solidOf(canvasBg.value)

  const viewControls = (
    <ViewControls
      size={settings.showDetails ? settings.thumbPx : settings.galleryPx}
      sizeRange={settings.showDetails ? PREVIEW_PX.list : PREVIEW_PX.gallery}
      onSize={(px) => setViewPrefs(settings.showDetails
        ? { thumbPx: px < 0 ? PREVIEW_PX.list.default : px }
        : { galleryPx: px < 0 ? PREVIEW_PX.gallery.default : px })}
      details={settings.showDetails}
      onDetails={() => setViewPrefs({ showDetails: !settings.showDetails })}
      circle={settings.circleOverlay}
      onCircle={() => setViewPrefs({ circleOverlay: !settings.circleOverlay })}
      clip={settings.circleClip}
      onClip={() => setViewPrefs({ circleClip: !settings.circleClip })}
      cssOpen={cssOpen}
      cssActive={!!wantedCss.trim()}
      onCssToggle={() => setCssOpen((o) => !o)}
    />
  )
  // Selectors that match the original but nothing once SVGO is done with it
  const [cssWarnings, setCssWarnings] = useState<CssWarning[]>([])
  useEffect(() => {
    if (!cssOpen || !appliedCss.trim()) { setCssWarnings([]); return }
    const t = setTimeout(() => {
      const pairs = items.flatMap((i) => (i.source !== undefined && i.result && !isBlocked(i) ? [{ source: i.source, output: i.result.output }] : []))
      setCssWarnings(checkPreviewCss(appliedCss, pairs))
    }, 400)
    return () => clearTimeout(t)
  }, [cssOpen, appliedCss, items])

  const cssBar = cssOpen && (
    <PreviewCssBar
      warnings={cssWarnings}
      css={settings.previewCss}
      enabled={settings.previewCssEnabled}
      onCss={(previewCss) => setViewPrefs({ previewCss })}
      onEnabled={(previewCssEnabled) => setViewPrefs({ previewCssEnabled })}
    />
  )

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <PreviewCssContext.Provider value={appliedCss}>
    <RenderAnywayContext.Provider value={forceRender}>
    <CanvasBgContext.Provider value={canvasBg}>
      <div className={`app${narrow ? " is-narrow" : ""}${canvasBg.value.checker ? "" : " no-checker"}${canvasBg.value.colour ? " has-colour" : ""}${settings.circleOverlay ? " show-circle" : ""}${settings.circleClip ? " show-clip" : ""}`} style={{ "--panel-w": `${sidebarWidth}px`, "--drawer-h": `${drawerH}px`, "--canvas-solid": solid ?? undefined, "--circle": settings.circleColour ?? undefined, "--circle-tint": settings.circleColour ? `color-mix(in srgb, ${settings.circleColour} 22%, transparent)` : undefined } as CSSProperties}>
        <AppBar />
        <div className="workspace">
          <main className="workspace__main">
            {items.length === 0 ? (
              <EmptyState onAddFiles={addFiles} onAddFolder={addFolder} onOpenProject={() => openProjectRef.current()} />
            ) : (
              <FileList
                items={shownItems}
                total={items.length}
                query={query}
                onQuery={setQuery}
                selection={selection}
                settings={settings}
                defaultPreset={defaultPreset}
                isStale={isStale}
                onToggle={toggle}
                onRowClick={rowClick}
                // Double-click opens the editor in the advanced view only (the right-click menu always can)
                onOpenMarkup={settings.advanced ? openMarkup : noop}
                canOpen={settings.advanced}
                onExportName={(id) => { setSidebarTab("names"); setNameFlash((f) => ({ id, n: (f?.n ?? 0) + 1 })) }}
                focusId={focusId}
                onVisible={setVisibleIds}
                onSelectAll={selectAll}
                onContextMenu={rowMenu}
                onFlag={flagClick}
                filterCount={filterCount}
                sortLabel={sort.key === "added" && !sort.byFlag ? null : sortLabel}
                onSort={sortMenu}
                filtersOpen={filtersOpen}
                showFilters
                onClearFilters={() => setFilters(emptyFilters())}
                onFilters={() => setFiltersOpen((o) => !o)}
                filterBar={<FilterBar filters={filters} onChange={setFilters} shown={shownItems.length} total={items.length} usedFlags={usedFlags} />}
                tagsFor={tagsFor}
                exportNames={previewNames}
                onAddFiles={addFiles}
                onAddFolder={addFolder}
                onProjectMenu={projectMenu}
                projectName={project ? `${project.name.replace(/\.svgenius$/i, "")}${dirty ? " •" : ""}` : undefined}
                onRemove={removeItems}
                viewControls={viewControls}
                cssBar={cssBar}
              />
            )}
          </main>
          {narrow ? (
            <Divider horizontal width={drawerH} onResize={setDrawerH}
              onReset={() => setDrawerH((h) => clampDrawer(h > DRAWER.min + 20 ? DRAWER.min : window.innerHeight * DRAWER.default))} />
          ) : (
            <Divider
              width={sidebarWidth}
              onResize={(sidebarWidth) => update((s) => ({ ...s, sidebarWidth }))}
              onReset={() => update((s) => ({ ...s, sidebarWidth: SIDEBAR.default }))}
            />
          )}
          <aside className="sidebar">
            <div className="sidebar__tabs" role="tablist">
              <button role="tab" aria-selected={sidebarTab === "preset"} className={`sidebar__tab${sidebarTab === "preset" ? " is-active" : ""}`}
                onClick={() => setSidebarTab("preset")}>Config</button>
              <button role="tab" aria-selected={sidebarTab === "names"} className={`sidebar__tab${sidebarTab === "names" ? " is-active" : ""}`}
                onClick={() => setSidebarTab("names")}>File names{settings.rename.enabled && <span className="flag__dot" />}</button>
              {focused ? (
                <div role="tab" aria-selected={sidebarTab === "file"} className={`sidebar__tab sidebar__tab--file${sidebarTab === "file" ? " is-active" : ""}`}>
                  <button className="sidebar__tab-label" title={focused.path} onClick={() => setSidebarTab("file")}>{focused.name}</button>
                  <button className="sidebar__tab-close" aria-label="Close file" title="Close file"
                    onClick={() => { setFocusId(null); setSidebarTab("preset") }}><IconX width={10} height={10} /></button>
                </div>
              ) : null}
              <AdvancedToggle advanced={settings.advanced} onAdvanced={(advanced) => update((s) => ({ ...s, advanced }))} />
            </div>
            {sidebarTab === "names" ? (
              <RenamePanel rename={settings.rename} items={targets.filter((i) => i.status !== "error")} highlight={nameFlash}
                onChange={(rename) => update((s) => ({ ...s, rename }))} />
            ) : sidebarTab === "file" && focused ? (
              <FileInspector
                item={focused}
                presets={settings.presets}
                defaultPreset={defaultPreset}
                backdrop={settings.backdrop}
                previewPx={settings.inspectorPx}
                onPreviewPx={(inspectorPx) => setViewPrefs({ inspectorPx })}
                onPreset={(presetId) => setPreset([focused.id], presetId)}
                onNewPreset={() => newPresetForItem(focused)}
                onEdit={(source) => editSource(focused.id, source)}
                onRevert={() => revertSource(focused.id)}
                tags={tagsFor(focused)}
                presetName={presetFor(focused).name}
                onCustomise={() => customiseItem(focused)}
                onConfig={(fn) => { if (focused.config) setConfig(focused.id, fn(focused.config)) }}
                onSaveAsPreset={() => saveItemAsPreset(focused)}
                onUsePreset={() => setPreset([focused.id], focused.presetId)}
                customPlugins={settings.customPlugins}
                onLoadPlugin={loadPlugin}
                onRemovePlugin={removePlugin}
                advanced={settings.advanced}
                editorToolbar={settings.editorToolbar}
                markupOpen={markupOpen}
                onMarkupOpen={setMarkupOpen}
                nav={(() => {
                  // The files as listed (filters and search applied), wrapping round at the ends
                  const list = shownItems.some((i) => i.id === focused.id) ? shownItems : items
                  const at = list.findIndex((i) => i.id === focused.id)
                  return { pos: at + 1, total: list.length, go: (step: 1 | -1) => setFocusId(list[(at + step + list.length) % list.length].id) }
                })()}
                circle={{
                  on: settings.circleOverlay, clip: settings.circleClip,
                  onToggle: () => setViewPrefs({ circleOverlay: !settings.circleOverlay }),
                  onClip: () => setViewPrefs({ circleClip: !settings.circleClip })
                }}
              />
            ) : (
              <ConfigPanel
                settings={settings}
                preset={editing}
                usage={usage}
                actions={actions}
                onNew={newPreset}
                onRename={renamePreset}
                onDelete={deletePreset}
                onReset={async () => {
                  const ok = await dialogs.confirm({
                    title: `Reset “${editing.name}”?`,
                    body: "Every setting in this preset goes back to SVGO's defaults, including its rules. This can't be undone.",
                    confirmLabel: "Reset",
                    danger: true
                  })
                  if (ok) actions.reset(editing.id)
                }}
                onImport={importPresets}
                onExport={exportPresets}
                onLoadPlugin={loadPlugin}
                onRemovePlugin={removePlugin}
              />
            )}
          </aside>
        </div>
        <Footer
          items={items}
          targets={targets}
          ready={readyCount}
          failed={failedCount}
          selectionCount={selection.size}
          filtered={filterCount > 0}
          live={settings.liveUpdates}
          onLive={(liveUpdates) => update((s) => ({ ...s, liveUpdates }))}
          busy={busy}
          keepStructure={settings.keepStructure}
          onKeepStructure={(keepStructure) => update((s) => ({ ...s, keepStructure }))}
          onOptimise={async () => {
            const res = await run(targets)
            if (res.size > 0) push({ tone: "success", text: `Optimised ${plural(res.size, "file")}. Ready to export` })
          }}
          onExport={doExport}
          onReport={() => setReportOpen(true)}
          brand={<BrandBar onSettings={() => setSettingsOpen(true)} onAbout={() => setAboutOpen(true)} />}
        />
        {reportOpen && (
          <ReportDialog entries={reportEntries} selected={selection} rename={settings.rename} onClose={() => setReportOpen(false)} />
        )}
        {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
        {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}
        <UpdateNotice />
        {settingsOpen && (
          <SettingsDialog
            settings={settings}
            update={update}
            actions={actions}
            usage={usageOf}
            onDeletePreset={removePreset}
            onImport={importPresets}
            onExport={exportPresets}
            onResetLayout={resetLayout}
            onClose={() => setSettingsOpen(false)}
          />
        )}
        {dragging && <DropOverlay />}
        {dialogs.node}
        <Toasts toasts={toasts} dismiss={dismiss} />
        <FastTips />
      </div>
    </CanvasBgContext.Provider>
    </RenderAnywayContext.Provider>
    </PreviewCssContext.Provider>
  )
}
