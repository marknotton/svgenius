import { IconFile, IconFolder, Logo } from "../icons"
import { DOWNLOAD_URL, isDesktop } from "../lib/platform"

// Phones and tablets have nothing to drag from
const isTouch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches

export function EmptyState({ onAddFiles, onAddFolder }: { onAddFiles: () => void, onAddFolder: () => void }) {
  return (
    <div className="empty">
      <Logo width={44} height={44} />
      <h1 className="empty__title">{isTouch ? "Add some SVGs" : "Drop SVGs or folders here"}</h1>
      {isDesktop
        ? <p className="empty__body">Folders are searched for SVGs, sub-folders included. Nothing is changed on disk until you export.</p>
        : <p className="empty__body">
            Folders are searched for SVGs, sub-folders included. Everything happens in your browser: nothing is uploaded, and exports download as a zip.
            Prefer exporting straight into folders? <a href={DOWNLOAD_URL} target="_blank" rel="noopener">Get the desktop app</a>.
          </p>}
      <div className="empty__actions">
        <button className="btn btn--primary" onClick={onAddFiles}><IconFile /> Choose files</button>
        <button className="btn btn--secondary" onClick={onAddFolder}><IconFolder /> Choose folder</button>
      </div>
    </div>
  )
}

export function DropOverlay() {
  return (
    <div className="drop-overlay">
      <div className="drop-overlay__inner">Drop to add SVGs</div>
    </div>
  )
}
