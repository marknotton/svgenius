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
    version: "0.7.0",
    date: "18 November 2026",
    notes: [
      "Select several elements in the editor: ⌘-click or Shift-click shapes and layers, or drag a box over empty canvas (⌘A selects every shape)",
      "Drag the selection to move it, or nudge it with the arrow keys (Shift for 10)",
      "Bulk tools on a toolbar, the right-click menu and shortcuts: duplicate (⌘D), delete, group (⌘G), ungroup (⇧⌘G), bring forward and send backward (⌘] ⌘[), convert to path and stroke to path"
    ]
  },
  {
    version: "0.6.1",
    date: "18 November 2026",
    notes: [
      "Undo and redo in the expanded editor cover every change: typing, dragging points, nudges and layer edits",
      "Preview CSS now styles the expanded editor's previews too, :root custom properties included",
      "Hovering a layer highlights its shape on the canvas",
      "The editor preview shows the SVG's own canvas with no padding around it",
      "The title bar stays usable while a dialog is open",
      "No more \"No SVGs found there\" message when the desktop app starts"
    ]
  },
  {
    version: "0.6.0",
    date: "18 November 2026",
    notes: [
      "Drag across a path's points to select several, then drag them or nudge them with the arrow keys",
      "Press on the selected path to move all of it",
      "Right-click a layer to duplicate, convert, move or delete it, or drag layers to reorder them",
      "Clicking empty canvas clears the selection instead of picking the whole SVG",
      "The CSS bar says when a selector stops matching after optimising, and which SVGO plugin is the likely cause",
      "About lists the tools that inspired SVGenius"
    ]
  },
  {
    version: "0.5.0",
    date: "18 November 2026",
    notes: [
      "Layers in the expanded editor: every element as a tree you can fold, select and delete",
      "Path tools: drag a path's points and handles, edit its commands, Reverse it, or switch it between absolute and relative",
      "Convert to path for rectangles, circles, ellipses, lines and polygons",
      "Very heavy files (over 3 MB or 15,000 elements) aren't previewed or optimised until you choose Render anyway"
    ]
  },
  {
    version: "0.4.1",
    date: "18 November 2026",
    notes: [
      "Files saved in another app reload straight away (desktop), keeping your settings and flags",
      "Apply optimisation in the expanded editor turns the optimised markup into the editable version",
      "Double-click a file to open the expanded editor",
      "The SVGO plugins show in the simple view too"
    ]
  },
  {
    version: "0.4.0",
    date: "18 November 2026",
    notes: [
      "A simpler first view: an Advanced switch reveals the viewBox and contents tools, rules, every plugin, filters, import and export, and Beta tools",
      "The expanded editor always shows a preview you can click; picking a shape selects its markup so Delete removes it",
      "Preview CSS now overrides inline styles too, so it works on the After preview",
      "Before and after previews always show side by side",
      "Open a file in your default SVG app (desktop)",
      "Fixes: the clipped Strokes become cut-outs row, a joined circle guide and clip control, and an explanation for Flatten transforms"
    ]
  },
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

/** Tools whose ideas shaped SVGenius. No code is borrowed from them */
export const INSPIRATION: Credit[] = [
  { name: "SVG Path Editor", url: "https://github.com/Yqnn/svg-path-editor", licence: "by Yqnn · AGPL-3.0", what: "The path tools: the command list, draggable points and handles, absolute and relative switching, and Reverse." },
  { name: "Inkscape", url: "https://inkscape.org", licence: "GPL-2.0+", what: "Its XML editor and layers panel inspired the layers tree you can select, reorder and duplicate from." },
  { name: "Browser developer tools", url: "https://developer.chrome.com/docs/devtools", licence: "Chromium / Firefox", what: "The Inspect picker: hover the artwork, click a shape, land on its markup." },
  { name: "SVGOMG", url: "https://github.com/jakearchibald/svgomg", licence: "by Jake Archibald · MIT", what: "The original friendly face for SVGO, with live before and after previews." }
]
