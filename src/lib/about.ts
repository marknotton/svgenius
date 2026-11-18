// ── About: version history and credits ──────────────────────────────────────
// Add an entry to HISTORY whenever package.json's version goes up.

export const APP_VERSION = __APP_VERSION__

export interface Release {
  version: string
  date: string
  notes: string[]
}

export const HISTORY: Release[] = [
  {
    version: "0.3.1",
    date: "18 November 2026",
    notes: ["A bigger app icon"]
  },
  {
    version: "0.3.0",
    date: "18 November 2026",
    notes: [
      "Beta: Optical centring moves artwork so its visual weight sits in the middle, with a strength slider",
      "Auto precision finds the fewest decimal places each file can keep without looking different",
      "Dark mode: follows your system, or pick Light or Dark in Settings",
      "White text on orange buttons, and the app icon's star nudged left so it looks centred"
    ]
  },
  {
    version: "0.2.0",
    date: "18 November 2026",
    notes: [
      "About section with version history and credits",
      "The browser version remembers your files, edits and flags after a refresh",
      "No file limit in the browser any more",
      "Fixed the browser page shifting and leaving a tall gap under the footer",
      "Info tips flip above their button when there's no room below",
      "File sidebar: simpler settings, with Advanced customisation for one-off settings",
      "A loading notice while the code editor starts, and it now warms up in the background"
    ]
  },
  {
    version: "0.1.0",
    date: "18 November 2026",
    notes: [
      "First public release, on the desktop (macOS, Windows) and in the browser",
      "Installable web app that works offline, hosted free on GitHub Pages",
      "Exports download as a zip in the browser, keeping folder structure",
      "Live and Optimise together in one footer control",
      "Brand orange, tidier rows and a clickable info tip"
    ]
  },
  {
    version: "Preview builds",
    date: "17–18 November 2026",
    notes: [
      "Advanced filters, colour flags and checkbox selection",
      "Exact trim bounds, Monaco code editor and an Inspect picker",
      "Report dialog in plain English, plus Beta geometry tools (flatten transforms, cut-outs, merge paths)",
      "Export and clear, file name options, sizes in px or %",
      "Real path merging and edge-to-edge trim",
      "Settings window, per-file settings, gallery view and true-aspect previews",
      "Live updates, file inspector, size and trim controls",
      "Find and replace, preview CSS, attribute rules and third-party SVGO plugins",
      "The first bulk SVGO optimiser"
    ]
  }
]

export interface Credit {
  name: string
  url: string
  licence: string
  what: string
}

export const CREDITS: Credit[] = [
  { name: "SVGO", url: "https://github.com/svg/svgo", licence: "MIT", what: "The optimiser at the heart of the app. Every plugin in the settings is SVGO's." },
  { name: "Paper.js", url: "http://paperjs.org", licence: "MIT", what: "Vector geometry: exact trim bounds, flattening transforms, cut-outs and merging paths." },
  { name: "Monaco Editor", url: "https://microsoft.github.io/monaco-editor/", licence: "MIT", what: "The code editor, the same one that powers VS Code." },
  { name: "React", url: "https://react.dev", licence: "MIT", what: "The user interface." },
  { name: "Tauri", url: "https://tauri.app", licence: "MIT / Apache-2.0", what: "The small, fast desktop app shell, with Rust for file access." },
  { name: "fflate", url: "https://github.com/101arrowz/fflate", licence: "MIT", what: "Zips up exports in the browser." },
  { name: "Vite", url: "https://vite.dev", licence: "MIT", what: "Builds and bundles the app." },
  { name: "TypeScript", url: "https://www.typescriptlang.org", licence: "Apache-2.0", what: "The language the app is written in." },
  { name: "Rust and Serde", url: "https://serde.rs", licence: "MIT / Apache-2.0", what: "The desktop side: scanning folders, reading and writing files." },
  { name: "CSSTree and CSSO", url: "https://github.com/csstree/csstree", licence: "MIT", what: "Parse and minify the CSS inside SVGs, via SVGO." },
  { name: "GitHub Pages and Actions", url: "https://pages.github.com", licence: "Service", what: "Free hosting for the browser version and builds for the desktop app." },
  { name: "Playwright", url: "https://playwright.dev", licence: "Apache-2.0", what: "Used to test the app and take the README screenshots." }
]
