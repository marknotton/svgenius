import type { SvgItem } from "@marknotton/svgenius-core/types"

// ── Browser session ───────────────────────────────────────────────────────────
// The browser can't reopen files by path, so the list itself (markup, edits,
// flags, own settings) is kept in IndexedDB and comes back after a refresh.
// Optimised output isn't stored: it's quick to make again.

export type Saved = Pick<SvgItem, "id" | "path" | "name" | "relPath" | "size" | "source" | "fileSource" | "presetId" | "config" | "flag" | "adjust" | "missing">

const DB = "svgenius", STORE = "session", KEY = "items"

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(d.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    d.close()
  }
}

export async function loadSession(): Promise<SvgItem[]> {
  try {
    const saved = (await run<Saved[] | undefined>("readonly", (s) => s.get(KEY))) ?? []
    return saved
      .filter((x) => typeof x.source === "string" || x.missing)
      .map((x) => ({ ...x, status: typeof x.source === "string" ? "idle" : "error", error: typeof x.source === "string" ? undefined : `Can't find ${x.name}. It was at ${x.path}`, rev: 0 }))
  } catch {
    return []
  }
}

/** The parts of each file worth keeping: markup, edits, flags and own settings (and missing files, to find later) */
export const toSaved = (items: SvgItem[]): Saved[] => items
  .filter((i) => typeof i.source === "string" || i.missing)
  .map(({ id, path, name, relPath, size, source, fileSource, presetId, config, flag, adjust, missing }) => ({ id, path, name, relPath, size, source, fileSource, presetId, config, flag, adjust, missing }))

export async function saveSession(items: SvgItem[]): Promise<void> {
  const saved = toSaved(items)
  try {
    await run("readwrite", (s) => s.put(saved, KEY))
  } catch { /* private windows can refuse storage; the list just won't survive a refresh */ }
}
