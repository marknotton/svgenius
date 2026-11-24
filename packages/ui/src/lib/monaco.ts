// ── Monaco, slimmed down ──────────────────────────────────────────────────────
// Just the editor, its everyday features and XML. Loaded on demand, so app
// start-up isn't held up by it.

import * as monaco from "monaco-editor/editor"
import "monaco-editor/features/register.all"
import "monaco-editor/languages/definitions/xml/register"
import EditorWorker from "monaco-editor/editor/editor.worker?worker"

self.MonacoEnvironment = { getWorker: () => new EditorWorker() }

const dark = () => window.matchMedia("(prefers-color-scheme: dark)").matches
monaco.editor.setTheme(dark() ? "vs-dark" : "vs")
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => monaco.editor.setTheme(dark() ? "vs-dark" : "vs"))

export { monaco }
