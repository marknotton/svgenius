import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { configureHost } from "@svgenius/ui/host"
import { isDesktop, isPasted, listenFor, openInDefaultApp, readClipboardText, reveal } from "./lib/platform"
import "@svgenius/ui/styles.css"

// The shared UI asks this profile for anything that depends on the host
configureHost({
  name: "svgenius",
  adapter: { isDesktop, isPasted, readClipboardText, openInDefaultApp, reveal, listenFor },
  capabilities: { customPlugins: true, bulkExport: true, writeFiles: isDesktop },
})

document.documentElement.classList.add(isDesktop ? "is-desktop" : "is-web")

// The browser version installs as an app and keeps working offline
if (!isDesktop && import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
