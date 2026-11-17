/// <reference lib="webworker" />
import { optimize, type CustomPlugin as SvgoCustomPlugin } from "svgo/browser"
import { attrRulesPlugin } from "./attrRules"
import { applyReplacements } from "./replace"
import type { AttrRule, CustomRun, Replacement } from "./types"

// ── SVGO worker ───────────────────────────────────────────────────────────────
// Runs off the main thread so the UI stays responsive during big batches.
// Pipeline: "before" replacements → SVGO (+ custom plugins) → "after" replacements.
// Custom plugin code runs here too, away from the window and Tauri's IPC.

export type WorkerRequest =
  | { type: "optimise", id: number, svg: string, config: Parameters<typeof optimize>[1], replacements: Replacement[], attrRules: AttrRule[], custom: CustomRun[] }
  | { type: "probe", id: number, code: string }

export type WorkerResponse =
  | { id: number, ok: true, data: string, replaced: number }
  | { id: number, ok: true, probe: { name: string, description: string } }
  | { id: number, ok: false, error: string }

// ── Custom plugin loading ─────────────────────────────────────────────────────

interface LoadedPlugin { name: string, description: string, fn: SvgoCustomPlugin["fn"] }

const cache = new Map<string, Promise<LoadedPlugin>>()

async function load(code: string, hash?: string): Promise<LoadedPlugin> {
  const key = hash ?? code
  let p = cache.get(key)
  if (!p) {
    p = (async () => {
      const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }))
      try {
        const mod = await import(/* @vite-ignore */ url)
        // Accept `export default { name, fn }`, `export const plugin = …` or top-level `name` + `fn`
        const cand = [mod.default, mod.plugin, mod].find((m) => m && typeof m.fn === "function")
        if (!cand) throw new Error("No SVGO plugin found. The file should export an object with `name` and `fn`.")
        return {
          name: typeof cand.name === "string" && cand.name ? cand.name : "customPlugin",
          description: typeof cand.description === "string" ? cand.description : "",
          fn: cand.fn
        }
      } finally {
        URL.revokeObjectURL(url)
      }
    })()
    cache.set(key, p)
    p.catch(() => cache.delete(key))
  }
  return p
}

function parseParams(run: CustomRun) {
  if (!run.params.trim()) return undefined
  try {
    return JSON.parse(run.params)
  } catch {
    throw new Error(`Params for “${run.name}” aren't valid JSON`)
  }
}

// ── Messages ──────────────────────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data
  let res: WorkerResponse
  try {
    if (req.type === "probe") {
      const p = await load(req.code)
      res = { id: req.id, ok: true, probe: { name: p.name, description: p.description } }
    } else {
      const extra: SvgoCustomPlugin[] = []
      for (const run of req.custom) {
        const p = await load(run.code, run.hash)
        extra.push({ name: p.name, fn: p.fn, params: parseParams(run) })
      }
      // Attribute rules count each change once, even with multipass
      const before = { count: 0 }
      const after = { count: 0 }
      const rulesBefore = req.attrRules.filter((r) => r.stage === "before")
      const rulesAfter = req.attrRules.filter((r) => r.stage === "after")
      const config = {
        ...req.config,
        plugins: [
          ...(rulesBefore.length ? [attrRulesPlugin(rulesBefore, before) as unknown as SvgoCustomPlugin] : []),
          ...(req.config?.plugins ?? []),
          ...extra,
          ...(rulesAfter.length ? [attrRulesPlugin(rulesAfter, after) as unknown as SvgoCustomPlugin] : [])
        ]
      }
      const pre = applyReplacements(req.svg, req.replacements, "before")
      const optimised = optimize(pre.out, config).data
      const post = applyReplacements(optimised, req.replacements, "after")
      res = { id: req.id, ok: true, data: post.out, replaced: pre.count + post.count + before.count + after.count }
    }
  } catch (err) {
    res = { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(res)
}
