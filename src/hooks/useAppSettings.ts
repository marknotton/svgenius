import { useCallback, useEffect, useRef, useState } from "react"
import { createPreset, defaultSvgoSettings, duplicateAfter, sanitiseAppSettings } from "@svgenius/core/settings"
import { loadSettings, saveSettings } from "../lib/platform"
import type { AppSettings, Preset, SvgoSettings } from "@svgenius/core/types"

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

export type Update = (fn: (s: AppSettings) => AppSettings) => void

export function presetById(s: AppSettings, id: string | null | undefined): Preset {
  return s.presets.find((p) => p.id === id)
    ?? s.presets.find((p) => p.id === s.defaultPresetId)
    ?? s.presets[0]
}

export function presetActions(update: Update) {
  return {
    edit(id: string, fn: (settings: SvgoSettings) => SvgoSettings) {
      update((s) => ({
        ...s,
        presets: s.presets.map((p) => (p.id === id ? { ...p, settings: fn(p.settings) } : p))
      }))
    },

    /** Creates a preset (copying `from` if given), opens it in the panel and returns it */
    create(name: string, from?: SvgoSettings): Preset {
      const preset = createPreset(name, from ?? defaultSvgoSettings())
      update((s) => ({ ...s, presets: [...s.presets, preset], editingPresetId: preset.id }))
      return preset
    },

    /** Copies a preset (every setting) and places it straight after the original */
    duplicate(id: string) {
      update((s) => ({
        ...s,
        presets: duplicateAfter(s.presets, id, (c) => ({ ...c, name: uniqueName(s, `${c.name} copy`) }))
      }))
    },

    rename(id: string, name: string) {
      update((s) => ({ ...s, presets: s.presets.map((p) => (p.id === id ? { ...p, name } : p)) }))
    },

    remove(id: string) {
      update((s) => {
        if (s.presets.length <= 1) return s
        const presets = s.presets.filter((p) => p.id !== id)
        const fallback = presets[0].id
        return {
          ...s,
          presets,
          defaultPresetId: s.defaultPresetId === id ? fallback : s.defaultPresetId,
          editingPresetId: s.editingPresetId === id ? (s.defaultPresetId === id ? fallback : s.defaultPresetId) : s.editingPresetId
        }
      })
    },

    setDefault(id: string) {
      update((s) => ({ ...s, defaultPresetId: id }))
    },

    openInPanel(id: string) {
      update((s) => ({ ...s, editingPresetId: id }))
    },

    reset(id: string) {
      update((s) => ({
        ...s,
        presets: s.presets.map((p) => (p.id === id ? { ...p, settings: defaultSvgoSettings() } : p))
      }))
    }
  }
}

export type PresetActions = ReturnType<typeof presetActions>

export function uniqueName(s: AppSettings, base: string) {
  let name = base
  let n = 2
  while (s.presets.some((p) => p.name === name)) name = `${base} ${n++}`
  return name
}
