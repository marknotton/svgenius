import { useEffect, useState } from "react"
import { IconX } from "../icons"
import { RELEASES_URL, canUpdate, checkForUpdate, currentVersion, installUpdate, skippedVersion, useUpdateState, type UpdateState } from "../lib/updates"

// ── Updates: the About panel and the notice on launch ─────────────────────────

/** In About: checks as it opens, then says up to date or offers the update */
export function UpdatePanel() {
  const s = useUpdateState()
  useEffect(() => { if (s.status === "idle" || s.status === "current" || s.status === "error") void checkForUpdate() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (!canUpdate) return null
  return (
    <div className={`update update--${s.status}`} aria-live="polite">
      <Status s={s} />
      <div className="update__acts">
        {s.status === "available" && <button className="btn btn--primary btn--sm" onClick={() => void installUpdate()}>Update now</button>}
        {(s.status === "current" || s.status === "error") && <button className="btn btn--secondary btn--sm" onClick={() => void checkForUpdate()}>Check again</button>}
      </div>
      {s.status === "available" && s.notes && <Notes text={s.notes} />}
    </div>
  )
}

function Status({ s }: { s: UpdateState }) {
  switch (s.status) {
    case "idle":
    case "checking": return <span className="update__line"><span className="spinner" /> Checking for updates…</span>
    case "current": return <span className="update__line"><span className="update__dot update__dot--ok" /> You're on the latest version, v{currentVersion}</span>
    case "available": return <span className="update__line"><span className="update__dot update__dot--new" /> <span><strong>v{s.version}</strong> is available</span> (you have v{currentVersion})</span>
    case "downloading": return (
      <span className="update__line update__line--grow">
        <span className="spinner" /> Downloading v{s.version}…
        <span className="update__bar"><span style={{ width: s.progress === undefined ? "35%" : `${Math.round(s.progress * 100)}%` }} className={s.progress === undefined ? "is-unknown" : ""} /></span>
      </span>
    )
    case "restarting": return <span className="update__line"><span className="spinner" /> Installed. Restarting SVGenius…</span>
    case "error": return (
      <span className="update__line text-2">
        <span>{s.version ? "Couldn't install the update." : "Couldn't reach GitHub to check. Are you online?"} <a href={RELEASES_URL} target="_blank" rel="noopener">{s.version ? "Download it from GitHub" : "See releases"}</a></span>
      </span>
    )
  }
}

function Notes({ text }: { text: string }) {
  return <pre className="update__notes">{text}</pre>
}

/**
 * On launch the desktop app checks quietly. If there's a newer version that
 * hasn't been skipped, a card offers it: Update now, Skip this release or Later
 */
export function UpdateNotice() {
  const s = useUpdateState()
  const [shown, setShown] = useState(false)
  const [closed, setClosed] = useState(false)
  useEffect(() => {
    if (!canUpdate) return
    const t = setTimeout(() => {
      void checkForUpdate().then((r) => { if (r.status === "available" && r.version !== skippedVersion.get()) setShown(true) })
    }, 3000)
    return () => clearTimeout(t)
  }, [])
  if (!shown || closed) return null
  const busy = s.status === "downloading" || s.status === "restarting"
  return (
    <div className="update-notice" role="dialog" aria-label="Update available">
      <div className="update-notice__head">
        <strong>A new version of SVGenius is ready</strong>
        {!busy && <button className="btn btn--icon" aria-label="Later" title="Later" onClick={() => setClosed(true)}><IconX /></button>}
      </div>
      <Status s={s} />
      {s.status === "available" && s.notes && <Notes text={s.notes} />}
      {!busy && (
        <div className="update-notice__acts">
          <button className="btn btn--secondary btn--sm" onClick={() => { if (s.version) skippedVersion.set(s.version); setClosed(true) }}>Skip this release</button>
          <button className="btn btn--secondary btn--sm" onClick={() => setClosed(true)}>Later</button>
          {s.status === "available" && <button className="btn btn--primary btn--sm" onClick={() => void installUpdate()}>Update now</button>}
        </div>
      )}
    </div>
  )
}
