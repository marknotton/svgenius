import { useSyncExternalStore } from "react"
import { APP_VERSION } from "./about"
import { DOWNLOAD_URL, isDesktop } from "./platform"

// ── Desktop updates ───────────────────────────────────────────────────────────
// The desktop app asks GitHub Releases for latest.json, which the release
// workflow publishes alongside signed update bundles. Updating downloads the
// new version, swaps it in and restarts. The browser version updates itself,
// so none of this runs there.

export type UpdateStatus = "idle" | "checking" | "current" | "available" | "downloading" | "restarting" | "installed" | "error"

export interface UpdateState {
  status: UpdateStatus
  version?: string
  notes?: string
  /** 0 to 1 while downloading, when the size is known */
  progress?: number
  error?: string
}

type Update = { version: string, body?: string, downloadAndInstall: (cb?: (e: DownloadEvent) => void) => Promise<void> }
type DownloadEvent = { event: "Started", data: { contentLength?: number } } | { event: "Progress", data: { chunkLength: number } } | { event: "Finished" }

let state: UpdateState = { status: "idle" }
let pending: Update | null = null
const subs = new Set<() => void>()
const set = (s: UpdateState) => { state = s; subs.forEach((f) => f()) }

export const canUpdate = isDesktop
export const RELEASES_URL = DOWNLOAD_URL

/** Asks GitHub whether there's a newer version. Resolves to the new state */
export async function checkForUpdate(): Promise<UpdateState> {
  if (!canUpdate) return state
  if (state.status === "checking" || state.status === "downloading" || state.status === "restarting") return state
  set({ status: "checking" })
  try {
    const { check } = await import("@tauri-apps/plugin-updater")
    // A spinner that flashes for a split second looks broken, so give it a moment
    const [found] = await Promise.all([check({ timeout: 20_000 }), new Promise((r) => setTimeout(r, 600))])
    pending = found as Update | null
    set(pending ? { status: "available", version: pending.version, notes: pending.body?.trim() || undefined } : { status: "current" })
  } catch (e) {
    pending = null
    const msg = String(e)
    // No published release yet (latest.json isn't there), so nothing newer either
    if (/valid release JSON|404|not found/i.test(msg)) set({ status: "current" })
    else set({ status: "error", error: msg })
  }
  return state
}

// Updating restarts the app, so the page gets a say first, the same as quitting.
// It resolves false to cancel (unsaved project changes and the user hit Cancel)
let beforeInstall: () => Promise<boolean> = async () => true
export function setUpdateGuard(fn: () => Promise<boolean>) { beforeInstall = fn }

/** Downloads the new version, installs it over this one and restarts */
export async function installUpdate() {
  if (!pending) return
  if (!await beforeInstall()) return
  if (!pending) return
  const { version, notes } = state
  let total = 0, got = 0
  set({ status: "downloading", version, notes, progress: 0 })
  try {
    await pending.downloadAndInstall((e) => {
      if (e.event === "Started") total = e.data.contentLength ?? 0
      else if (e.event === "Progress") { got += e.data.chunkLength; set({ status: "downloading", version, notes, progress: total ? Math.min(1, got / total) : undefined }) }
    })
  } catch (e) {
    console.error("Update failed", e)
    set({ status: "error", version, notes, error: String(e) })
    return
  }
  // Installed. If the restart itself fails, a manual quit and reopen finishes it
  set({ status: "restarting", version, notes })
  try {
    const { relaunch } = await import("@tauri-apps/plugin-process")
    await relaunch()
  } catch (e) {
    console.error("Relaunch failed", e)
    set({ status: "installed", version, notes })
  }
}

export function useUpdateState() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => state)
}

// "Skip this release" remembers the version, so launch stays quiet until a newer one
const SKIP_KEY = "svgenius:skipUpdate"
export const skippedVersion = {
  get: (): string | null => { try { return localStorage.getItem(SKIP_KEY) } catch { return null } },
  set: (v: string) => { try { localStorage.setItem(SKIP_KEY, v) } catch { /* unavailable */ } }
}

export const currentVersion = APP_VERSION
