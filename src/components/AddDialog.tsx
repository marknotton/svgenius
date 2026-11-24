import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { IconCode, IconFile, IconFolder, IconX } from "../icons"
import { readClipboardText } from "../lib/platform"
import { looksLikeSvg, prepareSvg, sizeCheck, uniqueName, type Prepared } from "@svgenius/core/svgImport"
import { formatBytes, plural } from "@svgenius/core/format"
import { svgSize, fmtNum } from "@svgenius/core/svgRoot"
import type { Backdrop } from "@svgenius/core/types"
import { Modal } from "./Dialogs"
import { Thumb } from "./Thumb"

// ── Add SVGs ──────────────────────────────────────────────────────────────────
// One place for every way in: files, a folder, or code pasted from the
// clipboard (checked, tidied and named before it joins the list).

export type AddMode = "choose" | "paste"

const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+"

/** Files, Folder and Paste code. Shared by the start screen and the Add dialog */
export function AddChoices({ onFiles, onFolder, onPaste, active, tiles }: { onFiles: () => void, onFolder: () => void, onPaste: () => void, active?: AddMode, tiles?: boolean }) {
  if (!tiles) {
    return (
      <div className="empty__actions">
        <button className="btn btn--primary" onClick={onFiles}><IconFile /> Choose files</button>
        <button className="btn btn--secondary" onClick={onFolder}><IconFolder /> Choose folder</button>
        <button className="btn btn--secondary" onClick={onPaste} title={`Paste SVG markup from the clipboard, or type it in. ${mod}V anywhere does the same`}><IconCode /> Paste code</button>
      </div>
    )
  }
  const tile = (icon: ReactNode, label: string, desc: string, run: () => void, on = false) => (
    <button type="button" className={`add-tile${on ? " is-active" : ""}`} onClick={run} aria-pressed={on}>
      <span className="add-tile__icon">{icon}</span>
      <span className="add-tile__label">{label}</span>
      <span className="add-tile__desc">{desc}</span>
    </button>
  )
  return (
    <div className="add-tiles">
      {tile(<IconFile width={20} height={20} />, "Files", "Pick one or more SVGs", onFiles)}
      {tile(<IconFolder width={20} height={20} />, "Folder", "Every SVG inside, sub-folders too", onFolder)}
      {tile(<IconCode width={20} height={20} />, "Paste code", "SVG markup from the clipboard", onPaste, active === "paste")}
    </div>
  )
}

type Clip = "idle" | "reading" | "pasted" | "empty" | "denied"

interface Props {
  mode: AddMode
  /** Markup that came with the dialog (pasted with ⌘V somewhere in the app) */
  text?: string
  backdrop: Backdrop
  /** Names already in the list, so new ones don't clash */
  taken: string[]
  onFiles: () => void
  onFolder: () => void
  onAdd: (files: Array<{ name: string, svg: string }>) => void
  onClose: () => void
}

/** Shown in the textarea up to this size; anything bigger is held but not displayed */
const SHOW_LIMIT = 2 * 1024 * 1024

export function AddDialog(p: Props) {
  const [mode, setMode] = useState<AddMode>(p.mode)
  const [text, setText] = useState(p.text ?? "")
  const [clip, setClip] = useState<Clip>(p.text ? "pasted" : "idle")
  const [allowBig, setAllowBig] = useState(false)
  const [result, setResult] = useState<Prepared | null>(null)
  const [names, setNames] = useState<string[]>([])
  const [edited, setEdited] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)

  // Opening the paste view reads the clipboard once, if there's nothing in the box yet
  const asked = useRef(false)
  useEffect(() => {
    if (mode !== "paste" || asked.current || text) return
    asked.current = true
    setClip("reading")
    readClipboardText()
      .then((t) => {
        if (looksLikeSvg(t)) { setText(t); setClip("pasted") }
        else { setClip("empty"); area.current?.focus() }
      })
      .catch(() => { setClip("denied"); area.current?.focus() })
  }, [mode, text])

  const size = useMemo(() => sizeCheck(text), [text])
  const waiting = !!size.warn && !allowBig

  // Validate as you type, a moment after the typing stops
  useEffect(() => {
    if (!text.trim()) { setResult(null); return }
    if (size.block || waiting) { setResult(null); return }
    const t = setTimeout(() => setResult(prepareSvg(text)), text.length > 200_000 ? 400 : 180)
    return () => clearTimeout(t)
  }, [text, size.block, waiting])

  // Fresh names whenever the result changes, unless a single name was typed by hand
  useEffect(() => {
    if (!result?.ok) return
    setNames((prev) => (edited && result.items.length === 1 && prev.length === 1 ? prev : result.items.map((i) => i.name)))
  }, [result, edited])

  const items = result?.ok ? result.items : []
  const ready = items.length > 0 && names.length === items.length && !size.block && !waiting

  const add = () => {
    if (!ready) return
    const taken = new Set(p.taken.map((n) => n.toLowerCase()))
    p.onAdd(items.map((it, k) => ({ name: uniqueName(names[k] || it.name, taken), svg: it.svg })))
  }

  const pasteAgain = () => {
    setClip("reading")
    readClipboardText()
      .then((t) => { if (looksLikeSvg(t)) { setText(t); setAllowBig(false); setEdited(false); setClip("pasted") } else setClip("empty") })
      .catch(() => { setClip("denied"); area.current?.focus() })
  }

  const big = text.length > SHOW_LIMIT
  const status = {
    idle: null,
    reading: "Checking your clipboard…",
    pasted: "Pasted from your clipboard.",
    empty: `Your clipboard doesn't have any SVG in it. Paste (${mod}V) or type markup below.`,
    denied: `Couldn't read the clipboard here. Paste with ${mod}V instead.`
  }[clip]

  return (
    <Modal onCancel={p.onClose}>
      <div className={`add-dialog${mode === "paste" ? " is-paste" : ""}`}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add() } }}>
        <div className="settings__head">
          <h2 className="modal__title">Add SVGs</h2>
          <button className="btn btn--icon" aria-label="Close" onClick={p.onClose}><IconX /></button>
        </div>

        <AddChoices tiles active={mode}
          onFiles={() => { p.onClose(); p.onFiles() }}
          onFolder={() => { p.onClose(); p.onFolder() }}
          onPaste={() => setMode("paste")} />

        {mode === "paste" && (
          <div className="paste">
            <div className="paste__code">
              <div className="paste__bar">
                <span className={`text-3 paste__status${clip === "denied" ? " is-warn" : ""}`}>{status ?? "Paste or type SVG markup."}</span>
                <span className="paste__tools">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={pasteAgain} title="Read the clipboard again">Paste</button>
                  {text && <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setText(""); setAllowBig(false); setEdited(false); setClip("idle"); area.current?.focus() }}>Clear</button>}
                </span>
              </div>
              {big
                ? <div className="paste__big text-2">{formatBytes(text.length)} of markup. Too big to show here, but it's ready to use.</div>
                : <textarea ref={area} className="input input--mono paste__area" spellCheck={false} autoFocus={!p.text}
                    placeholder={'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">…</svg>\n\nA bare <symbol>, a sprite, loose shapes or a data URI all work too.'}
                    value={text}
                    onChange={(e) => { setText(e.target.value); setAllowBig(false); if (clip !== "idle") setClip("idle") }} />}
            </div>

            <div className="paste__side">
              {size.block && <div className="paste__msg is-error">{size.block}</div>}
              {waiting && (
                <div className="paste__msg is-warn">
                  <strong>That's a big one: {size.warn}.</strong>
                  <span>Reading it could make the app slow or stop responding for a while, and it may be too complex to preview once it's in the list.</span>
                  <span><button type="button" className="btn btn--secondary btn--sm" onClick={() => setAllowBig(true)}>Process it anyway</button></span>
                </div>
              )}
              {result && !result.ok && <div className="paste__msg is-error" role="alert"><strong>Not valid SVG.</strong> <span>{result.error}</span></div>}
              {!text.trim() && !size.block && <div className="paste__empty text-3">The preview appears here.</div>}

              {items.length === 1 && (
                <div className="paste__one">
                  <Thumb svg={items[0].svg} size={196} backdrop={p.backdrop} label="Preview" />
                  <Facts svg={items[0].svg} />
                  <label className="field">
                    <span className="panel__label">File name</span>
                    <span className="paste__name">
                      <input className="input input--sm" value={names[0] ?? ""} spellCheck={false}
                        onChange={(e) => { setEdited(true); setNames([e.target.value]) }} />
                      <span className="text-3">.svg</span>
                    </span>
                  </label>
                </div>
              )}

              {items.length > 1 && (
                <ul className="paste__many">
                  {items.map((it, k) => (
                    <li key={k} className="paste__item">
                      <Thumb svg={it.svg} size={52} backdrop={p.backdrop} label={names[k]} />
                      <div className="paste__item-body">
                        <span className="paste__name">
                          <input className="input input--sm" value={names[k] ?? ""} spellCheck={false} aria-label={`Name for ${it.from ?? `SVG ${k + 1}`}`}
                            onChange={(e) => setNames((n) => n.map((x, i) => (i === k ? e.target.value : x)))} />
                          <span className="text-3">.svg</span>
                        </span>
                        {it.from && <span className="text-3 paste__from">{it.from}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {result?.ok && result.warnings.map((w) => <div key={w} className="paste__msg is-warn">{w}</div>)}
              {result?.ok && result.notes.length > 0 && (
                <ul className="paste__notes text-3">
                  {[...new Set(result.notes)].slice(0, 6).map((n) => <li key={n}>{n}</li>)}
                </ul>
              )}
            </div>
          </div>
        )}

        {mode === "paste" && (
          <div className="modal__actions">
            <button type="button" className="btn btn--secondary" onClick={p.onClose}>Cancel</button>
            <button type="button" className="btn btn--primary" disabled={!ready} onClick={add} title={`${mod}Enter`}>
              {items.length > 1 ? `Add ${plural(items.length, "SVG")} to the list` : "Add to the list"}
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}

function Facts({ svg }: { svg: string }) {
  const dims = svgSize(svg)
  const bytes = new Blob([svg]).size
  return (
    <span className="text-3 paste__facts">
      {dims ? `${fmtNum(dims.w, 2)} × ${fmtNum(dims.h, 2)}` : "No size"} · {formatBytes(bytes)}
    </span>
  )
}
