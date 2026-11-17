import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

// ── Promise-based dialogs ─────────────────────────────────────────────────────
// window.prompt/confirm don't work in Tauri's webview, so we roll our own.

interface PromptOpts { title: string, initial?: string, confirmLabel?: string, hint?: string }
interface ConfirmOpts { title: string, body?: ReactNode, confirmLabel?: string, danger?: boolean }

type State =
  | { kind: "prompt", opts: PromptOpts, resolve: (v: string | null) => void }
  | { kind: "confirm", opts: ConfirmOpts, resolve: (v: boolean) => void }
  | null

export function useDialogs() {
  const [state, setState] = useState<State>(null)

  const prompt = useCallback((opts: PromptOpts) =>
    new Promise<string | null>((resolve) => setState({ kind: "prompt", opts, resolve })), [])

  const confirm = useCallback((opts: ConfirmOpts) =>
    new Promise<boolean>((resolve) => setState({ kind: "confirm", opts, resolve })), [])

  const close = () => setState(null)

  const node = state && (
    state.kind === "prompt"
      ? <PromptDialog opts={state.opts} onDone={(v) => { state.resolve(v); close() }} />
      : <ConfirmDialog opts={state.opts} onDone={(v) => { state.resolve(v); close() }} />
  )

  return { node, prompt, confirm }
}

function Modal({ children, onCancel }: { children: ReactNode, onCancel: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancel])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal" role="dialog" aria-modal="true">{children}</div>
    </div>
  )
}

function PromptDialog({ opts, onDone }: { opts: PromptOpts, onDone: (v: string | null) => void }) {
  const [value, setValue] = useState(opts.initial ?? "")
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.select() }, [])
  const trimmed = value.trim()

  return (
    <Modal onCancel={() => onDone(null)}>
      <form onSubmit={(e) => { e.preventDefault(); if (trimmed) onDone(trimmed) }}>
        <h2 className="modal__title">{opts.title}</h2>
        {opts.hint && <p className="modal__body">{opts.hint}</p>}
        <input ref={input} className="input" value={value} maxLength={80} autoFocus
          onChange={(e) => setValue(e.target.value)} />
        <div className="modal__actions">
          <button type="button" className="btn btn--secondary" onClick={() => onDone(null)}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={!trimmed}>{opts.confirmLabel ?? "Save"}</button>
        </div>
      </form>
    </Modal>
  )
}

function ConfirmDialog({ opts, onDone }: { opts: ConfirmOpts, onDone: (v: boolean) => void }) {
  return (
    <Modal onCancel={() => onDone(false)}>
      <h2 className="modal__title">{opts.title}</h2>
      {opts.body && <div className="modal__body">{opts.body}</div>}
      <div className="modal__actions">
        <button type="button" className="btn btn--secondary" onClick={() => onDone(false)}>Cancel</button>
        <button type="button" autoFocus className={`btn ${opts.danger ? "btn--danger" : "btn--primary"}`} onClick={() => onDone(true)}>
          {opts.confirmLabel ?? "OK"}
        </button>
      </div>
    </Modal>
  )
}
