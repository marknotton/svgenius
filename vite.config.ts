import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig(async () => ({
  plugins: [react()],
  // GitHub Pages serves the web build from /svgenius/ (see yarn build:web)
  base: process.env.SVGENIUS_BASE ?? "/",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] }
  },
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  worker: { format: "es" as const },
  build: {
    // WKWebView on macOS, WebView2 (Chromium) on Windows
    // The browser build aims at current evergreen browsers
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : process.env.SVGENIUS_BASE ? ["chrome111", "safari16", "firefox115"] : "safari16",
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG
  }
}))
