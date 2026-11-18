import { useEffect, useRef, useState } from "react"
import type { editor as MonacoEditor } from "monaco-editor/editor"

// ── Code editor (Monaco) ──────────────────────────────────────────────────────
// Loads Monaco on first use. A plain textarea stands in until it's ready.

type Monaco = typeof import("monaco-editor/editor")

let monacoReady: Promise<Monaco> | null = null
const loadMonaco = () => (monacoReady ??= import("../lib/monaco").then((m) => m.monaco))

let editorTheme = "vs"
/** Light or dark code editors, now and for any opened later */
export function setEditorTheme(dark: boolean) {
  editorTheme = dark ? "vs-dark" : "vs"
  monacoReady?.then((m) => m.editor.setTheme(editorTheme)).catch(() => {})
}

/** Warms Monaco up in the background so the first editor opens quickly */
export function preloadMonaco() {
  const go = () => { loadMonaco().catch(() => { monacoReady = null }) }
  if ("requestIdleCallback" in window) requestIdleCallback(go, { timeout: 4000 })
  else setTimeout(go, 1500)
}

interface Props {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  className?: string
  label: string
  /** Character range to select and scroll to */
  reveal?: { start: number, end: number, n: number } | null
  /** Character range to mark (e.g. the hovered element) */
  mark?: { start: number, end: number } | null
  /** Fires when the cursor moves by the user's hand */
  onCursor?: (offset: number) => void
}

export function CodeEditor({ value, onChange, readOnly, className, label, reveal, mark, onCursor }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const ed = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const marks = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)
  const [ready, setReady] = useState(false)
  const latest = useRef({ onChange, onCursor, value })
  latest.current = { onChange, onCursor, value }
  const applying = useRef(false)

  useEffect(() => {
    let disposed = false
    loadMonaco().then((monaco) => {
      if (disposed || !host.current) return
      monacoRef.current = monaco
      const editor = monaco.editor.create(host.current, {
        value: latest.current.value,
        language: "xml",
        theme: editorTheme,
        readOnly,
        automaticLayout: true,
        wordWrap: "on",
        minimap: { enabled: false },
        fontSize: 12,
        lineNumbersMinChars: 3,
        scrollBeyondLastLine: false,
        folding: true,
        renderLineHighlight: "line",
        tabSize: 2,
        ariaLabel: label,
        fixedOverflowWidgets: true
      })
      editor.onDidChangeModelContent(() => {
        if (applying.current) return
        latest.current.onChange?.(editor.getValue())
      })
      editor.onDidChangeCursorPosition((e) => {
        if (e.source !== "mouse" && e.source !== "keyboard") return
        const model = editor.getModel()
        if (model) latest.current.onCursor?.(model.getOffsetAt(e.position))
      })
      marks.current = editor.createDecorationsCollection()
      ed.current = editor
      setReady(true)
    })
    return () => {
      disposed = true
      const model = ed.current?.getModel()
      ed.current?.dispose()
      model?.dispose()
      ed.current = null
    }
    // Created once; later prop changes are applied below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { ed.current?.updateOptions({ readOnly }) }, [readOnly, ready])

  // Outside changes (another editor, revert, a new result) flow in, keeping undo
  useEffect(() => {
    const editor = ed.current
    const model = editor?.getModel()
    if (!editor || !model || model.getValue() === value) return
    applying.current = true
    if (readOnly) model.setValue(value)
    else model.pushEditOperations([], [{ range: model.getFullModelRange(), text: value }], () => null)
    applying.current = false
  }, [value, ready, readOnly])

  useEffect(() => {
    const editor = ed.current, monaco = monacoRef.current
    const model = editor?.getModel()
    if (!editor || !monaco || !model || !reveal) return
    const a = model.getPositionAt(reveal.start), b = model.getPositionAt(reveal.end)
    const range = new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column)
    editor.setSelection(range)
    editor.revealRangeInCenterIfOutsideViewport(range)
    // Ready for Delete, Backspace or typing over it
    editor.focus()
  }, [reveal, ready])

  useEffect(() => {
    const editor = ed.current, monaco = monacoRef.current
    const model = editor?.getModel()
    if (!editor || !monaco || !model) return
    if (!mark) { marks.current?.clear(); return }
    const a = model.getPositionAt(mark.start), b = model.getPositionAt(mark.end)
    marks.current?.set([{ range: new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column), options: { inlineClassName: "code-mark", isWholeLine: false } }])
  }, [mark, ready, value])

  return (
    <div className={`code-editor${className ? ` ${className}` : ""}`}>
      <div ref={host} className="code-editor__host" />
      {!ready && (
        <textarea className="input input--mono code-editor__fallback" spellCheck={false} value={value} readOnly={readOnly}
          aria-label={label} onChange={(e) => onChange?.(e.target.value)} />
      )}
      {!ready && (
        <div className="code-editor__loading" role="status">
          <span className="spinner spinner--sm" /> Loading editor…
        </div>
      )}
    </div>
  )
}
