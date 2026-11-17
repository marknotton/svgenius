import { toSvgoConfig } from "./settings"
import type { SvgoSettings } from "./types"
import type { OptimiseRequest, OptimiseResponse } from "./optimiser.worker"

// ── Worker pool ───────────────────────────────────────────────────────────────

interface Pending { resolve: (data: string) => void, reject: (err: Error) => void }

const POOL_SIZE = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))

let workers: Worker[] = []
let nextId = 1
let cursor = 0
const pending = new Map<number, Pending>()

function getWorker() {
  if (workers.length === 0) {
    workers = Array.from({ length: POOL_SIZE }, () => {
      const w = new Worker(new URL("./optimiser.worker.ts", import.meta.url), { type: "module" })
      w.onmessage = (e: MessageEvent<OptimiseResponse>) => {
        const job = pending.get(e.data.id)
        if (!job) return
        pending.delete(e.data.id)
        if (e.data.ok) job.resolve(e.data.data)
        else job.reject(new Error(e.data.error))
      }
      return w
    })
  }
  cursor = (cursor + 1) % workers.length
  return workers[cursor]
}

export function optimiseSvg(svg: string, settings: SvgoSettings) {
  return new Promise<string>((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    const req: OptimiseRequest = { id, svg, config: toSvgoConfig(settings) }
    getWorker().postMessage(req)
  })
}

/** Runs `fn` over `items` with at most `limit` in flight */
export async function runLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0
  const next = async (): Promise<void> => {
    while (i < items.length) await fn(items[i++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next))
}

export const CONCURRENCY = POOL_SIZE * 2
