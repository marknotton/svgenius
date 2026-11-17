import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react"
import { listen } from "@tauri-apps/api/event"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { open, save } from "@tauri-apps/plugin-dialog"
import { revealItemInDir } from "@tauri-apps/plugin-opener"
import { AppBar } from "./components/AppBar"
import { ConfigPanel } from "./components/ConfigPanel"
import { useDialogs } from "./components/Dialogs"
import { DropOverlay, EmptyState } from "./components/EmptyState"
import { FileList } from "./components/FileList"
import { Footer } from "./components/Footer"
import { PreviewCssBar, PreviewCssContext } from "./components/PreviewCss"
import { ReviewView } from "./components/ReviewView"
import { Toasts, useToasts } from "./components/Toast"
import { ViewControls } from "./components/ViewControls"
import { presetActions, presetById, uniqueName, useAppSettings } from "./hooks/useAppSettings"
import { useItems } from "./hooks/useItems"
import { planExport } from "./lib/exportPlan"
import { plural } from "./lib/format"
import { buildExport, mergeImport, settingsKey } from "./lib/settings"
import { errorMessage, existingFiles, exportFiles, readJsonFile, takePendingOpenFiles, writeJsonFile } from "./lib/tauri"
import type { AppSettings, SvgItem } from "./lib/types"

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
  const { items, itemsRef, addPaths, remove, clear, setPreset, optimise } = useItems()
  const dialogs = useDialogs()
  const { toasts, push, dismiss } = useToasts()
  const actions = useMemo(() => presetActions(update), [update])

  const [view, setView] = useState<"list" | "review">("list")
  const [reviewIds, setReviewIds] = useState<string[]>([])
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const anchor = useRef<string | null>(null)

  // ── Presets ─────────────────────────────────────────────────────────────────

  const defaultPreset = presetById(settings, settings.defaultPresetId)
  const editing = presetById(settings, settings.editingPresetId)
  const presetFor = useCallback((item: SvgItem) => presetById(settings, item.presetId), [settings])
  const resolve = useCallback((item: SvgItem) => presetFor(item).settings, [presetFor])

  const keys = useMemo(() => new Map(settings.presets.map((p) => [p.id, settingsKey(p.settings)])), [settings.presets])
  const isStale = useCallback(
    (item: SvgItem) => !!item.result && item.result.key !== keys.get(presetFor(item).id),
    [keys, presetFor]
  )

  const usage = items.filter((i) => presetFor(i).id === editing.id).length

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

  const toggle = useCallback((id: string, e: MouseEvent) => {
    setSelection((sel) => {
      const next = new Set(sel)
      const list = itemsRef.current
      if (e.shiftKey && anchor.current) {
        const a = list.findIndex((i) => i.id === anchor.current)
        const b = list.findIndex((i) => i.id === id)
        if (a >= 0 && b >= 0) {
          const [from, to] = a < b ? [a, b] : [b, a]
          for (let i = from; i <= to; i++) next.add(list[i].id)
          return next
        }
      }
      if (next.has(id)) next.delete(id)
      else next.add(id)
      anchor.current = id
      return next
    })
  }, [itemsRef])

  const selectAll = (all: boolean) => setSelection(all ? new Set(items.map((i) => i.id)) : new Set())

  const reviewItems = useMemo(() => {
    const ids = new Set(reviewIds)
    return items.filter((i) => ids.has(i.id))
  }, [items, reviewIds])

  const targets = view === "review" ? reviewItems : selection.size ? items.filter((i) => selection.has(i.id)) : items

  // ── Running ─────────────────────────────────────────────────────────────────

  const run = async (list: SvgItem[], force = false) => {
    setBusy(true)
    try {
      return await optimise(list.map((i) => i.id), resolve, force)
    } finally {
      setBusy(false)
    }
  }

  const openReview = () => {
    const ids = items.filter((i) => selection.has(i.id)).map((i) => i.id)
    setReviewIds(ids)
    setView("review")
  }

  // In review, results follow the settings live
  const staleInReview = view === "review" ? reviewItems.filter((i) => i.source !== undefined && (!i.result || isStale(i)) && i.status !== "running" && i.status !== "error").map((i) => i.id).join(",") : ""
  useEffect(() => {
    if (!staleInReview) return
    const t = setTimeout(() => { optimise(staleInReview.split(","), resolve) }, 200)
    return () => clearTimeout(t)
  }, [staleInReview, optimise, resolve])

  // ── Export ──────────────────────────────────────────────────────────────────

  const doExport = async () => {
    const list = targets
    const results = await run(list)
    const ready = list.filter((i) => results.has(i.id))
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

  const deletePreset = async () => {
    const ok = await dialogs.confirm({
      title: `Delete “${editing.name}”?`,
      body: usage ? `${plural(usage, "file")} using it will switch to the default preset.` : "This can't be undone.",
      confirmLabel: "Delete",
      danger: true
    })
    if (!ok) return
    const id = editing.id
    setPreset(items.filter((i) => i.presetId === id).map((i) => i.id), null)
    actions.remove(id)
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

  const removeItems = async () => {
    if (selection.size) return remove(selection)
    const ok = await dialogs.confirm({ title: "Clear the list?", body: "Files on disk aren't touched.", confirmLabel: "Clear" })
    if (ok) clear()
  }

  const setViewPrefs = (patch: Partial<Pick<AppSettings, "thumbSize" | "backdrop" | "previewCss" | "previewCssEnabled">>) =>
    update((s) => ({ ...s, ...patch }))

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
      thumbSize={settings.thumbSize}
      backdrop={settings.backdrop}
      onThumbSize={(thumbSize) => setViewPrefs({ thumbSize })}
      onBackdrop={(backdrop) => setViewPrefs({ backdrop })}
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
      <div className="app">
        <AppBar subtitle={view === "review" ? "Review" : undefined} />
        <div className="workspace">
          <main className="workspace__main">
            {view === "review" ? (
              <ReviewView
                items={reviewItems}
                settings={settings}
                defaultPreset={defaultPreset}
                onBack={() => setView("list")}
                onPreset={setPreset}
                onNewPreset={newPresetForItem}
                viewControls={viewControls}
                cssBar={cssBar}
              />
            ) : items.length === 0 ? (
              <EmptyState onAddFiles={addFiles} onAddFolder={addFolder} />
            ) : (
              <FileList
                items={items}
                selection={selection}
                settings={settings}
                defaultPreset={defaultPreset}
                isStale={isStale}
                onToggle={toggle}
                onSelectAll={selectAll}
                onPreset={(id, presetId) => setPreset([id], presetId)}
                onNewPreset={newPresetForItem}
                onDefaultPreset={actions.setDefault}
                onAddFiles={addFiles}
                onAddFolder={addFolder}
                onRemove={removeItems}
                viewControls={viewControls}
                cssBar={cssBar}
              />
            )}
          </main>
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
          />
        </div>
        <Footer
          view={view}
          items={items}
          targets={targets}
          selectionCount={selection.size}
          busy={busy}
          keepStructure={settings.keepStructure}
          onKeepStructure={(keepStructure) => update((s) => ({ ...s, keepStructure }))}
          onOptimise={() => run(targets)}
          onReview={openReview}
          onRerun={() => run(targets, true)}
          onExport={doExport}
        />
        {dragging && <DropOverlay />}
        {dialogs.node}
        <Toasts toasts={toasts} dismiss={dismiss} />
      </div>
    </PreviewCssContext.Provider>
  )
}
