# SVGenius

A small macOS-first desktop app for optimising SVGs in bulk with [SVGO](https://github.com/svg/svgo), so a whole folder of assets follows the same rules.

- Add SVGs by file, by folder (searched recursively) or by dragging them onto the window
- Tiny / medium / large previews on a light or dark checkerboard
- Full SVGO plugin settings, saved as named **presets** that persist between launches
- Give individual files their own preset, or make a new one just for that file
- Bulk optimise and export, optionally keeping the folder structure
- Review selected files side by side (before / after) with size savings, tweak settings and see them re-run live
- Find & replace rules per preset (match case, first or all, optional regex, before or after SVGO)
- Attribute rules (recipes): for chosen elements (`*` or `path, rect, circle`), if they have / lack / match an attribute, then set, add if missing, remove or rename an attribute, or remove the element
- Trim whitespace: crops the viewBox to the visible artwork, with padding (positive) or inset (negative) in % or viewBox units
- Width × height on every row and in review, plus a circle guide overlay for avatar-style crops
- Resizable settings sidebar (remembered), app menu with About and Reset Layout
- Preview CSS (e.g. `:root { --symbol-colour: red; }`) applied to every preview but never to exported files
- Third-party SVGO plugins: load a single-file `.js`/`.mjs` plugin (see `examples/plugins/`), toggle it per preset and pass JSON params
- Import and export presets as JSON

## Stack

Tauri v2 (Rust) + React 19 + TypeScript, built with Vite and Yarn 4. SVGO runs in Web Workers inside the webview (`svgo/browser`), so there are no sidecars. Custom plugin code is imported from a blob URL inside those workers only (hence `script-src blob:` in the CSP), so it never touches the window or Tauri's IPC. Rust only handles file IO: scanning folders, reading SVGs, writing exports and the settings file.

Settings live in the app config folder (`~/Library/Application Support/studio.yello.svgenius/settings.json` on macOS).

## Commands

| Command | What it does |
|---|---|
| `yarn install` | Install JS dependencies |
| `yarn tauri:dev` | Run the app with hot reload (Vite on :1420) |
| `yarn tauri:build` | Build the `.app` / `.dmg` into `src-tauri/target/release/bundle/` |
| `yarn build` | Typecheck and build the frontend only |
| `cargo test --manifest-path src-tauri/Cargo.toml` | Rust unit tests |
| `yarn tauri icon assets/icon.png` | Regenerate app icons |

## Layout

```
src/
  App.tsx                 wiring: files, presets, review, export
  components/             UI pieces (FileList, ConfigPanel, ReviewView, …)
  hooks/useAppSettings.ts persisted settings + preset actions
  hooks/useItems.ts       file list and optimisation queue
  lib/plugins.ts          SVGO plugin catalogue (labels, defaults, order)
  lib/settings.ts         defaults, validation, SVGO config, import/export
  lib/optimiser*.ts       Web Worker pool running SVGO
src-tauri/src/lib.rs      file IO commands
```
