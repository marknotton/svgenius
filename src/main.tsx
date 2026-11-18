import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { isDesktop } from "./lib/platform"
import "./styles.css"

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
