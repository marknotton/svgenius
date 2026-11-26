import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react"
import { CanvasBgContext, solidOf, type CanvasBg } from "@marknotton/svgenius-ui/components/CanvasBackground"
import { FastTips } from "@marknotton/svgenius-ui/components/FastTips"
import { AdvancedToggle, AppBar, BrandBar } from "./components/AppBar"
import { ConfigPanel } from "@marknotton/svgenius-ui/components/ConfigPanel"
import { ContextMenu, type MenuState } from "@marknotton/svgenius-ui/components/ContextMenu"
import { useDialogs } from "@marknotton/svgenius-ui/components/Dialogs"
import { configureHost } from "@marknotton/svgenius-ui/host"
import { dpShapeFrame, type ShapeFrame } from "@marknotton/svgenius-core/shapes"
import { clampDrawer, clampSidebar, Divider, DRAWER } from "@marknotton/svgenius-ui/components/Divider"
import { DropOverlay, EmptyState } from "./components/EmptyState"
import { FileInspector } from "@marknotton/svgenius-ui/components/FileInspector"
import { FileList } from "@marknotton/svgenius-ui/components/FileList"
import { Footer } from "./components/Footer"
import { PreviewCssBar, PreviewCssContext } from "@marknotton/svgenius-ui/components/PreviewCss"
import { RenamePanel } from "@marknotton/svgenius-ui/components/RenamePanel"
import { FilterBar } from "@marknotton/svgenius-ui/components/FilterBar"
import { activeRules, createFilterRule, emptyFilters, matchesFilters, measureArt, needsMeasuring, nextFlag, isTuned, shapeOf, shapeTokens, type FilterSet } from "@marknotton/svgenius-core/filters"
import { ReportDialog } from "@marknotton/svgenius-ui/components/ReportDialog"
import { SettingsDialog } from "@marknotton/svgenius-ui/components/SettingsDialog"
import { AboutDialog } from "./components/AboutDialog"
import { UpdateNotice } from "./components/Updates"
import { setUpdateGuard } from "./lib/updates"
import { Toasts, useToasts } from "@marknotton/svgenius-ui/components/Toast"
import { ViewControls } from "@marknotton/svgenius-ui/components/ViewControls"
import { presetActions, presetById, uniqueName, useAppSettings } from "./hooks/useAppSettings"
import { useItems } from "./hooks/useItems"
import { IconX } from "@marknotton/svgenius-ui/icons"
import { planExport } from "./lib/exportPlan"
import { plural } from "@marknotton/svgenius-core/format"
import { activeCustom, buildExport, defaultLayout, hashCode, mergeImport, newId, PREVIEW_PX, runSpec, SIDEBAR } from "@marknotton/svgenius-core/settings"
import { exportNames } from "@marknotton/svgenius-core/rename"
import { fileTags } from "@marknotton/svgenius-core/tags"
import { LIVE_DEBOUNCE_MS } from "@marknotton/svgenius-core/config"
import { probePlugin } from "@marknotton/svgenius-core/optimiser"
import { canReveal, defaultAppName, isPasted, openInDefaultApp, errorMessage, exportSvgFile, exportSvgs, listenFor, listenForDrops, listenForOpenedFiles, listenForQuit, quitApp, setUnsavedGuard, openJson, openPlugin, openProjectFile, PROJECT_EXT, pickSvgs, readProjectFile, reveal, saveJson, saveProjectFile } from "./lib/platform"
import { buildProject, countChanges, readProject } from "./lib/project"
import { baseName, loadLinked, relinkFromFile, relinkFromFolders } from "./lib/links"
import { MissingBar, MissingDialog } from "./components/MissingFiles"
import { forget as forgetRecent, remember } from "./lib/recent"
import { BEFORE_AFTER_KEYS, SORT_KEYS, sortItems, sortStore, type SortState } from "@marknotton/svgenius-core/sort"
import { preloadMonaco, setEditorTheme } from "@marknotton/svgenius-ui/components/CodeEditor"
import { RenderAnywayContext } from "@marknotton/svgenius-ui/components/TooComplex"
import { isBlocked } from "@marknotton/svgenius-core/complexity"
import { checkPreviewCss, type CssWarning } from "@marknotton/svgenius-core/cssCheck"
import { useTheme } from "@marknotton/svgenius-ui/lib/theme"
import { listenForCommands, textFocus, useCommands } from "@marknotton/svgenius-ui/lib/commands"
import { useFileWatch } from "./hooks/useFileWatch"
import { AddDialog, type AddMode } from "@marknotton/svgenius-ui/components/AddDialog"
import { looksLikeSvg } from "@marknotton/svgenius-core/svgImport"
import type { AppSettings, ArtAdjust, CustomPlugin, DesignPrinciple, SmartCounts, SvgItem, SvgoSettings } from "@marknotton/svgenius-core/types"
import { buildPrinciplesExport, gridOf, IDENTITY, isIdentity, mergePrinciples, variationAdjust } from "@marknotton/svgenius-core/designPrinciples"
import { shapeMaskUrl, type GuideShape } from "@marknotton/svgenius-core/shapes"
import { Quickview } from "@marknotton/svgenius-ui/components/Quickview"
import { DesignPrinciplesDialog } from "@marknotton/svgenius-ui/components/DesignPrinciplesDialog"
import { GuideShapeContext } from "@marknotton/svgenius-ui/components/ShapeGuide"

/** Where the last page load left off: the open file and whether its editor was up */
const lastView: { focusId?: string | null, sidebarTab?: "preset" | "names" | "file", markupOpen?: boolean } = (() => {
  try { return JSON.parse(sessionStorage.getItem("svgenius:view") ?? "{}") } catch { return {} }
})()

/** The open project, across a reload: sessionStorage survives ⌘R but not a fresh launch, like the list itself */
const PROJECT_KEY = "svgenius:project"
const lastProject: { project?: { path: string | null, name: string } | null, savedSig?: string | null } = (() => {
  try { return JSON.parse(sessionStorage.getItem(PROJECT_KEY) ?? "{}") } catch { return {} }
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
  const { items, ready, itemsRef, addPaths, addPasted, remove, clear, setPreset, setFlag, editSource, revertSource, travelSource, replaceAll, setConfig, setAdjust, optimise, reloadFromDisk, forceRender, relink, lose } = useItems()
  // Once there are files, get the code editor ready before anyone opens it
  const hasItems = items.length > 0
  useEffect(() => { if (hasItems) preloadMonaco() }, [hasItems])
  const dialogs = useDialogs()
  const { toasts, push, dismiss } = useToasts()
  const actions = useMemo(() => presetActions(update), [update])

  // Show in Finder and Open in app ask first (unless "Don't ask again"), naming the app
  const skipOpenConfirm = useRef(false)
  skipOpenConfirm.current = settings.skipOpenConfirm === true
  const openExternally = useCallback(async (kind: "reveal" | "open", path: string) => {
    if (!skipOpenConfirm.current) {
      const name = path.split(/[\\/]/).pop() ?? path
      const app = kind === "reveal" ? "Finder" : await defaultAppName(path)
      const ok = await dialogs.confirm({
        title: kind === "reveal" ? "Show in Finder?" : `Open in ${app ?? "your default app"}?`,
        // One <p>, so the bold names flow inline (the body lays out its children as a column)
        body: kind === "reveal"
          ? <p>Opens Finder with <strong>{name}</strong> selected.</p>
          : <p>Opens <strong>{name}</strong> in {app ? <strong>{app}</strong> : "the app your Mac uses for SVGs"}. Changes you save there show up here.</p>,
        confirmLabel: kind === "reveal" ? "Show in Finder" : `Open in ${app ?? "app"}`,
        onDontAsk: () => update((s) => ({ ...s, skipOpenConfirm: true }))
      })
      if (!ok) return
    }
    if (kind === "reveal") reveal(path); else openInDefaultApp(path)
  }, [dialogs.confirm, update])
  useEffect(() => {
    configureHost({ adapter: { reveal: (p) => { openExternally("reveal", p) }, openInDefaultApp: (p) => { openExternally("open", p) } } })
  }, [openExternally])

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
  // ── Design principles ─────────────────────────────────────────────────────
  const principles = useMemo(() => settings.designPrinciples ?? [], [settings.designPrinciples])
  const guideShape: GuideShape = settings.guideShape ?? "circle"
  const principleById = useCallback((id: string | null | undefined): DesignPrinciple | null => (id ? principles.find((d) => d.id === id) ?? null : null), [principles])
  /** The grid, the design principle's variations and the file's own Quick Edit placement a file runs with, if any */
  const extrasFor = useCallback((item: SvgItem, s: SvgoSettings) => {
    const dp = principleById(s.designPrincipleId)
    const adjust = dp ? variationAdjust(dp, item) : IDENTITY
    const tune = item.adjust ?? IDENTITY
    if (!dp && isIdentity(adjust) && isIdentity(tune)) return null
    // Smart Sizing uses Settings › Square tolerance unless the preset sets its own
    const magicKeylines = s.magicKeylines?.enabled && s.magicKeylines.tolerance === null
      ? { ...s.magicKeylines, tolerance: settings.squareTolerance ?? 10 } : s.magicKeylines
    return { ...s, magicKeylines, grid: dp ? gridOf(dp) : null, adjust: isIdentity(adjust) ? null : adjust, tune: isIdentity(tune) ? null : tune }
  }, [principleById, settings.squareTolerance])

  /** The settings a file actually runs with: its own, or its preset's, plus its grid and tuning */
  const settingsFor = useCallback((item: SvgItem): SvgoSettings => {
    const s = item.config ?? presetFor(item).settings
    return extrasFor(item, s) ?? s
  }, [presetFor, extrasFor])
  // Per-file spec: the file's own settings or its preset's, plus any in-app edits
  const resolve = useCallback((item: SvgItem) => {
    const own = item.config ?? presetFor(item).settings
    const extra = extrasFor(item, own)
    const base = extra
      ? runSpec(extra, settings.customPlugins)
      : item.config
        ? runSpec(item.config, settings.customPlugins)
        : specs.get(presetFor(item).id) ?? runSpec(presetFor(item).settings, settings.customPlugins)
    return { ...base, key: `${base.key}|r${item.rev}` }
  }, [specs, presetFor, extrasFor, settings.customPlugins])
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
      // A handful of picks go in Recent; a big multi-select would just push everything else out
      if (paths.length <= 3) for (const p of [...paths].reverse()) remember(p)
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

  // The Add SVGs dialog: files, a folder, or pasted code
  const [adding, setAdding] = useState<{ mode: AddMode, text?: string } | null>(null)
  const addCode = (files: Array<{ name: string, svg: string }>) => {
    const ids = addPasted(files)
    setAdding(null)
    if (ids.length === 1) { setFocusId(ids[0]); setSidebarTab("file") }
    push({ tone: "success", text: files.length === 1 ? `Added ${files[0].name}` : `Added ${plural(files.length, "SVG")}` })
  }

  // ⌘V with nothing else to paste into: SVG markup on the clipboard opens straight in the dialog
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented || textFocus() || document.querySelector(".modal")) return
      const text = e.clipboardData?.getData("text/plain") ?? ""
      if (!looksLikeSvg(text)) return
      e.preventDefault()
      setAdding({ mode: "paste", text })
    }
    document.addEventListener("paste", onPaste)
    return () => document.removeEventListener("paste", onPaste)
  }, [])

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
  }, (paths) => {
    lose(paths)
    const one = paths.length === 1 ? baseName(paths[0]) : plural(paths.length, "file")
    push({ tone: "error", text: `${one} ${paths.length === 1 ? "has" : "have"} gone missing: moved, renamed or deleted`, action: { label: "Find", run: () => setMissingOpen(true) } })
  })

  // ── Missing files ───────────────────────────────────────────────────────────
  // A project's files are read from disk when it opens; any that aren't there
  // can be found again here (Adobe style) or removed
  const missingItems = useMemo(() => items.filter((i) => i.missing), [items])
  const [missingOpen, setMissingOpen] = useState(false)
  const [relinking, setRelinking] = useState(false)
  const linkedPaths = () => new Set(itemsRef.current.filter((i) => !i.missing).map((i) => i.path))
  const reportFound = (found: Array<{ id: string }>, first?: string) => {
    const left = itemsRef.current.filter((i) => i.missing).length - found.length
    const extra = first ? found.length - 1 : found.length
    const text = first
      ? `Found ${first}${extra ? `, and ${plural(extra, "other missing file")} with it` : ""}`
      : `Found ${plural(found.length, "missing file")}`
    push({ tone: "success", text: left > 0 ? `${text}. ${plural(left, "file")} still missing` : `${text}. Nothing's missing now` })
    if (left <= 0) setMissingOpen(false)
  }
  const locateFile = async (id: string) => {
    const item = itemsRef.current.find((i) => i.id === id)
    if (!item) return
    const picked = await pickSvgs("files")
    if (!picked?.length) return
    setRelinking(true)
    try {
      const found = await relinkFromFile(item, picked[0], itemsRef.current.filter((i) => i.missing), linkedPaths())
      relink(found)
      reportFound(found, baseName(picked[0]))
    } catch (e) {
      push({ tone: "error", text: errorMessage(e) })
    } finally {
      setRelinking(false)
    }
  }
  const locateFileRef = useRef(locateFile)
  locateFileRef.current = locateFile
  const locateFolder = async () => {
    const picked = await pickSvgs("folder")
    if (!picked?.length) return
    setRelinking(true)
    try {
      const found = await relinkFromFolders(picked, itemsRef.current.filter((i) => i.missing), linkedPaths())
      if (!found.length) push({ tone: "info", text: "None of the missing files are in that folder" })
      else { relink(found); reportFound(found) }
    } catch (e) {
      push({ tone: "error", text: `Couldn't search that folder: ${errorMessage(e)}` })
    } finally {
      setRelinking(false)
    }
  }

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
  const tolerance = settings.squareTolerance ?? 10
  // Shape rules and shape: search words need each artwork measured; it happens in the background
  const [measured, setMeasured] = useState(0)
  const [query, setQuery] = useState("")
  const queryShapes = useMemo(() => shapeTokens(query.trim().toLowerCase()), [query])
  useEffect(() => {
    const todo = needsMeasuring(items, filters, queryShapes.tokens.some((t) => t.by === "content"))
    if (!todo.length) return
    // Not cancelled on change: the cache is shared, and the list should catch up whenever it lands
    measureArt(todo).then((n) => { if (n) setMeasured((m) => m + 1) })
  }, [items, filters, queryShapes, measured])
  const filtered = useMemo(
    () => (filterCount ? items.filter((i) => matchesFilters(i, filters, { tolerance })) : items),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, filters, filterCount, tolerance, measured])

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
      preset: item.config ? "Custom settings" : presetFor(item).name,
      exportName: previewNames?.get(item.id) ?? all?.get(item.id),
      tags: tagsFor(item).filter((t) => t.label !== "Custom settings").map((t) => t.label),
      stale: isStale(item)
    }))
  }, [reportOpen, items, settings.rename, settingsFor, presetFor, previewNames, tagsFor, isStale])

  // Search by original or export name, plus shape:tall / vb:wide words; the rest of the list is hidden
  const usedFlags = useMemo(() => new Set(items.flatMap((i) => i.flag ? [i.flag as string] : [])), [items])
  const searched = useMemo(() => {
    const { tokens, is, rest: q } = queryShapes
    if (!q && !tokens.length && !is.length) return filtered
    return filtered.filter((i) => (!q || i.name.toLowerCase().includes(q) || i.relPath.toLowerCase().includes(q)
      || (previewNames?.get(i.id) ?? "").toLowerCase().includes(q))
      && tokens.every((t) => (shapeOf(filters.markup === "output" ? i.result?.output : i.source, t.by, tolerance) === t.shape) === t.has)
      && is.every((t) => isTuned(i) === t.has))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, queryShapes, previewNames, filters.markup, tolerance, measured])

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
        { label: tick(!sort.original, "Use optimised (After)"), run: () => setSort({ original: false }), disabled: !BEFORE_AFTER_KEYS.includes(sort.key) },
        { label: tick(sort.original, "Use original (Before)"), run: () => setSort({ original: true }), disabled: !BEFORE_AFTER_KEYS.includes(sort.key) },
        "-",
        { label: tick(sort.byFlag, "Group by flag colour"), run: () => setSort({ byFlag: !sort.byFlag }) }
      ]
    })
  }
  const sortLabel = `${SORT_KEYS.find((k) => k.value === sort.key)?.short ?? "Sort"}${sort.original && BEFORE_AFTER_KEYS.includes(sort.key) ? " (before)" : ""}${sort.key !== "added" ? (sort.desc ? " ↓" : " ↑") : ""}${sort.byFlag ? " · flags" : ""}`


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
  const doExport = async (clearAfter = false, zip = false) => {
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
      })), zip ? `Save ${plural(ready.length, "file")} as a zip` : `Export ${plural(ready.length, "file")} to…`, confirmReplace, zip)
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
  // Kept for the session, so a reload (⌘R) still knows the project and ⌘S saves straight back to it
  const [project, setProject] = useState<{ path: string | null, name: string } | null>(() => lastProject.project ?? null)

  // Unsaved changes: only for a list that belongs to a project file. A
  // fingerprint of what the file holds is taken on open, new and save, and
  // compared with what it would hold now. Anonymous sessions skip all this
  const projectSig = useMemo(() => {
    if (!project) return ""
    const { savedAt: _s, focusId: _f, appVersion: _v, ...rest } = buildProject(settings, items, null)
    return JSON.stringify(rest)
  }, [project, settings, items])
  const [savedSig, setSavedSig] = useState<string | null>(() => lastProject.savedSig ?? null)
  useEffect(() => {
    try { sessionStorage.setItem(PROJECT_KEY, JSON.stringify({ project, savedSig })) }
    catch { try { sessionStorage.setItem(PROJECT_KEY, JSON.stringify({ project, savedSig: null })) } catch { /* unavailable */ } }
  }, [project, savedSig])
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
  const saving = useRef(false)
  const saveProject = async (as = false): Promise<boolean> => {
    if (!items.length && !project) { push({ tone: "info", text: "Add some SVGs first, there's nothing to save yet" }); return false }
    // One at a time: a second ⌘S while the first is still going would open a second dialog
    if (saving.current) return false
    saving.current = true
    try {
      // Each file's path relative to where the project lands goes in too
      const data = (to: string | null) => JSON.stringify(buildProject(settings, items, focusId, { projectPath: to }), null, 2)
      const name = project?.name ?? `${items[0].relPath.includes("/") ? items[0].relPath.split("/")[0] : "SVGenius project"}.${PROJECT_EXT}`
      const to = await saveProjectFile(as ? null : project?.path ?? null, name, data)
      if (!to) return false
      const savedName = to.split(/[\\/]/).pop() ?? to
      snapNext.current = true
      setProject({ path: to.includes("/") || to.includes("\\") ? to : null, name: savedName })
      remember(to, "project")
      push({ tone: "success", text: `Saved ${savedName}` })
      return true
    } catch (e) {
      push({ tone: "error", text: `Couldn't save the project: ${errorMessage(e)}` })
      return false
    } finally {
      saving.current = false
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

  // Updating restarts the app, so it asks the same question before downloading
  useEffect(() => setUpdateGuard(() => settleRef.current("update SVGenius")), [])

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
      remember(to, "project")
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
      const { files: listed, rels, focusId: fid, settings: next } = readProject(file.text, settings)
      if (itemsRef.current.length && !dirtyRef.current && !project) {
        const ok = await dialogs.confirm({
          title: `Open ${file.name}?`,
          body: `It replaces the ${plural(itemsRef.current.length, "file")} in the list now. Files on disk aren't touched.`,
          confirmLabel: "Open project"
        })
        if (!ok) return
      }
      // The SVGs live on disk, so read them in now
      const files = await loadLinked(listed, file.path, rels)
      update(() => next)
      replaceAll(files)
      setSelection(new Set())
      setFocusId(fid)
      setSidebarTab(fid ? "file" : "preset")
      setMarkupOpen(false)
      snapNext.current = true
      setProject({ path: file.path, name: file.name })
      if (file.path) remember(file.path, "project")
      const lost = files.filter((f) => f.missing).length
      if (lost) push({ tone: "error", text: `Opened ${file.name}: ${plural(files.length, "file")}, ${lost} missing`, action: { label: "Find", run: () => setMissingOpen(true) } })
      else push({ tone: "success", text: `Opened ${file.name}: ${plural(files.length, "file")}` })
    } catch (e) {
      if (path) forgetRecent(path)
      push({ tone: "error", text: `Couldn't open the project: ${errorMessage(e)}` })
    }
  }
  const openProjectRef = useRef(openProject)
  openProjectRef.current = openProject
  const saveProjectRef = useRef(saveProject)
  saveProjectRef.current = saveProject
  useCommands((cmd) => {
    if (cmd === "openProject") { openProjectRef.current(); return true }
    if (cmd === "addSvgs") { if (!document.querySelector(".modal")) setAdding({ mode: "choose" }); return true }
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
        { label: "Quick Edit    Space", run: () => openQuickviewRef.current(id), disabled: item.source === undefined },
        { label: "Export optimised SVG…", run: () => exportOneRef.current(id), disabled: item.source === undefined || isBlocked(item) },
        ...(canReveal && !isPasted(item.path) ? [
          { label: "Open in default app…", run: () => openExternally("open", item.path) },
          { label: "Reveal in Finder…", run: () => openExternally("reveal", item.path) }
        ] : []),
        ...(item.missing ? [{ label: "Locate file…", run: () => { void locateFileRef.current(id) } }] : []),
        "-",
        { label: "Remove from list", run: () => removeIds(new Set([id])) },
        ...(inSelection ? [{ label: `Remove ${plural(selection.size, "selected file")}`, danger: true, run: () => removeIds(new Set(selection)) }] : [])
      ]
    })
  }, [itemsRef, selection, removeIds, openMarkup, openExternally])

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
      shape={guideShape}
      onShape={(guideShape) => update((s) => ({ ...s, guideShape }))}
      onQuickview={() => openQuickview()}
      guides={settings.listGuides === true}
      onGuides={principles.length ? () => update((s) => ({ ...s, listGuides: !s.listGuides })) : undefined}
      alignment={settings.listAlignment !== false}
      onAlignment={principles.some((d) => d.alignmentKeylines?.length) ? () => update((s) => ({ ...s, listAlignment: s.listAlignment === false })) : undefined}
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

  // ── Quick Edit and design principles ────────────────────────────────────────

  const [quickviewId, setQuickviewId] = useState<string | null>(null)
  const [principlesOpen, setPrinciplesOpen] = useState<{ id: string | null } | null>(null)
  // Pages through the selected files, or else everything listed
  const quickviewItems = useMemo(() => {
    const list = selection.size > 1 ? shownItems.filter((i) => selection.has(i.id)) : shownItems
    return list.filter((i) => i.source !== undefined)
  }, [selection, shownItems])
  const openQuickview = useCallback((id?: string) => {
    const list = quickviewItems
    if (!list.length) { push({ tone: "info", text: "Add some SVGs first" }); return }
    const start = [id, focusIdRef.current].find((x) => x && list.some((i) => i.id === x)) ?? list[0].id
    setMenu(null)
    setQuickviewId(start)
  }, [quickviewItems, push])
  const openQuickviewRef = useRef(openQuickview)
  openQuickviewRef.current = openQuickview
  // Space opens it, like Quick Look
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      const t = e.target as HTMLElement
      if (t.closest("input, textarea, select, button, [contenteditable], .monaco-editor") || document.querySelector(".modal")) return
      e.preventDefault()
      openQuickviewRef.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  const ownSettings = useCallback((item: SvgItem) => item.config ?? presetFor(item).settings, [presetFor])
  const quickviewBase = useCallback((item: SvgItem): ArtAdjust => {
    const dp = principleById(ownSettings(item).designPrincipleId)
    return dp ? variationAdjust(dp, item) : IDENTITY
  }, [principleById, ownSettings])
  /** What a file's preset does to its placement, for Quick Edit to show */
  const presetNotes = useCallback((item: SvgItem) => {
    const s = ownSettings(item), t = s.trim, notes: string[] = []
    const dp = principleById(s.designPrincipleId)
    const m = item.result?.magic
    if (dp && s.magicKeylines?.enabled) notes.push(m
      ? `Smart Sizing${m.rule ? `, ${m.ruleGroup ? `${m.ruleGroup} rule` : "all-shapes rule"} ${m.rule} (${m.ruleText})` : ""}: ${m.group} artwork, fitted to ${m.keyline === "canvas" ? "the whole viewBox" : `${dp.name}'s ${m.keyline === "live" ? "live area" : `${m.keyline} keyline`}`}, ${m.fit === "contain" ? "fit inside" : m.fit === "stretch" ? "stretched to fill it" : `fit ${m.fit}`}`
      : `Smart Sizing: fitted to ${dp.name}'s keyline for its shape`)
    else if (dp && dp.fit !== "none") notes.push(`Fitted to ${dp.name} (${dp.fit === "keylines" ? "its keylines" : dp.fit === "contain" ? "its live area" : "centred"})`)
    if (t.artUnit === "px" && t.artSizePx) notes.push(`Artwork ${t.artSide === "width" ? "width" : "height"} set to ${t.artSizePx}`)
    else if (t.artScale !== 1) notes.push(`Artwork scaled ×${+t.artScale.toFixed(4)}`)
    if (t.offsetX || t.offsetY) notes.push(`Artwork moved ${+t.offsetX.toFixed(2)}% across, ${+t.offsetY.toFixed(2)}% down`)
    if (t.enabled) notes.push(`Trimmed to the artwork with ${t.padding}${t.unit === "%" ? "%" : ""}  padding, which sets the canvas`)
    if (s.opticalCentre) notes.push("Optically centred")
    return notes
  }, [ownSettings, principleById])
  const openQuickEditRow = useCallback((id: string) => openQuickviewRef.current(id), [])
  // Smart Sizing: the edited preset's files in each shape group, from their last run
  const smartCounts = useMemo(() => {
    if (!editing.settings.magicKeylines?.enabled) return undefined
    const c: SmartCounts = { square: [], tall: [], wide: [], rules: [], groupRules: { square: [], tall: [], wide: [] } }
    // In the order the list shows them, so stepping through goes down the list (hidden files last)
    const at = new Map(shownItems.map((i, n) => [i.id, n]))
    const order = [...items].sort((a, b) => (at.get(a.id) ?? Infinity) - (at.get(b.id) ?? Infinity))
    for (const i of order) {
      const m = i.config || presetFor(i).id !== editing.id ? undefined : i.result?.magic
      if (!m) continue
      const list = m.ruleGroup ? c.groupRules[m.ruleGroup] : c.rules
      if (m.rule) (list[m.rule - 1] ??= []).push(i.id)
      else c[m.group].push(i.id)
    }
    return c
  }, [items, shownItems, editing, presetFor])
  // Smart Sizing › step through a rule's files: scroll the list to the row and flash it
  const revealItem = useCallback((id: string) => {
    const row = document.querySelector<HTMLElement>(`.file-list [data-id="${CSS.escape(id)}"]`)
    if (!row) {
      const name = items.find((i) => i.id === id)?.name ?? "That file"
      push({ tone: "info", text: `${name} is hidden by the search or filters`, action: { label: "Show all", run: () => { setQuery(""); setFilters(emptyFilters()) } } })
      return
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    row.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" })
    row.classList.remove("is-located")
    void row.offsetWidth // restart the flash
    row.classList.add("is-located")
    window.setTimeout(() => row.classList.remove("is-located"), 900)
  }, [items, push])
  // Shape guide and clip: fitted to the design principle's live area,
  // when the preset puts files on its canvas (frames are cached, so previews keep the same object between renders)
  const frames = useMemo(() => {
    const m = new Map<string, ShapeFrame>()
    for (const d of principles) {
      m.set(`${d.id}:live`, dpShapeFrame(d))
      m.set(`${d.id}:canvas`, dpShapeFrame(d, { w: d.width, h: d.height }))
      for (const k of d.keylines) if (!m.has(`${d.id}:${k.kind}`)) m.set(`${d.id}:${k.kind}`, dpShapeFrame(d, k))
    }
    return m
  }, [principles])
  // Always the live area: the shape's height matches it (Mark's call, over the chosen keyline)
  const frameFor = useCallback((item: SvgItem) => {
    const s = ownSettings(item)
    const dp = principleById(s.designPrincipleId)
    if (!dp || s.trim.enabled || (dp.fit === "none" && !s.magicKeylines?.enabled)) return null
    return frames.get(`${dp.id}:live`) ?? null
  }, [principleById, frames, ownSettings])
  // List thumbnails: each file's own preset's design principle, when the toggle is on
  const listGuidesFor = useCallback((item: SvgItem) => principleById(ownSettings(item).designPrincipleId), [principleById, ownSettings])
  const quickviewPrinciple = useCallback((item: SvgItem) => {
    const choice = settings.quickviewDpId ?? null
    if (choice === "none") return null
    return choice ? principleById(choice) : principleById(ownSettings(item).designPrincipleId)
  }, [settings.quickviewDpId, principleById, ownSettings])

  const exportPrinciples = async (list: DesignPrinciple[]) => {
    try {
      const name = list.length === 1 ? `${list[0].name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "design-principle"}.json` : "svgenius-design-principles.json"
      const ok = await saveJson(name, JSON.stringify(buildPrinciplesExport(list), null, 2))
      if (ok) push({ tone: "success", text: `Exported ${list.length === 1 ? list[0].name : plural(list.length, "design principle")}` })
    } catch (e) {
      push({ tone: "error", text: `Couldn't export: ${errorMessage(e)}` })
    }
  }
  const importPrinciples = async () => {
    try {
      const text = await openJson()
      if (text === null) return
      let raw: unknown
      try { raw = JSON.parse(text) } catch { throw new Error("That file isn't valid JSON") }
      const { next, added, updated } = mergePrinciples(settings.designPrinciples ?? [], raw)
      update((s) => ({ ...s, designPrinciples: next }))
      push({ tone: "success", text: `Imported ${[added && `${plural(added, "design principle")} added`, updated && `${updated} updated`].filter(Boolean).join(", ")}` })
    } catch (e) {
      push({ tone: "error", text: `Couldn't import: ${errorMessage(e)}` })
    }
  }
  const principleUsage = useCallback((id: string) => settings.presets.filter((p) => p.settings.designPrincipleId === id).length, [settings.presets])
  const managePrinciples = useCallback((id?: string | null) => { setSettingsOpen(false); setPrinciplesOpen({ id: id ?? null }) }, [])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <PreviewCssContext.Provider value={appliedCss}>
    <RenderAnywayContext.Provider value={forceRender}>
    <CanvasBgContext.Provider value={canvasBg}>
    <GuideShapeContext.Provider value={guideShape}>
      <div className={`app${guideShape !== "circle" ? " has-shape-mask" : ""}${narrow ? " is-narrow" : ""}${canvasBg.value.checker ? "" : " no-checker"}${canvasBg.value.colour ? " has-colour" : ""}${settings.circleOverlay ? " show-circle" : ""}${settings.circleClip ? " show-clip" : ""}`} style={{ "--panel-w": `${sidebarWidth}px`, "--drawer-h": `${drawerH}px`, "--canvas-solid": solid ?? undefined, "--circle": settings.circleColour ?? undefined, "--circle-tint": settings.circleColour ? `color-mix(in srgb, ${settings.circleColour} 22%, transparent)` : undefined, "--shape-mask": guideShape !== "circle" ? shapeMaskUrl(guideShape) : undefined } as CSSProperties}>
        <AppBar />
        <div className="workspace">
          <main className="workspace__main">
            {items.length === 0 ? (
              <EmptyState onAddFiles={addFiles} onAddFolder={addFolder} onPaste={() => setAdding({ mode: "paste" })} onOpenProject={() => openProjectRef.current()}
                onOpenRecent={(r) => (r.kind === "project" ? openProjectRef.current(r.path) : add([r.path]))} />
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
                onFilters={() => {
                  // Opening with no rules starts one, so there's something to fill in straight away
                  if (!filtersOpen && filters.rules.length === 0) setFilters((f) => ({ ...f, rules: [createFilterRule()] }))
                  setFiltersOpen((o) => !o)
                }}
                filterBar={<FilterBar filters={filters} onChange={setFilters} shown={shownItems.length} total={items.length} usedFlags={usedFlags} />}
                tagsFor={tagsFor}
                guidesFor={settings.listGuides ? listGuidesFor : undefined}
                alignmentGuides={settings.listAlignment !== false}
                frameFor={frameFor}
                checkerFor={listGuidesFor}
                onEdit={openMarkup}
                onQuickEdit={openQuickEditRow}
                exportNames={previewNames}
                onAdd={() => setAdding({ mode: "choose" })}
                onProjectMenu={projectMenu}
                projectName={project ? `${project.name.replace(/\.svgenius$/i, "")}${dirty ? " •" : ""}` : undefined}
                onRemove={removeItems}
                viewControls={viewControls}
                cssBar={<>
                  {missingItems.length > 0 && (
                    <MissingBar count={missingItems.length} standIns={missingItems.filter((i) => i.source !== undefined).length} onOpen={() => setMissingOpen(true)} />
                  )}
                  {cssBar}
                </>}
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
          {/* Until there are files, the settings are there to look at, not to change. Advanced still toggles */}
          <aside className={`sidebar${items.length ? "" : " is-idle"}`}>
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
                frame={frameFor(focused)}
                principle={listGuidesFor(focused)}
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
                onRevertConfig={(next, what) => {
                  const id = focused.id, before = focused.config
                  if (next) setConfig(id, next); else setPreset([id], focused.presetId)
                  if (before) push({ tone: "info", text: what, action: { label: "Undo", run: () => setConfig(id, before) } })
                }}
                customPlugins={settings.customPlugins}
                onLoadPlugin={loadPlugin}
                onRemovePlugin={removePlugin}
                designPrinciples={principles}
                onManagePrinciples={() => managePrinciples(focused.config?.designPrincipleId)}
                squareTolerance={settings.squareTolerance}
                advanced={settings.advanced}
                editorToolbar={settings.editorToolbar}
                markupOpen={markupOpen}
                onMarkupOpen={setMarkupOpen}
                onQuickEdit={(id) => { setMarkupOpen(false); openQuickviewRef.current(id) }}
                nav={(() => {
                  // The files as listed (filters and search applied), wrapping round at the ends
                  const list = shownItems.some((i) => i.id === focused.id) ? shownItems : items
                  const at = list.findIndex((i) => i.id === focused.id)
                  return { pos: at + 1, total: list.length, go: (step: 1 | -1) => setFocusId(list[(at + step + list.length) % list.length].id) }
                })()}
                circle={{
                  on: settings.circleOverlay, clip: settings.circleClip,
                  onToggle: () => setViewPrefs({ circleOverlay: !settings.circleOverlay }),
                  onClip: () => setViewPrefs({ circleClip: !settings.circleClip }),
                  onShape: (guideShape) => update((s) => ({ ...s, guideShape }))
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
                onManagePrinciples={() => managePrinciples(editing.settings.designPrincipleId)}
                smartCounts={smartCounts} onRevealFile={revealItem}
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
            onDesignPrinciples={() => managePrinciples()}
          />
        )}
        {adding && (
          <AddDialog mode={adding.mode} text={adding.text} backdrop={settings.backdrop} taken={items.map((i) => i.relPath)}
            onFiles={addFiles} onFolder={addFolder} onAdd={addCode} onClose={() => setAdding(null)} />
        )}
        {missingOpen && (
          <MissingDialog items={missingItems} busy={relinking} onLocateFile={(id) => void locateFile(id)} onLocateFolder={() => void locateFolder()}
            onRemove={(ids) => removeIds(new Set(ids))} onClose={() => setMissingOpen(false)} />
        )}
        {dragging && <DropOverlay />}
        <Toasts toasts={toasts} dismiss={dismiss} />
        {quickviewId && (
          <Quickview
            items={quickviewItems}
            startId={quickviewId}
            backdrop={settings.backdrop}
            baseFor={quickviewBase}
            presetNotesFor={presetNotes}
            onFullEdit={(id) => { setQuickviewId(null); setFocusId(id); setMarkupOpen(true) }}
            principleFor={quickviewPrinciple}
            principles={principles}
            principleChoice={settings.quickviewDpId ?? null}
            onPrincipleChoice={(quickviewDpId) => update((s) => ({ ...s, quickviewDpId }))}
            onManagePrinciples={() => setPrinciplesOpen({ id: settings.quickviewDpId && settings.quickviewDpId !== "none" ? settings.quickviewDpId : null })}
            onAdjust={setAdjust}
            onRun={(id) => { optimise([id], resolve) }}
            onRunMany={(ids) => { optimise(ids, resolve) }}
            selectionScope={selection.size > 1}
            confirm={dialogs.confirm}
            overlay={settings.circleOverlay ? guideShape : null}
            onOverlay={(shape) => update((s) => (shape ? { ...s, circleOverlay: true, guideShape: shape } : { ...s, circleOverlay: false }))}
            clip={settings.circleClip}
            onClip={(circleClip) => update((s) => ({ ...s, circleClip }))}
            guides={settings.quickviewGuides !== false}
            onGuides={(quickviewGuides) => update((s) => ({ ...s, quickviewGuides }))}
            step={settings.quickviewStep ?? 1}
            onStep={(quickviewStep) => update((s) => ({ ...s, quickviewStep }))}
            notify={(text, tone = "info") => push({ tone, text })}
            onClose={(lastId) => { setQuickviewId(null); setFocusId(lastId) }}
          />
        )}
        {principlesOpen && (
          <DesignPrinciplesDialog
            principles={principles}
            onChange={(designPrinciples) => update((s) => ({ ...s, designPrinciples }))}
            usage={principleUsage}
            files={items}
            initialId={principlesOpen.id}
            onImport={importPrinciples}
            onExport={exportPrinciples}
            onClose={() => setPrinciplesOpen(null)}
          />
        )}
        {/* Last, so confirmations sit above Quick Edit and the other dialogs */}
        {dialogs.node}
        <FastTips />
      </div>
    </GuideShapeContext.Provider>
    </CanvasBgContext.Provider>
    </RenderAnywayContext.Provider>
    </PreviewCssContext.Provider>
  )
}
