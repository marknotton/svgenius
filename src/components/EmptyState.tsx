import { IconFile, IconFolder, IconProject, Logo } from "@svgenius/ui/icons"
import { AddChoices } from "@svgenius/ui/components/AddDialog"
import { clearRecent, useRecent, type Recent } from "../lib/recent"
import { isDesktop } from "../lib/platform"
import { useDesktopDownload } from "../lib/download"

// Phones and tablets have nothing to drag from
const isTouch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches

export function EmptyState({ onAddFiles, onAddFolder, onPaste, onOpenProject, onOpenRecent }: { onAddFiles: () => void, onAddFolder: () => void, onPaste: () => void, onOpenProject?: () => void, onOpenRecent?: (r: Recent) => void }) {
  const downloadUrl = useDesktopDownload()
  const recent = useRecent()
  return (
    <div className="empty">
      <Logo width={44} height={44} />
      <h1 className="empty__title">{isTouch ? "Add some SVGs" : "Drop SVGs or folders here"}</h1>
      {isDesktop
        ? <p className="empty__body">Folders are searched for SVGs, sub-folders included. Nothing is changed on disk until you export.</p>
        : <p className="empty__body">
            Folders are searched for SVGs, sub-folders included. Everything happens in your browser: nothing is uploaded, and exports download as a zip.
            Prefer exporting straight into folders? <a href={downloadUrl} target="_blank" rel="noopener">Get the desktop app</a>.
          </p>}
      <AddChoices onFiles={onAddFiles} onFolder={onAddFolder} onPaste={onPaste} />
      {onOpenProject && <button className="link empty__project" onClick={onOpenProject}>Open a saved project (.svgenius)</button>}
      {onOpenRecent && recent.length > 0 && (
        <div className="recent">
          <div className="recent__head">
            <span className="panel__label">Recent</span>
            <button className="link" onClick={clearRecent}>Clear history</button>
          </div>
          <ul className="recent__list">
            {recent.map((r) => (
              <li key={r.path}>
                <button className="recent__item" onClick={() => onOpenRecent(r)} title={r.path}>
                  <span className="recent__icon">{r.kind === "project" ? <IconProject /> : r.kind === "folder" ? <IconFolder /> : <IconFile />}</span>
                  <span className="recent__name">{r.name.replace(/\.svgenius$/i, "")}</span>
                  <span className="recent__path text-3">{r.path.replace(/[\\/][^\\/]+$/, "").replace(/^\/Users\/[^/]+/, "~")}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
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
