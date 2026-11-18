import { useEffect, useState } from "react"
import type { ThemeChoice } from "./types"

// ── App theme ─────────────────────────────────────────────────────────────────
// "system" leaves data-theme off so the CSS media query decides.

const query = () => window.matchMedia("(prefers-color-scheme: dark)")

/** Applies the choice to <html> and returns whether the app is dark right now */
export function useTheme(choice: ThemeChoice | undefined) {
  const [systemDark, setSystemDark] = useState(() => query().matches)
  useEffect(() => {
    const mq = query()
    const on = () => setSystemDark(mq.matches)
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  useEffect(() => {
    const root = document.documentElement
    if (!choice || choice === "system") delete root.dataset.theme
    else root.dataset.theme = choice
  }, [choice])
  return choice === "dark" || ((!choice || choice === "system") && systemDark)
}
