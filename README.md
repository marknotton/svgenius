# SVGenius

A small macOS-first desktop app for optimising SVGs in bulk with [SVGO](https://github.com/svg/svgo), so a whole folder of assets follows the same rules.

- Add SVGs by file, by folder (searched recursively) or by dragging them onto the window
- Tiny / medium / large previews on a light or dark checkerboard
- Full SVGO plugin settings, saved as named **presets** that persist between launches
- Give individual files their own preset, or make a new one just for that file
- Bulk optimise and export, optionally keeping the folder structure
- Review selected files side by side (before / after) with size savings, tweak settings and see them re-run live
- Import and export presets as JSON

## Stack

Tauri v2 (Rust) + React 19 + TypeScript, built with Vite and Yarn 4. SVGO runs in Web Workers inside the webview (`svgo/browser`), so there are no sidecars. Rust only handles file IO: scanning folders, reading SVGs, writing exports and the settings file.

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
