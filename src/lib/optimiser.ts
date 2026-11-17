import { activeReplacements, toSvgoConfig } from "./settings"
import type { RunSpec } from "./types"
import type { WorkerRequest, WorkerResponse } from "./optimiser.worker"

// ── Worker pool ───────────────────────────────────────────────────────────────

export interface WorkerOutput { data: string, replaced: number }
export interface ProbeOutput { name: string, description: string }

type Pending = { resolve: (res: WorkerResponse & { ok: true }) => void, reject: (err: Error) => void }

const POOL_SIZE = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))

let workers: Worker[] = []
let nextId = 1
let cursor = 0
const pending = new Map<number, Pending>()

function getWorker() {
  if (workers.length === 0) {
    workers = Array.from({ length: POOL_SIZE }, () => {
      const w = new Worker(new URL("./optimiser.worker.ts", import.meta.url), { type: "module" })
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const job = pending.get(e.data.id)
        if (!job) return
        pending.delete(e.data.id)
        if (e.data.ok) job.resolve(e.data)
        else job.reject(new Error(e.data.error))
      }
      return w
    })
  }
  cursor = (cursor + 1) % workers.length
  return workers[cursor]
}

type Body = WorkerRequest extends infer R ? R extends { id: number } ? Omit<R, "id"> : never : never

function send(body: Body) {
  return new Promise<WorkerResponse & { ok: true }>((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ ...body, id } as WorkerRequest)
  })
}

export async function optimiseSvg(svg: string, spec: RunSpec): Promise<WorkerOutput> {
  const res = await send({
    type: "optimise",
    svg,
    config: toSvgoConfig(spec.svgo),
    replacements: activeReplacements(spec.svgo),
    custom: spec.custom
  })
  if (!("data" in res)) throw new Error("Unexpected worker response")
  return { data: res.data, replaced: res.replaced }
}

/** Loads plugin code in a worker to check it's a usable SVGO plugin */
export async function probePlugin(code: string): Promise<ProbeOutput> {
  const res = await send({ type: "probe", code })
  if (!("probe" in res)) throw new Error("Unexpected worker response")
  return res.probe
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
