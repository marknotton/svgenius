// ── Tunables ──────────────────────────────────────────────────────────────────

/**
 * Live updates: rows within this many pixels of the visible part of the list
 * are re-optimised straight away when settings change. Everything further away
 * waits until it's scrolled near. Generous on purpose so fast scrolling rarely
 * shows stale previews.
 */
export const LIVE_BUFFER_PX = 1600

/** Wait this long after the last settings change before re-running */
export const LIVE_DEBOUNCE_MS = 150
