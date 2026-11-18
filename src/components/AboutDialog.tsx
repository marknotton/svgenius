import { IconX, Logo } from "../icons"
import { APP_VERSION, CREDITS, HISTORY, INSPIRATION } from "../lib/about"
import { DOWNLOAD_URL, REPO_URL, isDesktop } from "../lib/platform"
import { Modal } from "./Dialogs"

// ── About SVGenius ────────────────────────────────────────────────────────────

const WEB_URL = "https://marknotton.github.io/svgenius/"

export function AboutDialog({ onClose }: { onClose: () => void }) {
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
                : <a href={DOWNLOAD_URL} target="_blank" rel="noopener">Desktop app</a>}
            </div>
          </div>
        </section>

        <section className="settings__section">
          <span className="panel__label">Version history</span>
          {HISTORY.map((r) => (
            <div key={r.version} className="about__release">
              <div className="about__release-head"><strong>{r.version}</strong> <span className="text-3">{r.date}</span></div>
              <ul>{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </div>
          ))}
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
