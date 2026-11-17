import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react"
import { listen } from "@tauri-apps/api/event"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { open, save } from "@tauri-apps/plugin-dialog"
import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { AppBar } from "./components/AppBar"
import { ConfigPanel } from "./components/ConfigPanel"
import { ContextMenu, type MenuState } from "./components/ContextMenu"
import { useDialogs } from "./components/Dialogs"
import { clampSidebar, Divider } from "./components/Divider"
import { DropOverlay, EmptyState } from "./components/EmptyState"
import { FileInspector } from "./components/FileInspector"
import { FileList } from "./components/FileList"
import { Footer } from "./components/Footer"
import { PreviewCssBar, PreviewCssContext } from "./components/PreviewCss"
import { SettingsDialog } from "./components/SettingsDialog"
import { Toasts, useToasts } from "./components/Toast"
import { ViewControls } from "./components/ViewControls"
import { presetActions, presetById, uniqueName, useAppSettings } from "./hooks/useAppSettings"
import { useItems } from "./hooks/useItems"
import { planExport } from "./lib/exportPlan"
import { plural } from "./lib/format"
import { activeCustom, buildExport, defaultLayout, hashCode, mergeImport, newId, PREVIEW_PX, runSpec, SIDEBAR } from "./lib/settings"
import { fileTags } from "./lib/tags"
import { LIVE_DEBOUNCE_MS } from "./lib/config"
import { probePlugin } from "./lib/optimiser"
import { errorMessage, existingFiles, exportFiles, readJsonFile, readPluginFile, takePendingOpenFiles, writeJsonFile } from "./lib/tauri"
import type { AppSettings, CustomPlugin, SvgItem, SvgoSettings } from "./lib/types"

export default function App() {
  const { settings, update, loadError } = useAppSettings()
  if (!settings) return <div className="app app--loading"><span className="spinner" /></div>
  return <Workspace settings={settings} update={update} loadError={loadError} />
}

interface WorkspaceProps {
  settings: AppSettings
  update: (fn: (s: AppSettings) => AppSettings) => void
  loadError: string | null
}

function Workspace({ settings, update, loadError }: WorkspaceProps) {
  const { items, itemsRef, addPaths, remove, clear, setPreset, editSource, revertSource, setConfig, optimise } = useItems()
  const dialogs = useDialogs()
  const { toasts, push, dismiss } = useToasts()
  const actions = useMemo(() => presetActions(update), [update])

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const anchor = useRef<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [sidebarTab, setSidebarTab] = useState<"preset" | "file">("preset")
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

  const add = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return
    try {
      const n = await addPaths(paths)
      if (n === 0) push({ tone: "info", text: "No new SVGs found there" })
    } catch (e) {
      push({ tone: "error", text: errorMessage(e) })
    }
  }, [addPaths, push])

  const addFiles = async () => {
    const picked = await open({ multiple: true, filters: [{ name: "SVG", extensions: ["svg"] }] })
    if (picked) add(Array.isArray(picked) ? picked : [picked])
  }

  const addFolder = async () => {
    const picked = await open({ directory: true, multiple: true })
    if (picked) add(Array.isArray(picked) ? picked : [picked])
  }

  // Native drag and drop gives us real paths
  useEffect(() => {
    let unlisten: (() => void) | undefined
    getCurrentWebviewWindow()
      .onDragDropEvent((e) => {
        if (e.payload.type === "enter" || e.payload.type === "over") setDragging(true)
        else if (e.payload.type === "leave") setDragging(false)
        else if (e.payload.type === "drop") {
          setDragging(false)
          add(e.payload.paths)
        }
      })
      .then((fn) => { unlisten = fn })
      .catch(() => {})
    return () => unlisten?.()
  }, [add])

  // Finder "Open With", including cold launches
  useEffect(() => {
    let unlisten: (() => void) | undefined
    takePendingOpenFiles().then(add).catch(() => {})
    listen<string[]>("files:opened", (e) => add(e.payload)).then((fn) => { unlisten = fn }).catch(() => {})
    return () => unlisten?.()
  }, [add])

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

  /** Plain click selects just this row and opens it in the inspector */
  const rowClick = useCallback((id: string, e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return toggle(id, e)
    setSelection(new Set([id]))
    anchor.current = id
    setFocusId(id)
    setSidebarTab("file")
  }, [toggle])

  const selectAll = (all: boolean) => setSelection(all ? new Set(items.map((i) => i.id)) : new Set())

  const targets = selection.size ? items.filter((i) => selection.has(i.id)) : items

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
    if (i.source === undefined || i.status === "loading" || i.status === "running") return false
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
    if (focusId && !focused) { setFocusId(null); setSidebarTab("preset") }
  }, [focusId, focused])

  // ── Export ──────────────────────────────────────────────────────────────────

  const isFresh = useCallback((i: SvgItem) => !!i.result && i.result.key === resolve(i).key && i.status !== "running", [resolve])
  const readyCount = targets.filter(isFresh).length
  const failedCount = targets.filter((i) => i.status === "error").length

  // Export writes the results already on screen; the footer only enables it
  // once every target is up to date
  const doExport = async () => {
    const list = targets
    const ready = list.filter(isFresh)
    const results = new Map(ready.map((i) => [i.id, i.result]))
    if (ready.length === 0) {
      push({ tone: "error", text: "Nothing to export. Check the files for errors." })
      return
    }
    const outDir = await open({ directory: true, title: `Export ${plural(ready.length, "file")} to…` })
    if (typeof outDir !== "string") return

    const plan = planExport(ready, settings.keepStructure)
    try {
      const clashes = await existingFiles(outDir, plan.map((x) => x.relPath))
      if (clashes.length > 0) {
        const ok = await dialogs.confirm({
          title: `Replace ${plural(clashes.length, "file")}?`,
          body: <>
            <p>These already exist in the export folder and will be overwritten:</p>
            <ul className="modal__list">{clashes.slice(0, 6).map((c) => <li key={c}>{c}</li>)}</ul>
            {clashes.length > 6 && <p className="text-2">…and {clashes.length - 6} more</p>}
          </>,
          confirmLabel: "Replace",
          danger: true
        })
        if (!ok) return
      }
      setBusy(true)
      const written = await exportFiles(outDir, plan.map(({ item, relPath }) => ({
        relPath,
        contents: (results.get(item.id)?.output) ?? ""
      })))
      const skipped = list.length - ready.length
      push({
        tone: "success",
        text: `Exported ${plural(written.length, "file")}${skipped ? `, skipped ${skipped} with errors` : ""}`,
        action: written[0] ? { label: "Show in Finder", run: () => { revealItemInDir(written[0]).catch(() => {}) } } : undefined
      })
    } catch (e) {
      push({ tone: "error", text: `Export failed: ${errorMessage(e)}` })
    } finally {
      setBusy(false)
    }
  }

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
    const path = await open({ filters: [{ name: "SVGenius settings", extensions: ["json"] }] })
    if (typeof path !== "string") return
    try {
      const { next, added, updated } = mergeImport(settings, JSON.parse(await readJsonFile(path)))
      update(() => next)
      push({ tone: "success", text: `Imported presets: ${added} added, ${updated} updated` })
    } catch (e) {
      push({ tone: "error", text: `Import failed: ${errorMessage(e)}` })
    }
  }

  const exportPresets = async () => {
    const path = await save({ defaultPath: "svgenius-presets.json", filters: [{ name: "JSON", extensions: ["json"] }] })
    if (!path) return
    try {
      await writeJsonFile(path, JSON.stringify(buildExport(settings), null, 2))
      push({ tone: "success", text: `Exported ${plural(settings.presets.length, "preset")}` })
    } catch (e) {
      push({ tone: "error", text: `Export failed: ${errorMessage(e)}` })
    }
  }

  // ── Custom plugins ──────────────────────────────────────────────────────────

  const loadPlugin = async () => {
    const path = await open({ filters: [{ name: "SVGO plugin", extensions: ["js", "mjs"] }] })
    if (typeof path !== "string") return
    try {
      const { fileName, code } = await readPluginFile(path)
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

  const removeItems = async () => {
    if (selection.size) return removeIds(selection)
    const ok = await dialogs.confirm({ title: "Clear the list?", body: "Files on disk aren't touched.", confirmLabel: "Clear" })
    if (ok) clear()
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
        { label: "Inspect", run: () => { setSelection(new Set([id])); setFocusId(id); setSidebarTab("file") } },
        { label: "Reveal in Finder", run: () => { revealItemInDir(item.path).catch(() => {}) } },
        "-",
        { label: "Remove from list", run: () => removeIds(new Set([id])) },
        ...(inSelection ? [{ label: `Remove ${plural(selection.size, "selected file")}`, danger: true, run: () => removeIds(new Set(selection)) }] : [])
      ]
    })
  }, [itemsRef, selection, removeIds])

  // Settings: ⌘, from the menu or the keyboard
  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen("menu:settings", () => setSettingsOpen(true)).then((fn) => { unlisten = fn }).catch(() => {})
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") { e.preventDefault(); setSettingsOpen(true) }
    }
    window.addEventListener("keydown", onKey)
    return () => { unlisten?.(); window.removeEventListener("keydown", onKey) }
  }, [])

  const setViewPrefs = (patch: Partial<Pick<AppSettings, "thumbPx" | "inspectorPx" | "listCompare" | "showDetails" | "backdrop" | "previewCss" | "previewCssEnabled" | "circleOverlay" | "circleClip">>) =>
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

  const resetLayout = useCallback(() => {
    update((s) => ({ ...s, ...defaultLayout(), previewCss: s.previewCss, previewCssEnabled: s.previewCssEnabled }))
    setCssOpen(false)
    push({ tone: "info", text: "Layout reset" })
  }, [update, push])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen("menu:reset-layout", resetLayout).then((fn) => { unlisten = fn }).catch(() => {})
    return () => unlisten?.()
  }, [resetLayout])

  // ── Preview CSS ─────────────────────────────────────────────────────────────

  const [cssOpen, setCssOpen] = useState(false)
  const [appliedCss, setAppliedCss] = useState("")
  const wantedCss = settings.previewCssEnabled ? settings.previewCss : ""
  useEffect(() => {
    const t = setTimeout(() => setAppliedCss(wantedCss), 200)
    return () => clearTimeout(t)
  }, [wantedCss])

  const viewControls = (
    <ViewControls
      size={settings.thumbPx}
      sizeRange={PREVIEW_PX.list}
      onSize={(px) => setViewPrefs({ thumbPx: px < 0 ? PREVIEW_PX.list.default : px })}
      compare={settings.listCompare}
      onCompare={() => setViewPrefs({ listCompare: !settings.listCompare })}
      details={settings.showDetails}
      onDetails={() => setViewPrefs({ showDetails: !settings.showDetails })}
      backdrop={settings.backdrop}
      onBackdrop={(backdrop) => setViewPrefs({ backdrop })}
      circle={settings.circleOverlay}
      onCircle={() => setViewPrefs({ circleOverlay: !settings.circleOverlay })}
      clip={settings.circleClip}
      onClip={() => setViewPrefs({ circleClip: !settings.circleClip })}
      cssOpen={cssOpen}
      cssActive={!!wantedCss.trim()}
      onCssToggle={() => setCssOpen((o) => !o)}
    />
  )
  const cssBar = cssOpen && (
    <PreviewCssBar
      css={settings.previewCss}
      enabled={settings.previewCssEnabled}
      onCss={(previewCss) => setViewPrefs({ previewCss })}
      onEnabled={(previewCssEnabled) => setViewPrefs({ previewCssEnabled })}
    />
  )

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <PreviewCssContext.Provider value={appliedCss}>
      <div className={`app${settings.circleOverlay ? " show-circle" : ""}${settings.circleClip ? " show-clip" : ""}`} style={{ "--panel-w": `${sidebarWidth}px` } as CSSProperties}>
        <AppBar onSettings={() => setSettingsOpen(true)} />
        <div className="workspace">
          <main className="workspace__main">
            {items.length === 0 ? (
              <EmptyState onAddFiles={addFiles} onAddFolder={addFolder} />
            ) : (
              <FileList
                items={items}
                selection={selection}
                settings={settings}
                defaultPreset={defaultPreset}
                isStale={isStale}
                onToggle={toggle}
                onRowClick={rowClick}
                focusId={focusId}
                onVisible={setVisibleIds}
                liveToggle={
                  <label className="footer__check" title="Re-run files on screen as you change settings">
                    <input type="checkbox" className="checkbox" checked={settings.liveUpdates}
                      onChange={(e) => update((s) => ({ ...s, liveUpdates: e.target.checked }))} />
                    Live
                  </label>
                }
                onSelectAll={selectAll}
                onPreset={(id, presetId) => setPreset([id], presetId)}
                onNewPreset={newPresetForItem}
                onContextMenu={rowMenu}
                tagsFor={tagsFor}
                onAddFiles={addFiles}
                onAddFolder={addFolder}
                onRemove={removeItems}
                viewControls={viewControls}
                cssBar={cssBar}
              />
            )}
          </main>
          <Divider
            width={sidebarWidth}
            onResize={(sidebarWidth) => update((s) => ({ ...s, sidebarWidth }))}
            onReset={() => update((s) => ({ ...s, sidebarWidth: SIDEBAR.default }))}
          />
          <aside className="sidebar">
            <div className="sidebar__tabs" role="tablist">
              <button role="tab" aria-selected={sidebarTab === "preset"} className={`sidebar__tab${sidebarTab === "preset" ? " is-active" : ""}`}
                onClick={() => setSidebarTab("preset")}>Preset</button>
              <button role="tab" aria-selected={sidebarTab === "file"} className={`sidebar__tab${sidebarTab === "file" ? " is-active" : ""}`}
                disabled={!focused} title={focused ? focused.name : "Click a file to inspect it"}
                onClick={() => setSidebarTab("file")}>{focused ? focused.name : "File"}</button>
            </div>
            {sidebarTab === "file" && focused ? (
              <FileInspector
                item={focused}
                presets={settings.presets}
                defaultPreset={defaultPreset}
                backdrop={settings.backdrop}
                previewPx={settings.inspectorPx}
                onPreviewPx={(inspectorPx) => setViewPrefs({ inspectorPx })}
                onClose={() => { setFocusId(null); setSidebarTab("preset") }}
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
          busy={busy}
          keepStructure={settings.keepStructure}
          onKeepStructure={(keepStructure) => update((s) => ({ ...s, keepStructure }))}
          onOptimise={async () => {
            const res = await run(targets)
            if (res.size > 0) push({ tone: "success", text: `Optimised ${plural(res.size, "file")}. Ready to export` })
          }}
          onExport={doExport}
        />
        {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
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
      </div>
    </PreviewCssContext.Provider>
  )
}
