import { IconFile, IconFolder, Logo } from "../icons"

export function EmptyState({ onAddFiles, onAddFolder }: { onAddFiles: () => void, onAddFolder: () => void }) {
  return (
    <div className="empty">
      <Logo width={44} height={44} />
      <h1 className="empty__title">Drop SVGs or folders here</h1>
      <p className="empty__body">Folders are searched for SVGs, sub-folders included. Nothing is changed on disk until you export.</p>
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
