/// <reference lib="webworker" />
import { optimize } from "svgo/browser"

// ── SVGO worker ───────────────────────────────────────────────────────────────
// Runs off the main thread so the UI stays responsive during big batches.

export interface OptimiseRequest { id: number, svg: string, config: Parameters<typeof optimize>[1] }
export type OptimiseResponse = { id: number, ok: true, data: string } | { id: number, ok: false, error: string }

self.onmessage = (e: MessageEvent<OptimiseRequest>) => {
  const { id, svg, config } = e.data
  let res: OptimiseResponse
  try {
    res = { id, ok: true, data: optimize(svg, config).data }
  } catch (err) {
    res = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(res)
}
