use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use tauri::menu::{AboutMetadataBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{App, AppHandle, Emitter, Manager, State};
use tauri::RunEvent;

// ── Shared state ──────────────────────────────────────────────────────────────

/// Paths handed to the app by Finder ("Open With") before the UI was ready.
type PendingOpenFiles = Arc<Mutex<Vec<String>>>;

const SETTINGS_FILE: &str = "settings.json";
const MAX_SVG_BYTES: u64 = 25 * 1024 * 1024;
const MAX_PLUGIN_BYTES: u64 = 2 * 1024 * 1024;

// ── Payloads ──────────────────────────────────────────────────────────────────

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScannedFile {
    path: String,
    name: String,
    /// Path relative to whatever the user picked, used to rebuild folder
    /// structure on export. A dropped folder keeps its own name as the root.
    rel_path: String,
    size: u64,
    /// Last modified, in ms since the epoch, when the OS knows it
    mtime: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginFile {
    file_name: String,
    code: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportFile {
    rel_path: String,
    contents: String,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn is_svg(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("svg"))
        .unwrap_or(false)
}

fn is_hidden(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(|n| n.starts_with('.'))
        .unwrap_or(false)
}

fn to_slash(path: &Path) -> String {
    path.components()
        .filter_map(|c| match c {
            Component::Normal(s) => Some(s.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn walk_dir(root: &Path, base: &Path, out: &mut Vec<ScannedFile>) {
    let Ok(entries) = fs::read_dir(root) else { return };
    let mut entries: Vec<_> = entries.flatten().map(|e| e.path()).collect();
    entries.sort();
    for path in entries {
        if is_hidden(&path) {
            continue;
        }
        // Don't follow symlinked folders, avoids loops
        let Ok(meta) = fs::symlink_metadata(&path) else { continue };
        if meta.is_dir() {
            if path.file_name().map(|n| n == "node_modules").unwrap_or(false) {
                continue;
            }
            walk_dir(&path, base, out);
        } else if is_svg(&path) {
            push_file(&path, base, out);
        }
    }
}

fn push_file(path: &Path, base: &Path, out: &mut Vec<ScannedFile>) {
    let Ok(meta) = fs::metadata(path) else { return };
    if !meta.is_file() {
        return;
    }
    let rel = path.strip_prefix(base).map(to_slash).unwrap_or_else(|_| {
        path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
    });
    out.push(ScannedFile {
        path: path.to_string_lossy().into_owned(),
        name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        rel_path: rel,
        size: meta.len(),
        mtime: meta.modified().ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as f64),
    });
}

/// Only allow plain relative paths for export, so nothing escapes the output folder.
fn safe_join(base: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    if rel_path.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(format!("Refusing unsafe export path: {rel}"));
    }
    if !is_svg(rel_path) {
        return Err(format!("Only .svg files can be exported: {rel}"));
    }
    Ok(base.join(rel_path))
}

fn ensure_json(path: &Path) -> Result<(), String> {
    let ok = path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("json") || e.eq_ignore_ascii_case("svgenius"))
        .unwrap_or(false);
    if ok { Ok(()) } else { Err("Settings and project files must end in .json or .svgenius".into()) }
}

fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|d| d.join(SETTINGS_FILE))
        .map_err(|e| e.to_string())
}

// ── Commands: files ───────────────────────────────────────────────────────────

/// Expands a mix of files and folders into a flat list of SVGs.
#[tauri::command]
fn scan_paths(paths: Vec<String>) -> Vec<ScannedFile> {
    let mut out = Vec::new();
    for p in paths {
        let path = PathBuf::from(&p);
        if path.is_dir() {
            let base = path.parent().map(Path::to_path_buf).unwrap_or_else(|| path.clone());
            walk_dir(&path, &base, &mut out);
        } else if is_svg(&path) {
            let base = path.parent().map(Path::to_path_buf).unwrap_or_default();
            push_file(&path, &base, &mut out);
        }
    }
    out
}

#[tauri::command]
fn read_svg(path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    if !is_svg(&path) {
        return Err("Not an .svg file".into());
    }
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > MAX_SVG_BYTES {
        return Err("File is larger than 25 MB".into());
    }
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Last-modified times (ms since the epoch) for each path, or null if it's gone.
/// The app polls this to pick up files saved in another editor.
#[tauri::command]
fn file_mtimes(paths: Vec<String>) -> Vec<Option<u64>> {
    paths
        .iter()
        .map(|p| {
            fs::metadata(p)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
        })
        .collect()
}

/// Which of these relative paths already exist inside `out_dir`.
#[tauri::command]
fn existing_files(out_dir: String, rel_paths: Vec<String>) -> Result<Vec<String>, String> {
    let base = PathBuf::from(out_dir);
    let mut found = Vec::new();
    for rel in rel_paths {
        if safe_join(&base, &rel)?.exists() {
            found.push(rel);
        }
    }
    Ok(found)
}

#[tauri::command]
fn export_files(out_dir: String, files: Vec<ExportFile>) -> Result<Vec<String>, String> {
    let base = PathBuf::from(out_dir);
    if !base.is_dir() {
        return Err("Export folder doesn't exist".into());
    }
    let mut written = Vec::with_capacity(files.len());
    for f in files {
        let target = safe_join(&base, &f.rel_path)?;
        write_atomic(&target, &f.contents).map_err(|e| format!("{}: {e}", f.rel_path))?;
        written.push(target.to_string_lossy().into_owned());
    }
    Ok(written)
}

// ── Commands: settings ────────────────────────────────────────────────────────

#[tauri::command]
fn load_settings(app: AppHandle) -> Result<Option<String>, String> {
    let path = settings_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_settings(app: AppHandle, json: String) -> Result<(), String> {
    write_atomic(&settings_path(&app)?, &json)
}

#[tauri::command]
fn read_json_file(path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    ensure_json(&path)?;
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_json_file(path: String, contents: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    ensure_json(&path)?;
    fs::write(path, contents).map_err(|e| e.to_string())
}

/// Reads a third-party SVGO plugin. The code itself only ever runs inside the
/// frontend's optimiser worker.
#[tauri::command]
fn read_plugin_file(path: String) -> Result<PluginFile, String> {
    let path = PathBuf::from(path);
    let ok = path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("js") || e.eq_ignore_ascii_case("mjs"))
        .unwrap_or(false);
    if !ok {
        return Err("Plugins must be .js or .mjs files".into());
    }
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > MAX_PLUGIN_BYTES {
        return Err("Plugin file is larger than 2 MB".into());
    }
    Ok(PluginFile {
        file_name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        code: fs::read_to_string(&path).map_err(|e| e.to_string())?,
    })
}

#[tauri::command]
fn take_pending_open_files(state: State<'_, PendingOpenFiles>) -> Vec<String> {
    std::mem::take(&mut *state.lock().unwrap())
}

// ── Unsaved project guard ─────────────────────────────────────────────────────
// The page says when an open project has unsaved changes. Quitting or closing
// the window then asks the page first ("app:quit-requested"), which asks the
// user and calls quit_app when it's fine to go

static UNSAVED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn set_unsaved(unsaved: bool) {
    UNSAVED.store(unsaved, Ordering::SeqCst);
}

// ── Default app name ──────────────────────────────────────────────────────────
// The name of the app the system opens a file with, for the "Open in…" confirm.
// macOS asks NSWorkspace through JavaScript for Automation, so no extra crates

#[tauri::command]
fn default_app_name(path: String) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let script = r#"function run(argv) {
  ObjC.import("AppKit");
  const app = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.fileURLWithPath(argv[0]));
  if (!app || app.isNil()) return "";
  return ObjC.unwrap($.NSFileManager.defaultManager.displayNameAtPath(app.path)).replace(/\.app$/, "");
}"#;
        let out = std::process::Command::new("/usr/bin/osascript")
            .args(["-l", "JavaScript", "-e", script, &path])
            .output()
            .ok()?;
        let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if out.status.success() && !name.is_empty() { Some(name) } else { None }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        None
    }
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    UNSAVED.store(false, Ordering::SeqCst);
    app.exit(0);
}

fn request_quit(app: &AppHandle) -> bool {
    if UNSAVED.load(Ordering::SeqCst) {
        let _ = app.emit("app:quit-requested", ());
        return false;
    }
    true
}

// ── Menu ──────────────────────────────────────────────────────────────────────

fn build_menu(app: &App) -> tauri::Result<()> {
    let version = app.package_info().version.to_string();
    let about = AboutMetadataBuilder::new()
        .name(Some("SVGenius"))
        .version(Some(version))
        .authors(Some(vec!["Mark Notton".to_string()]))
        .copyright(Some("© 2026 Mark Notton"))
        .comments(Some("Bulk SVG optimiser built on SVGO"))
        .credits(Some("Made by Mark Notton\nBuilt with Tauri, React and SVGO"))
        .website(Some("https://github.com/marknotton/svgenius"))
        .build();

    let settings = MenuItemBuilder::with_id("settings", "Settings…")
        .accelerator("CmdOrCtrl+,")
        .build(app)?;
    let reset_layout = MenuItemBuilder::with_id("reset-layout", "Reset Layout").build(app)?;
    let updates = MenuItemBuilder::with_id("updates", "Check for Updates…").build(app)?;
    // Our own Quit, so unsaved project changes get a say first
    let quit = MenuItemBuilder::with_id("quit", "Quit SVGenius").accelerator("CmdOrCtrl+Q").build(app)?;

    let app_menu = SubmenuBuilder::new(app, "SVGenius")
        .about(Some(about))
        .item(&updates)
        .separator()
        .item(&settings)
        .item(&reset_layout)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .item(&quit)
        .build()?;

    // Without an Edit menu, copy/paste shortcuts don't work in inputs on macOS.
    // Undo, redo, select all and the editor's tools are our own items: on
    // macOS the menu gets ⌘-shortcuts before the page does, so they're sent to
    // the page as commands, which hands them to the text field or the editor
    let cmd = |id: &str, label: &str, keys: &str| {
        MenuItemBuilder::with_id(format!("cmd:{id}"), label).accelerator(keys).build(app)
    };
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .item(&cmd("undo", "Undo", "CmdOrCtrl+Z")?)
        .item(&cmd("redo", "Redo", "CmdOrCtrl+Shift+Z")?)
        .separator()
        .cut()
        .copy()
        .paste()
        .item(&cmd("selectAll", "Select All", "CmdOrCtrl+A")?)
        .build()?;

    let object_menu = SubmenuBuilder::new(app, "Object")
        .item(&cmd("duplicate", "Duplicate", "CmdOrCtrl+D")?)
        .separator()
        .item(&cmd("group", "Group", "CmdOrCtrl+G")?)
        .item(&cmd("ungroup", "Ungroup", "CmdOrCtrl+Shift+G")?)
        .item(&cmd("breakApart", "Break Apart", "CmdOrCtrl+Shift+B")?)
        .separator()
        .item(&cmd("forward", "Bring Forward", "CmdOrCtrl+]")?)
        .item(&cmd("backward", "Send Backward", "CmdOrCtrl+[")?)
        .build()?;

    // Projects: every loaded file with its settings and edits, in one .svgenius file
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&cmd("addSvgs", "Add SVGs…", "CmdOrCtrl+Shift+O")?)
        .separator()
        .item(&cmd("newProject", "New Project…", "CmdOrCtrl+N")?)
        .item(&cmd("openProject", "Open Project…", "CmdOrCtrl+O")?)
        .separator()
        .item(&cmd("saveProject", "Save Project", "CmdOrCtrl+S")?)
        .item(&cmd("saveProjectAs", "Save Project As…", "CmdOrCtrl+Shift+S")?)
        .build()?;

    // Zoom is the editor's canvas, not the window
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&cmd("zoomIn", "Zoom In", "CmdOrCtrl+Equal")?)
        .item(&cmd("zoomOut", "Zoom Out", "CmdOrCtrl+Minus")?)
        .separator()
        .item(&cmd("zoomFit", "Fit to Screen", "CmdOrCtrl+0")?)
        .item(&cmd("zoomActual", "Actual Size (100%)", "CmdOrCtrl+1")?)
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;

    let menu = MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &object_menu, &view_menu, &window_menu])
        .build()?;
    app.set_menu(menu)?;

    app.on_menu_event(|app, event| {
        match event.id().as_ref() {
            "reset-layout" => { let _ = app.emit("menu:reset-layout", ()); }
            "settings" => { let _ = app.emit("menu:settings", ()); }
            "updates" => { let _ = app.emit("menu:updates", ()); }
            "quit" => { if request_quit(app) { app.exit(0); } }
            id if id.starts_with("cmd:") => { let _ = app.emit("menu:command", id.trim_start_matches("cmd:").to_string()); }
            _ => {}
        }
    });
    Ok(())
}

// ── App entry point ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pending: PendingOpenFiles = Arc::new(Mutex::new(Vec::new()));

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(pending)
        .setup(|app| {
            build_menu(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_paths,
            read_svg,
            file_mtimes,
            existing_files,
            export_files,
            load_settings,
            save_settings,
            read_json_file,
            write_json_file,
            read_plugin_file,
            take_pending_open_files,
            set_unsaved,
            default_app_name,
            quit_app
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, _event| {
        // Closing the window or quitting from the Dock with unsaved project changes
        match &_event {
            RunEvent::WindowEvent { event: tauri::WindowEvent::CloseRequested { api, .. }, .. } => {
                if !request_quit(_app_handle) { api.prevent_close(); }
            }
            RunEvent::ExitRequested { api, code: None, .. } => {
                if !request_quit(_app_handle) { api.prevent_exit(); }
            }
            _ => {}
        }
        // Finder "Open With" / dropping SVGs on the Dock icon
        #[cfg(any(target_os = "macos", target_os = "ios"))]
        if let RunEvent::Opened { urls } = _event {
            let paths: Vec<String> = urls
                .into_iter()
                .filter_map(|u| u.to_file_path().ok())
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            if !paths.is_empty() {
                let _ = _app_handle.emit("files:opened", paths.clone());
                _app_handle.state::<PendingOpenFiles>().lock().unwrap().extend(paths);
            }
        }
    });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_join_rejects_escapes() {
        let base = Path::new("/tmp/out");
        assert!(safe_join(base, "../evil.svg").is_err());
        assert!(safe_join(base, "/etc/evil.svg").is_err());
        assert!(safe_join(base, "icons/ok.txt").is_err());
        assert_eq!(safe_join(base, "icons/ok.svg").unwrap(), base.join("icons/ok.svg"));
    }

    #[test]
    fn scan_keeps_folder_name_as_root() {
        let dir = std::env::temp_dir().join("svgenius-scan-test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("icons/sub")).unwrap();
        fs::create_dir_all(dir.join("icons/.hidden")).unwrap();
        fs::write(dir.join("icons/a.svg"), "<svg/>").unwrap();
        fs::write(dir.join("icons/sub/b.SVG"), "<svg/>").unwrap();
        fs::write(dir.join("icons/.hidden/c.svg"), "<svg/>").unwrap();
        fs::write(dir.join("icons/notes.txt"), "nope").unwrap();

        let found = scan_paths(vec![dir.join("icons").to_string_lossy().into_owned()]);
        let rels: Vec<_> = found.iter().map(|f| f.rel_path.as_str()).collect();
        assert_eq!(rels, vec!["icons/a.svg", "icons/sub/b.SVG"]);
        let _ = fs::remove_dir_all(&dir);
    }
}
