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
    version: "1.1.0",
    date: "20 November 2026",
    notes: [
      "A new brand colour: magenta #AF307D, from the app icon to every accent",
      "Desktop app updates itself: About checks for a new version, and on launch you're offered Update now, Skip this release or Later",
      "SVGenius menu: Check for Updates…",
      "Projects: New Project (⌘N) picks where to save straight away. A project with unsaved changes shows a dot, and quitting, closing or opening another asks to Save, Don't save or Cancel. Lists that aren't a project are never asked about"
    ]
  },
  {
    version: "1.0.1",
    date: "19 November 2026",
    notes: [
      "List view shows each file's node count, before and after",
      "Previews lose the faint accent outline and the box around trimmed artwork",
      "Filters only offer flags that are in use, and hide Flag altogether when nothing is flagged",
      "Editor: Align and Pathfinder live in the toolbar. Click to open them like Fill and Stroke, or pin them to keep them showing",
      "Editor: double-click a selected item to switch to Direct select, drag layers out of a group (pull left as you drop), and the After tooltip mentions holding C to peek",
      "Editor: the tool hint in the header is gone"
    ]
  },
  {
    version: "1.0.0",
    date: "19 November 2026",
    notes: [
      "First proper release: a Mac .dmg (Apple silicon and Intel) and Windows installers on GitHub Releases",
      "The Mac app is called SVGenius everywhere, from the Dock to the menu bar",
      "Fresh README with screenshots, install steps and credits"
    ]
  },
  {
    version: "0.13.0",
    date: "19 November 2026",
    notes: [
      "Export one optimised SVG from a file's right-click menu",
      "Snapping works with both tools, for whole paths and single points too, and a drag sticks to its own row or column until you pull clear",
      "Copy, cut and paste in the editor: pasted items land in place and flash in Layers",
      "Layers: show or hide all and lock or unlock all, every id and class after the name, and a resizable panel",
      "Fill and stroke panels float free of the left toolbar, and the tool status floats over the canvas instead of pushing it down",
      "Greyed-out toolbar buttons still say what they do, and why they're off. Delete sits last",
      "Zoom shows 52× past 999%, and 100% is labelled as actual size",
      "Settings: a colour for the circle guide. The List/Compare button names the view it switches to"
    ]
  },
  {
    version: "0.12.0",
    date: "19 November 2026",
    notes: [
      "Projects: save everything in the list (files, edits, flags, settings and presets) as a .svgenius file and open it again later. ⌘S, ⇧⌘S and ⌘O, or the Project button",
      "Editor zoom: ⌘ and the wheel or a pinch zooms at the pointer, ⌘+ and ⌘−, Fit (⌘0) and 100% (⌘1), and Space-drag pans",
      "Previous and next file arrows in the editor, and hold C to peek at the optimised result",
      "Layers have an eye to hide things in the editor, and the eye, lock and delete icons are always there, bigger, without shifting",
      "Deleting a point selects the next one, so you can keep pressing Delete",
      "Toolbar buttons are bigger, show their tips quickly, and include the circle guide and clip. The left toolbar stacks its groups properly",
      "Rows: a double-click hint, Show in Finder next to Open in your app (new icon), a subtler selected colour, and dimensions are no longer cut off",
      "Clicking a row's \u201cExports as\u201d name shows it in File names. The Optimise button counts how many are done, and the export arrow is bigger",
      "Undo works after a Revert, outside the editor too"
    ]
  },
  {
    version: "0.11.1",
    date: "19 November 2026",
    notes: [
      "The app icon sits on the brand accent, #E1AB59, with only a hint of gradient. Every size, the web icons and the in-app logo match"
    ]
  },
  {
    version: "0.11.0",
    date: "19 November 2026",
    notes: [
      "Editor fill and stroke tools: solid, linear and radial gradient fills, stroke colour, width, caps and corners",
      "Moving items snaps to the edges and centres of other items and the viewBox, with guide lines. The magnet turns it off, ⌘ moves freely",
      "The editor toolbar runs full width, and Settings can dock it on the left",
      "Undo and redo keep what was selected; the transform box follows the item while dragging",
      "Align to the viewBox or the selection, with a switch above the align buttons",
      "Filters for everyone; the markup editor and double-click to open are in Advanced mode, and Open in editor is in every row's menu"
    ]
  },
  {
    version: "0.10.2",
    date: "19 November 2026",
    notes: [
      "The VectorCraft note under the editor preview wraps like a sentence, with a tighter line height",
      "On narrower windows the code panel gives way, so the preview never drops below 280px",
      "The checkerboard button sits last and works with your own background colour too: its squares become a shade of that colour"
    ]
  },
  {
    version: "0.10.1",
    date: "19 November 2026",
    notes: [
      "One preview background for the whole app: sun, moon, a checkerboard toggle and an ink drop for a solid colour, in the list's toolbar and the editor, always in step",
      "The editor's Duplicate, Delete, Group, Ungroup, Break apart, Convert to path and Stroke to path buttons are icons, with their names and shortcuts on hover"
    ]
  },
  {
    version: "0.10.0",
    date: "19 November 2026",
    notes: [
      "Align: left, centre, right, top, middle and bottom. One element lines up with the canvas, several with each other (or the canvas, from ···)",
      "Distribute (in ···): spread three or more evenly by their centres, or give them equal gaps",
      "Pathfinder: Unite, Minus front, Intersect and Exclude on two or more shapes. The result is one path with the top shape's paint (the bottom one's for Minus front)",
      "Lock layers from the padlock in the layers tree or the right-click menu. Locked layers, and anything inside a locked group, can't be selected, moved or edited, and clicks go through to what's underneath"
    ]
  },
  {
    version: "0.9.1",
    date: "19 November 2026",
    notes: [
      "Pressing on a path with Direct select no longer leaves every point selected afterwards, so the point menu and Delete act on the points you picked. The menu also says when it's about to change several points",
      "The editor has its own background: light or dark, and from ▾ the checkerboard on or off, or a solid colour from the picker or a hex value",
      "The tool label shows its shortcut, Select (V) or Direct select (A)",
      "The VectorCraft note has new wording and a bigger close button",
      "File sidebar: Settings for this file and Customise this file (was Advanced customisation) sit above the markup, which fills what's left without hiding anything",
      "Settings: each group has a divider, a clearer heading and a line saying what it covers"
    ]
  },
  {
    version: "0.9.0",
    date: "19 November 2026",
    notes: [
      "Two tools in the editor, like a vector app: Select (V) for whole elements and Direct select (A) for a path's points",
      "Select puts a box round the selection: drag its handles to scale (Shift keeps proportions, Alt scales from the centre) or the knob on top to rotate (Shift snaps to 15°). Plain paths take the change into their points, everything else gets a transform",
      "Right-click a point (or several) to convert it to a line, curve, quadratic and more, add a point after it, switch it between absolute and relative, or delete it",
      "Alt- or ⌘-click a point to flip it between corner and smooth, and Delete removes selected points rather than the whole path",
      "Clicking an element's tag name in the code selects the whole element, ready to delete or cut",
      "The VectorCraft note moves under the preview, with a close button that this device remembers"
    ]
  },
  {
    version: "0.8.0",
    date: "19 November 2026",
    notes: [
      "The top bar is gone. The logo (click it for About), the desktop app link and Settings sit at the bottom left of the footer, and Advanced sits at the right of the sidebar's tabs. The Mac app keeps a slim empty strip for its window buttons",
      "Editor: drag to resize the code panel and the path tools, and a layout switch (top right) moves them along the bottom for wide artwork",
      "Refreshing the page brings you back to the same file, with the editor open if it was",
      "Points on H and V lines (common in Illustrator exports) can now move sideways as well as up and down",
      "The sidebar's markup box fills the spare height, and Expand is now an Open editor button",
      "Filters: Add rule is a proper button under the last rule",
      "Wording: Inspect is now List view, CSS is now Inject CSS, and Edit contents comes before Edit viewBox",
      "Each row's checkbox and flag are stacked, the canvas hint is crisp, and toggles with an info tooltip no longer show a second, native tooltip on top"
    ]
  },
  {
    version: "0.7.3",
    date: "19 November 2026",
    notes: [
      "Arrow keys move only the selected points on a path, not the whole shape",
      "The editor now says what it is: a basic tool for tidying markup. For real artwork it points to VectorCraft, a free, fuller vector editor (not affiliated)"
    ]
  },
  {
    version: "0.7.2",
    date: "19 November 2026",
    notes: [
      "Responsive layout: on narrow windows and phones the settings panel becomes a drawer along the bottom. Drag its handle to resize it, double-click to tuck it away",
      "The top bar, toolbar, file cards and footer tighten up on small screens, and the footer stacks into three rows",
      "The editor goes full screen on a phone, with the canvas, layers and code stacked"
    ]
  },
  {
    version: "0.7.1",
    date: "19 November 2026",
    notes: [
      "⌘-shortcuts work in the desktop app: they now go through the app's menus, with a new Object menu for the editor's tools",
      "⌘A selects every file in the list, or every shape in the editor",
      "Layers select like Finder: Shift-click for a range, ⌘-click to add or remove one",
      "Break apart (⇧⌘B) splits a path that draws several shapes into one path per shape, in a group",
      "Path tools sit under the code at a fixed height, and clicking in the code no longer drops the selection"
    ]
  },
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
  { name: "VectorCraft", url: "https://getartcraft.com/apps/vectorcraft", licence: "Free · not affiliated", what: "SVGenius's editor is a basic tool for tidying markup, not an art tool. For drawing and richer vector work, VectorCraft is a free, fuller editor." },
  { name: "SVGOMG", url: "https://github.com/jakearchibald/svgomg", licence: "by Jake Archibald · MIT", what: "The original friendly face for SVGO, with live before and after previews." }
]
