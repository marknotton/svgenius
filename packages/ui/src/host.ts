// ── Host profile: how the shared UI talks to whatever app embeds it ──────────
// SVGenius (desktop or web) and the Symbols Craft plugin each call
// configureHost() once, before rendering. Components ask host() at run time,
// never at module load, so the profile can be set from the app's entry file.

export type HostName = "svgenius" | "symbols"

export interface HostAdapter {
  /** True when files live on a real disk the host can open or reveal */
  isDesktop: boolean
  /** True for items that came from the clipboard rather than a file */
  isPasted: (path: string) => boolean
  readClipboardText: () => Promise<string>
  openInDefaultApp: (path: string) => void
  reveal: (path: string) => void
  /** Subscribes to a host event (menu commands and so on). Returns an unsubscribe */
  listenFor: <T = unknown>(event: string, run: (payload: T) => void) => () => void
}

export interface HostCapabilities {
  /** Custom SVGO plugins (SVGenius only; Symbols hides them) */
  customPlugins: boolean
  /** Bulk export and rename */
  bulkExport: boolean
  /** Writes edited files straight back to disk */
  writeFiles: boolean
}

export interface HostProfile {
  name: HostName
  adapter: HostAdapter
  capabilities: HostCapabilities
  /** Free-form extras a host can hand to its own components */
  extensions?: Record<string, unknown>
}

const noop = () => {}

const fallback: HostProfile = {
  name: "svgenius",
  adapter: {
    isDesktop: false,
    isPasted: () => false,
    readClipboardText: async () => (navigator.clipboard?.readText ? navigator.clipboard.readText() : ""),
    openInDefaultApp: noop,
    reveal: noop,
    listenFor: () => noop,
  },
  capabilities: { customPlugins: true, bulkExport: true, writeFiles: false },
}

let current: HostProfile = fallback

export function configureHost(profile: Partial<HostProfile> & { adapter?: Partial<HostAdapter> }) {
  current = {
    ...current,
    ...profile,
    adapter: { ...current.adapter, ...profile.adapter },
    capabilities: { ...current.capabilities, ...profile.capabilities },
  }
}

export const host = () => current
export const adapter = () => current.adapter
export const isHost = (name: HostName) => current.name === name
