import { invoke } from "@tauri-apps/api/core"
import type { ScannedFile } from "@marknotton/svgenius-core/types"

// ── Typed wrappers around the Rust commands ──────────────────────────────────

export const scanPaths = (paths: string[]) => invoke<ScannedFile[]>("scan_paths", { paths })

export const readSvg = (path: string) => invoke<string>("read_svg", { path })

export const fileMtimes = (paths: string[]) => invoke<Array<number | null>>("file_mtimes", { paths })

export const existingFiles = (outDir: string, relPaths: string[]) =>
  invoke<string[]>("existing_files", { outDir, relPaths })

export const exportFiles = (outDir: string, files: Array<{ relPath: string, contents: string }>) =>
  invoke<string[]>("export_files", { outDir, files })

export const loadSettingsFile = () => invoke<string | null>("load_settings")

export const saveSettingsFile = (json: string) => invoke<void>("save_settings", { json })

export const readJsonFile = (path: string) => invoke<string>("read_json_file", { path })

export const writeJsonFile = (path: string, contents: string) =>
  invoke<void>("write_json_file", { path, contents })

export const readPluginFile = (path: string) =>
  invoke<{ fileName: string, code: string }>("read_plugin_file", { path })

export const takePendingOpenFiles = () => invoke<string[]>("take_pending_open_files")

export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === "string" ? e : "Something went wrong"

export const setUnsaved = (unsaved: boolean) => invoke<void>("set_unsaved", { unsaved })
export const quitApp = () => invoke<void>("quit_app")

export const defaultAppName = (path: string) => invoke<string | null>("default_app_name", { path })
