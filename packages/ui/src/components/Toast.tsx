import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { IconX } from "../icons"

export interface ToastMsg { id: number, tone: "info" | "success" | "error", text: ReactNode, action?: { label: string, run: () => void } }

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const id = useRef(0)
  const dismiss = useCallback((tid: number) => setToasts((t) => t.filter((x) => x.id !== tid)), [])
  const push = useCallback((t: Omit<ToastMsg, "id">) => {
    const tid = ++id.current
    setToasts((list) => [...list.slice(-2), { ...t, id: tid }])
  }, [])
  return { toasts, push, dismiss }
}

export function Toasts({ toasts, dismiss }: { toasts: ToastMsg[], dismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => <Toast key={t.id} toast={t} dismiss={dismiss} />)}
    </div>
  )
}

function Toast({ toast, dismiss }: { toast: ToastMsg, dismiss: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), toast.tone === "error" ? 8000 : 5000)
    return () => clearTimeout(t)
  }, [toast, dismiss])

  return (
    <div className={`toast toast--${toast.tone}`}>
      <span className="toast__text">{toast.text}</span>
      {toast.action && (
        <button className="btn btn--ghost btn--sm" onClick={() => { toast.action?.run(); dismiss(toast.id) }}>
          {toast.action.label}
        </button>
      )}
      <button className="btn btn--icon" aria-label="Dismiss" onClick={() => dismiss(toast.id)}><IconX /></button>
    </div>
  )
}
