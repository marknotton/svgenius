import { useEffect, useRef } from "react"
import { isDesktop, listenFor } from "./platform"

// ── Commands: shortcuts that work the same in the browser and on the desktop ─
// On macOS the app menu takes ⌘-shortcuts before the page sees them, so the
// desktop app sends them here as menu commands. In the browser the same
// commands come from key presses. Either way the topmost handler (the open
// editor, say) gets first go, and text fields keep their usual behaviour.

import type { Command } from "@svgenius/core/types"
export type { Command }

type Handler = (cmd: Command) => boolean

const stack: Handler[] = []

/** Undo, redo and select all for whichever code editor has focus */
let monaco: ((cmd: Command) => boolean) | null = null
export const setCodeEditorCommands = (fn: (cmd: Command) => boolean) => { monaco = fn }

/** Adds a handler while the component is mounted. Return true when handled */
export function useCommands(handler: Handler, active = true) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!active) return
    const h: Handler = (c) => ref.current(c)
    stack.push(h)
    return () => { const i = stack.indexOf(h); if (i >= 0) stack.splice(i, 1) }
  }, [active])
}

/** The focused text field, if any, which keeps undo and select all for itself */
export function textFocus() {
  const el = document.activeElement as HTMLElement | null
  if (!el) return null
  if (el.closest(".monaco-editor")) return "monaco" as const
  if (el.matches("input, textarea, [contenteditable=true], [contenteditable='']")) return "field" as const
  return null
}

/** Native editing for a plain text field */
function nativeEdit(cmd: Command) {
  const el = document.activeElement as HTMLInputElement | null
  if (cmd === "selectAll" && el && "select" in el) { el.select(); return true }
  if (cmd === "undo" || cmd === "redo" || cmd === "selectAll") return document.execCommand(cmd)
  return false
}

export function dispatch(cmd: Command) {
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i](cmd)) return true
  const focus = textFocus()
  if (focus === "field") return nativeEdit(cmd)
  if (focus === "monaco") return monaco?.(cmd) ?? false
  return false
}

/** The browser's keys for each command */
export function commandFor(e: KeyboardEvent): Command | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null
  const k = e.key.toLowerCase()
  if (k === "z") return e.shiftKey ? "redo" : "undo"
  if (k === "y" && !e.shiftKey) return "redo"
  if (k === "a" && !e.shiftKey) return "selectAll"
  if (k === "d" && !e.shiftKey) return "duplicate"
  if (k === "g") return e.shiftKey ? "ungroup" : "group"
  if (k === "b" && e.shiftKey) return "breakApart"
  if (e.key === "]") return "forward"
  if (e.key === "[") return "backward"
  if (k === "=" || k === "+") return "zoomIn"
  if (k === "-" || k === "_") return "zoomOut"
  if (k === "0") return "zoomFit"
  if (k === "1") return "zoomActual"
  if (k === "o") return e.shiftKey ? "addSvgs" : "openProject"
  if (k === "n" && !e.shiftKey) return "newProject"
  if (k === "s") return e.shiftKey ? "saveProjectAs" : "saveProject"
  return null
}

/**
 * Starts listening, once, for the app. Desktop: the menu's commands. Browser:
 * the keys, which go to text fields as normal unless a handler takes them.
 */
export function listenForCommands() {
  const offMenu = isDesktop ? listenFor<Command>("menu:command", (c) => { dispatch(c) }) : () => {}
  const key = (e: KeyboardEvent) => {
    const cmd = commandFor(e)
    if (!cmd) return
    // Unhandled, it carries on to the text field or Monaco as usual
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i](cmd)) { e.preventDefault(); e.stopPropagation(); return }
    }
  }
  // Capture, so Monaco doesn't take ⌘Z for its own history first
  window.addEventListener("keydown", key, true)
  return () => { offMenu(); window.removeEventListener("keydown", key, true) }
}
