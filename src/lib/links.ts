import { byteLength } from "@marknotton/svgenius-core/format"
import { runLimited } from "@marknotton/svgenius-core/optimiser"
import { isDesktop, isPasted, readSvg, scanPaths } from "./platform"
import type { SvgItem } from "@marknotton/svgenius-core/types"

// ── Linked files ──────────────────────────────────────────────────────────────
// Projects link to SVGs on disk rather than carrying their markup. This finds
// them again when a project opens, and relinks the ones that went missing:
// locate one file (others from the same folder, or the same moved tree, come
// along with it) or point at a folder and let it match them up by name.

const SEP = /[\\/]/

const segments = (path: string) => path.split(SEP).filter(Boolean)
export const baseName = (path: string) => segments(path).pop() ?? path
export const dirOf = (path: string) => { const m = path.match(/^(.*)[\\/][^\\/]*$/); return m ? m[1] : "" }
const sepOf = (path: string) => (path.includes("\\") && !path.includes("/") ? "\\" : "/")
const join = (dir: string, rest: string) => (dir ? `${dir.replace(/[\\/]+$/, "")}${sepOf(dir)}${rest.replace(/^[\\/]+/, "")}` : rest)

/** `path` relative to the folder `from`, with ../ where needed. Null across drives */
export function relativePath(from: string, path: string): string | null {
  const a = segments(from), b = segments(path)
  // Windows drive letters must match, or there's no way between them
  if (/^[a-z]:$/i.test(a[0] ?? "") && a[0]?.toLowerCase() !== b[0]?.toLowerCase()) return null
  let k = 0
  while (k < a.length && k < b.length - 1 && a[k] === b[k]) k++
  return [...Array(a.length - k).fill(".."), ...b.slice(k)].join("/")
}

/** Resolves a relative path against a folder, folding any ../ */
export function resolvePath(dir: string, rel: string): string {
  const lead = /^[\\/]/.test(dir) ? (dir.startsWith("\\\\") ? "\\\\" : "/") : ""
  const out = segments(dir)
  for (const s of rel.split(/[\\/]/)) {
    if (!s || s === ".") continue
    if (s === "..") out.pop()
    else out.push(s)
  }
  const sep = sepOf(dir)
  return lead + out.join(sep)
}

/** True when the item points at a file on disk (not pasted code) */
export const isLinked = (item: Pick<SvgItem, "path">) => !isPasted(item.path)

/** Markup edited here that differs from the file (or the file isn't known) */
export const hasEdits = (item: Pick<SvgItem, "source" | "fileSource">) =>
  item.source !== undefined && item.source !== item.fileSource

const tryRead = (path: string) => readSvg(path).then((text) => text, () => null)

export interface Found { id: string, path: string, text: string }

/**
 * Reads every linked file for a project that just opened: its own path first,
 * then the same place relative to the project file (for a project that moved
 * along with its SVGs). Files read fine come back with fresh markup; the rest
 * come back marked missing, keeping any saved copy.
 */
export async function loadLinked(files: SvgItem[], projectPath: string | null, rels: Map<string, string>): Promise<SvgItem[]> {
  const projectDir = projectPath ? dirOf(projectPath) : null
  const out = [...files]
  await runLimited(out.map((f, k) => ({ f, k })), 8, async ({ f, k }) => {
    // The browser can't read paths back: markup carried in the project just works
    if (!isLinked(f) || (!isDesktop && f.source !== undefined)) return
    let path = f.path
    let text = await tryRead(path)
    const rel = rels.get(f.id)
    if (text === null && projectDir && rel) {
      const alt = resolvePath(projectDir, rel)
      if (alt !== path) { text = await tryRead(alt); if (text !== null) path = alt }
    }
    out[k] = text === null ? markMissing(f) : found(f, path, text)
  })
  return out
}

/** Takes the file's markup, keeping edits made here */
export function found(item: SvgItem, path: string, text: string): SvgItem {
  const name = baseName(path)
  const relDir = dirOf(item.relPath)
  return {
    ...item,
    path,
    name,
    relPath: relDir ? `${relDir}/${name}` : name,
    source: hasEdits(item) ? item.source : text,
    fileSource: text,
    size: byteLength(hasEdits(item) ? item.source as string : text),
    missing: undefined,
    status: "idle",
    error: undefined,
    errorKey: undefined
  }
}

export function markMissing(item: SvgItem): SvgItem {
  return item.source !== undefined
    ? { ...item, missing: true, status: "idle", error: undefined }
    : { ...item, missing: true, status: "error", error: `Can't find ${item.name}. It was at ${item.path}` }
}

/**
 * The user found one missing file. Other missing files are looked for in the
 * same folder, and where the folder moved as a whole (…/old/icons → …/new/icons),
 * at the same place in the new tree
 */
export async function relinkFromFile(target: SvgItem, picked: string, missing: SvgItem[], taken: Set<string>): Promise<Found[]> {
  const text = await tryRead(picked)
  if (text === null) throw new Error(`Couldn't read ${baseName(picked)}`)
  const out: Found[] = [{ id: target.id, path: picked, text }]
  taken.add(picked)
  const oldDir = dirOf(target.path), newDir = dirOf(picked)

  // Strip the folders both paths end with to find what moved where
  const a = segments(oldDir), b = segments(newDir)
  let tail = 0
  while (tail < a.length && tail < b.length && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++
  const oldRoot = a.slice(0, a.length - tail), newRoot = segments(newDir).slice(0, b.length - tail)
  const lead = /^[\\/]/.test(newDir) ? "/" : ""

  const others = missing.filter((m) => m.id !== target.id && isLinked(m))
  await runLimited(others, 8, async (m) => {
    const tries: string[] = []
    const ms = segments(m.path)
    if (oldRoot.length && ms.length > oldRoot.length && oldRoot.every((s, k) => ms[k] === s)) {
      tries.push(lead + [...newRoot, ...ms.slice(oldRoot.length)].join(sepOf(newDir)))
    }
    tries.push(join(newDir, baseName(m.path)))
    for (const p of [...new Set(tries)]) {
      if (taken.has(p)) continue
      const t = await tryRead(p)
      if (t !== null) { taken.add(p); out.push({ id: m.id, path: p, text: t }); return }
    }
  })
  return out
}

/**
 * The user picked a folder (or folders). Every SVG in it is matched to the
 * missing files by name; when more than one shares a name, the one whose
 * folders match the old path best wins
 */
export async function relinkFromFolders(folders: string[], missing: SvgItem[], taken: Set<string>): Promise<Found[]> {
  const scanned = await scanPaths(folders)
  const byName = new Map<string, string[]>()
  for (const f of scanned) {
    const key = f.name.toLowerCase()
    byName.set(key, [...byName.get(key) ?? [], f.path])
  }
  const score = (a: string, b: string) => {
    const x = segments(a), y = segments(b)
    let n = 0
    while (n < x.length && n < y.length && x[x.length - 1 - n] === y[y.length - 1 - n]) n++
    return n
  }
  const out: Found[] = []
  await runLimited(missing.filter(isLinked), 8, async (m) => {
    const options = (byName.get(baseName(m.path).toLowerCase()) ?? [])
      .filter((p) => !taken.has(p))
      .sort((p, q) => score(q, m.path) - score(p, m.path))
    for (const p of options) {
      taken.add(p)
      const t = await tryRead(p)
      if (t !== null) { out.push({ id: m.id, path: p, text: t }); return }
      taken.delete(p)
    }
  })
  return out
}
