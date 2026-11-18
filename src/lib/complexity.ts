import { formatBytes } from "./format"
import type { SvgItem } from "./types"

// ── Too complex to render? ────────────────────────────────────────────────────
// Huge or very busy SVGs can freeze the preview, the code editor or SVGO, so
// they aren't rendered or optimised until someone says "Render anyway".

export const LIMITS = { bytes: 3 * 1024 * 1024, elements: 15_000 }

/** Why a file is too heavy to render safely, or undefined when it's fine */
export function assessComplexity(source: string): string | undefined {
  if (source.length > LIMITS.bytes) return `${formatBytes(source.length)} of markup`
  const tag = /<[A-Za-z]/g
  let count = 0
  while (tag.exec(source)) if (++count > LIMITS.elements) return `more than ${LIMITS.elements.toLocaleString("en-GB")} elements`
  return undefined
}

/** Heavy and nobody has said "Render anyway" yet */
export const isBlocked = (item: Pick<SvgItem, "heavy" | "forceRender">) => !!item.heavy && !item.forceRender
