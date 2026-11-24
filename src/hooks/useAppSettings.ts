import { useCallback, useEffect, useRef, useState } from "react"
import { sanitiseAppSettings } from "@svgenius/core/settings"
import { loadSettings, saveSettings } from "../lib/platform"
import type { AppSettings } from "@svgenius/core/types"

// ── Persistent app settings ───────────────────────────────────────────────────
// Lives in the app config folder as settings.json, so presets survive restarts.

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const latest = useRef<AppSettings | null>(null)

  useEffect(() => {
    loadSettings()
      .then((json) => setSettings(sanitiseAppSettings(json ? JSON.parse(json) : null)))
      .catch((e) => {
        setLoadError(String(e))
        setSettings(sanitiseAppSettings(null))
      })
  }, [])

  // Debounced save, plus a flush when the window goes away
  useEffect(() => {
    if (!settings) return
    latest.current = settings
    const t = setTimeout(() => {
      saveSettings(JSON.stringify(settings, null, 2)).catch((e) => console.error("Couldn't save settings", e))
    }, 250)
    return () => clearTimeout(t)
  }, [settings])

  useEffect(() => {
    const flush = () => {
      if (latest.current) saveSettings(JSON.stringify(latest.current, null, 2)).catch(() => {})
    }
    window.addEventListener("beforeunload", flush)
    return () => window.removeEventListener("beforeunload", flush)
  }, [])

  const update = useCallback((fn: (s: AppSettings) => AppSettings) => {
    setSettings((s) => (s ? fn(s) : s))
  }, [])

  return { settings, update, loadError }
}

// ── Preset helpers ────────────────────────────────────────────────────────────

export { presetById, presetActions, uniqueName } from "@svgenius/core/presets"
export type { Update, PresetActions } from "@svgenius/core/presets"
