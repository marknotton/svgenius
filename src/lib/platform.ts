import { listen } from "@tauri-apps/api/event"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { open, save } from "@tauri-apps/plugin-dialog"
import { revealItemInDir } from "@tauri-apps/plugin-opener"
import * as desktop from "./tauri"
import type { ScannedFile } from "./types"

// ── Desktop or browser ────────────────────────────────────────────────────────
// The app runs in Tauri on the desktop and as a plain web app. Everything that
// touches files, dialogs or the window goes through here, so the rest of the
// app doesn't care which one it's in.

export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

export const REPO_URL = "https://github.com/marknotton/svgenius"
export const DOWNLOAD_URL = `${REPO_URL}/releases/latest`

// ── Files the browser handed us ──────────────────────────────────────────────
// Browsers don't give out real paths, so each picked or dropped file is kept
// here by its relative path. File objects are lazy handles: nothing is read
// into memory until the app asks for the markup.

const webFiles = new Map<string, File>()
const isSvgName = (n: string) => /\.svg$/i.test(n)

function register(file: File, relPath = file.name): string | null {
  if (!isSvgName(file.name)) return null
  webFiles.set(relPath, file)
  return relPath
}

function pickWebFiles(folder: boolean): Promise<string[] | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input")
    input.type = "file"
    input.multiple = true
    if (folder) input.webkitdirectory = true
    else input.accept = ".svg,image/svg+xml"
    input.addEventListener("change", () => {
      const paths = [...input.files ?? []].map((f) => register(f, f.webkitRelativePath || f.name)).filter((p): p is string => !!p)
      resolve(paths)
    }, { once: true })
    input.addEventListener("cancel", () => resolve(null), { once: true })
    input.click()
  })
}

/** Walks dropped files and folders (folders keep their own name as the root) */
async function collectDropped(dt: DataTransfer): Promise<string[]> {
  const out: string[] = []
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e)
  if (entries.length === 0) {
    for (const f of dt.files) { const p = register(f); if (p) out.push(p) }
    return out
  }
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
      const p = register(file, prefix + file.name)
      if (p) out.push(p)
      return
    }
    if (!entry.isDirectory) return
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    // readEntries hands them over in batches until it returns nothing
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
      if (batch.length === 0) break
      for (const child of batch) {
        if (!child.name.startsWith(".")) await walk(child, `${prefix}${entry.name}/`)
      }
    }
  }
  for (const e of entries) await walk(e, "")
  return out
}

function download(name: string, data: Blob) {
  const url = URL.createObjectURL(data)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function pickWebText(accept: string): Promise<{ fileName: string, text: string } | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = accept
    input.addEventListener("change", () => {
      const f = input.files?.[0]
      if (!f) return resolve(null)
      f.text().then((text) => resolve({ fileName: f.name, text }), reject)
    }, { once: true })
    input.addEventListener("cancel", () => resolve(null), { once: true })
    input.click()
  })
}

// ── Adding files ──────────────────────────────────────────────────────────────

export const scanPaths = async (paths: string[]): Promise<ScannedFile[]> => {
  if (isDesktop) return desktop.scanPaths(paths)
  return paths.flatMap((p) => {
    const f = webFiles.get(p)
    return f ? [{ path: p, name: f.name, relPath: p, size: f.size }] : []
  })
}

export const readSvg = async (path: string): Promise<string> => {
  if (isDesktop) return desktop.readSvg(path)
  const f = webFiles.get(path)
  if (!f) throw new Error("That file is no longer available. Add it again.")
  return f.text()
}

/** Lets go of browser file handles for files that left the list */
export const forgetFiles = (paths: string[]) => {
  if (!isDesktop) for (const p of paths) webFiles.delete(p)
}

/** Opens a picker and returns the chosen paths, or null when cancelled */
export async function pickSvgs(kind: "files" | "folder"): Promise<string[] | null> {
  if (!isDesktop) return pickWebFiles(kind === "folder")
  const picked = kind === "files"
    ? await open({ multiple: true, filters: [{ name: "SVG", extensions: ["svg"] }] })
    : await open({ directory: true, multiple: true })
  return picked ? (Array.isArray(picked) ? picked : [picked]) : null
}

interface DropHandlers {
  onHover: (over: boolean) => void
  onDrop: (paths: string[]) => void
}

/** Drag and drop onto the window. Returns a function that stops listening */
export function listenForDrops({ onHover, onDrop }: DropHandlers): () => void {
  if (isDesktop) {
    // Native drag and drop gives us real paths
    let unlisten: (() => void) | undefined
    let gone = false
    getCurrentWebviewWindow()
      .onDragDropEvent((e) => {
        if (e.payload.type === "enter" || e.payload.type === "over") onHover(true)
        else if (e.payload.type === "leave") onHover(false)
        else if (e.payload.type === "drop") { onHover(false); onDrop(e.payload.paths) }
      })
      .then((fn) => { if (gone) safely(fn); else unlisten = fn })
      .catch(() => {})
    return () => { gone = true; if (unlisten) safely(unlisten) }
  }

  // Browser: only react to files, not text or images dragged around the page
  let depth = 0
  const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files")
  const enter = (e: DragEvent) => { if (!hasFiles(e)) return; depth++; onHover(true) }
  const over = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer!.dropEffect = "copy" }
  const leave = (e: DragEvent) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (depth === 0) onHover(false) }
  const drop = (e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth = 0
    onHover(false)
    collectDropped(e.dataTransfer!).then(onDrop).catch(() => onDrop([]))
  }
  window.addEventListener("dragenter", enter)
  window.addEventListener("dragover", over)
  window.addEventListener("dragleave", leave)
  window.addEventListener("drop", drop)
  return () => {
    window.removeEventListener("dragenter", enter)
    window.removeEventListener("dragover", over)
    window.removeEventListener("dragleave", leave)
    window.removeEventListener("drop", drop)
  }
}

/** Files handed over by the OS ("Open With", including cold launches). Desktop only */
export function listenForOpenedFiles(onFiles: (paths: string[]) => void): () => void {
  if (!isDesktop) return () => {}
  desktop.takePendingOpenFiles().then(onFiles).catch(() => {})
  return listenFor<string[]>("files:opened", onFiles)
}

// ── Exporting ─────────────────────────────────────────────────────────────────

export interface ExportOutcome {
  count: number
  /** Desktop only: shows the first file in Finder */
  reveal?: () => void
  /** Browser only: what was downloaded */
  download?: string
}

type ExportFile = { relPath: string, contents: string }

/**
 * Desktop: asks for a folder, checks for clashes (confirm decides) and writes.
 * Browser: one file downloads as is, more come as a zip that keeps the folders.
 * Returns null when the user backs out.
 */
export async function exportSvgs(
  files: ExportFile[],
  title: string,
  confirmReplace: (clashes: string[]) => Promise<boolean>
): Promise<ExportOutcome | null> {
  if (isDesktop) {
    const outDir = await open({ directory: true, title })
    if (typeof outDir !== "string") return null
    const clashes = await desktop.existingFiles(outDir, files.map((f) => f.relPath))
    if (clashes.length > 0 && !(await confirmReplace(clashes))) return null
    const written = await desktop.exportFiles(outDir, files)
    return { count: written.length, reveal: written[0] ? () => { revealItemInDir(written[0]).catch(() => {}) } : undefined }
  }
  if (files.length === 1) {
    const name = files[0].relPath.split("/").pop() ?? "image.svg"
    download(name, new Blob([files[0].contents], { type: "image/svg+xml" }))
    return { count: 1, download: name }
  }
  const { zipSync, strToU8 } = await import("fflate")
  const tree: Record<string, Uint8Array> = {}
  for (const f of files) tree[f.relPath] = strToU8(f.contents)
  const zip = zipSync(tree, { level: 6 })
  download("svgenius-export.zip", new Blob([zip as BlobPart], { type: "application/zip" }))
  return { count: files.length, download: "svgenius-export.zip" }
}

export const canReveal = isDesktop

export const reveal = (path: string) => {
  if (isDesktop) revealItemInDir(path).catch(() => {})
}

// ── Settings, presets and plugins ─────────────────────────────────────────────

const SETTINGS_KEY = "svgenius:settings"

export const loadSettings = async (): Promise<string | null> => {
  if (isDesktop) return desktop.loadSettingsFile()
  try { return localStorage.getItem(SETTINGS_KEY) } catch { return null }
}

export const saveSettings = async (json: string): Promise<void> => {
  if (isDesktop) return desktop.saveSettingsFile(json)
  try { localStorage.setItem(SETTINGS_KEY, json) } catch (e) {
    throw new Error(`The browser wouldn't save settings: ${desktop.errorMessage(e)}`)
  }
}

/** Picks a JSON file and returns its text, or null when cancelled */
export async function openJson(): Promise<string | null> {
  if (!isDesktop) return (await pickWebText(".json,application/json"))?.text ?? null
  const path = await open({ filters: [{ name: "SVGenius settings", extensions: ["json"] }] })
  return typeof path === "string" ? desktop.readJsonFile(path) : null
}

/** Saves JSON (a save dialog on the desktop, a download in the browser). False when cancelled */
export async function saveJson(defaultName: string, contents: string): Promise<boolean> {
  if (!isDesktop) {
    download(defaultName, new Blob([contents], { type: "application/json" }))
    return true
  }
  const path = await save({ defaultPath: defaultName, filters: [{ name: "JSON", extensions: ["json"] }] })
  if (!path) return false
  await desktop.writeJsonFile(path, contents)
  return true
}

export async function openPlugin(): Promise<{ fileName: string, code: string } | null> {
  if (!isDesktop) {
    const f = await pickWebText(".js,.mjs,text/javascript")
    return f ? { fileName: f.fileName, code: f.text } : null
  }
  const path = await open({ filters: [{ name: "SVGO plugin", extensions: ["js", "mjs"] }] })
  return typeof path === "string" ? desktop.readPluginFile(path) : null
}

/** Unlistening can throw if the window is already on its way out */
function safely(fn: () => unknown) {
  try {
    const r = fn()
    if (r instanceof Promise) r.catch(() => {})
  } catch { /* nothing left to clean up */ }
}

// ── Window and menus ──────────────────────────────────────────────────────────

export const startWindowDrag = () => {
  if (isDesktop) getCurrentWindow().startDragging().catch(() => {})
}

/** Native menu events. Nothing to listen to in the browser */
export function listenFor<T = unknown>(event: string, run: (payload: T) => void): () => void {
  if (!isDesktop) return () => {}
  let unlisten: (() => void) | undefined
  let gone = false
  listen<T>(event, (e) => run(e.payload)).then((fn) => { if (gone) safely(fn); else unlisten = fn }).catch(() => {})
  return () => { gone = true; if (unlisten) safely(unlisten) }
}

export const errorMessage = desktop.errorMessage
