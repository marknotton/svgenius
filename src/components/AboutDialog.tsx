import { IconX, Logo } from "@marknotton/svgenius-ui/icons"
import { APP_VERSION, CREDITS, HISTORY, INSPIRATION, type Release as ReleaseInfo } from "../lib/about"
import { REPO_URL, isDesktop } from "../lib/platform"
import { useDesktopDownload } from "../lib/download"
import { Modal } from "@marknotton/svgenius-ui/components/Dialogs"
import { UpdatePanel } from "./Updates"

// ── About SVGenius ────────────────────────────────────────────────────────────

const WEB_URL = "https://marknotton.github.io/svgenius/"

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const downloadUrl = useDesktopDownload()
  return (
    <Modal onCancel={onClose}>
      <div className="settings about">
        <div className="settings__head">
          <h2 className="modal__title">About</h2>
          <button className="btn btn--icon" aria-label="Close about" onClick={onClose}><IconX /></button>
        </div>

        <section className="settings__section about__intro">
          <Logo width={48} height={48} />
          <div>
            <div className="about__name">SVGenius <span className="pill">v{APP_VERSION}</span></div>
            <p className="text-2">Bulk SVG optimisation built on SVGO. Everything runs on your own machine: nothing is uploaded.</p>
            <div className="about__links">
              <a href={REPO_URL} target="_blank" rel="noopener">Source on GitHub</a>
              <a href={`${REPO_URL}/issues`} target="_blank" rel="noopener">Report a problem</a>
              {isDesktop
                ? <a href={WEB_URL} target="_blank" rel="noopener">Browser version</a>
                : <a href={downloadUrl} target="_blank" rel="noopener">Desktop app</a>}
            </div>
            <UpdatePanel />
          </div>
        </section>

        <section className="settings__section">
          <span className="panel__label">Version history</span>
          <Release r={HISTORY[0]} />
          {HISTORY.length > 1 && (
            <details className="accordion about__older">
              <summary className="accordion__summary"><span className="text-2">Earlier versions ({HISTORY.length - 1})</span></summary>
              {HISTORY.slice(1).map((r) => <Release key={r.version} r={r} />)}
            </details>
          )}
        </section>

        <section className="settings__section">
          <span className="panel__label">Built with</span>
          <p className="text-3">SVGenius stands on the shoulders of these open source projects. Thank you to everyone who makes them.</p>
          <ul className="about__credits">
            {CREDITS.map((c) => (
              <li key={c.name}>
                <a href={c.url} target="_blank" rel="noopener">{c.name}</a> <span className="text-3">{c.licence}</span>
                <div className="text-2">{c.what}</div>
              </li>
            ))}
          </ul>
        </section>

        <section className="settings__section">
          <span className="panel__label">Inspired by</span>
          <p className="text-3">Ideas worth borrowing. SVGenius's own versions are written from scratch.</p>
          <ul className="about__credits">
            {INSPIRATION.map((c) => (
              <li key={c.name}>
                <a href={c.url} target="_blank" rel="noopener">{c.name}</a> <span className="text-3">{c.licence}</span>
                <div className="text-2">{c.what}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  )
}

function Release({ r }: { r: ReleaseInfo }) {
  return (
    <div className="about__release">
      <div className="about__release-head"><strong>{r.version}</strong> <span className="text-3">{r.date}</span></div>
      <ul>{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>
    </div>
  )
}
