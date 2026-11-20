import { useSyncExternalStore } from "react"
import { isDesktop } from "./platform"

// ── Recently opened ───────────────────────────────────────────────────────────
// Projects, files and folders opened on the desktop, newest first, so the
// start screen can open them again. The browser can't reopen a file by its
// path, so it keeps no history.

export interface Recent { kind: "project" | "file" | "folder", path: string, name: string, at: number }

const KEY = "svgenius:recent"
const MAX = 12
const subs = new Set<() => void>()

const read = (): Recent[] => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]")
    return Array.isArray(v) ? v.filter((r) => r && typeof r.path === "string" && typeof r.name === "string") : []
  } catch { return [] }
}
let list = read()
const write = (next: Recent[]) => {
  list = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* unavailable */ }
  subs.forEach((f) => f())
}

const nameOf = (p: string) => p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? p

export function remember(path: string, kind?: Recent["kind"]) {
  if (!isDesktop || !path) return
  const k = kind ?? (/\.svgenius$/i.test(path) ? "project" : /\.svg$/i.test(path) ? "file" : "folder")
  write([{ kind: k, path, name: nameOf(path), at: Date.now() }, ...list.filter((r) => r.path !== path)].slice(0, MAX))
}

export const forget = (path: string) => write(list.filter((r) => r.path !== path))
export const clearRecent = () => write([])

export function useRecent(): Recent[] {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => list)
}
