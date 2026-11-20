import { useEffect, useState } from "react"
import { DOWNLOAD_URL, REPO_URL, isDesktop } from "./platform"

// ── Direct downloads ──────────────────────────────────────────────────────────
// Links straight to the installer for this computer (the universal .dmg on a
// Mac, the setup .exe on Windows) instead of the releases page. Anything else
// gets the releases page.

type OS = "mac" | "windows" | "other"

const os: OS = (() => {
  if (typeof navigator === "undefined") return "other"
  const p = ((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "") + " " + navigator.userAgent
  if (/iPhone|iPad|Android/i.test(p)) return "other"
  if (/Mac/i.test(p)) return "mac"
  if (/Win/i.test(p)) return "windows"
  return "other"
})()

/** The installer for this computer, for a given version (no "v") */
export function installerUrl(version: string): string {
  const v = version.replace(/^v/, "")
  if (os === "mac") return `${REPO_URL}/releases/download/v${v}/SVGenius_${v}_universal.dmg`
  if (os === "windows") return `${REPO_URL}/releases/download/v${v}/SVGenius_${v}_x64-setup.exe`
  return DOWNLOAD_URL
}

let latest: Promise<string | null> | null = null
const latestVersion = () => (latest ??= fetch("https://api.github.com/repos/marknotton/svgenius/releases/latest", { headers: { Accept: "application/vnd.github+json" } })
  .then((r) => (r.ok ? r.json() : null))
  .then((j) => (j && typeof j.tag_name === "string" ? j.tag_name : null))
  .catch(() => null))

/** The latest installer for this computer, once GitHub says which version that is */
export function useDesktopDownload(): string {
  const [url, setUrl] = useState(DOWNLOAD_URL)
  useEffect(() => {
    if (os === "other" || isDesktop) return
    let live = true
    void latestVersion().then((v) => { if (live && v) setUrl(installerUrl(v)) })
    return () => { live = false }
  }, [])
  return url
}
