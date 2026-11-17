/// <reference lib="webworker" />
import { optimize } from "svgo/browser"
import { applyReplacements } from "./replace"
import type { Replacement } from "./types"

// ── SVGO worker ───────────────────────────────────────────────────────────────
// Runs off the main thread so the UI stays responsive during big batches.
// Pipeline: "before" replacements → SVGO → "after" replacements.

export interface OptimiseRequest {
  id: number
  svg: string
  config: Parameters<typeof optimize>[1]
  replacements: Replacement[]
}

export type OptimiseResponse =
  | { id: number, ok: true, data: string, replaced: number }
  | { id: number, ok: false, error: string }

self.onmessage = (e: MessageEvent<OptimiseRequest>) => {
  const { id, svg, config, replacements } = e.data
  let res: OptimiseResponse
  try {
    const pre = applyReplacements(svg, replacements, "before")
    const optimised = optimize(pre.out, config).data
    const post = applyReplacements(optimised, replacements, "after")
    res = { id, ok: true, data: post.out, replaced: pre.count + post.count }
  } catch (err) {
    res = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(res)
}
