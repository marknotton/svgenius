export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 2 : 1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

/** Positive = smaller. Returns a whole-ish percentage */
export function savingPercent(before: number, after: number) {
  if (before <= 0) return 0
  return ((before - after) / before) * 100
}

export function formatSaving(before: number, after: number) {
  const pct = savingPercent(before, after)
  const sign = pct > 0 ? "−" : pct < 0 ? "+" : ""
  return `${sign}${Math.abs(pct).toFixed(pct !== 0 && Math.abs(pct) < 10 ? 1 : 0)}%`
}

export const byteLength = (s: string) => new TextEncoder().encode(s).length

export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
