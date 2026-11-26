import { useState, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { portalRoot } from "../host"
import { fmtNum } from "@marknotton/svgenius-core/svgRoot"
import { ALIGNMENT_LABELS, alignmentPath, alignmentStyle, alignmentText, lineStyle, GROUP_LABELS, MAGIC_GROUPS, MAGIC_LABELS, ratioText } from "@marknotton/svgenius-core/designPrinciples"
import type { DesignPrinciple, MagicKeylines, MagicRule } from "@marknotton/svgenius-core/types"
import { Modal } from "./Dialogs"
import { GridGuides } from "./GridGuides"

// ── Keyline explorer ──────────────────────────────────────────────────────────
// A design principle's canvas, big. Hover a keyline (or the live area) on the
// canvas or in the list to see its size, and click to pin it

interface Entry {
  id: string
  kind: MagicRule["keyline"]
  name: string
  x: number
  y: number
  w: number
  h: number
  rx: number
  circle: boolean
  /** Keylines' own line style, when they have one */
  style?: CSSProperties
}

export function KeylineExplorer({ dp, magic, onClose }: { dp: DesignPrinciple, magic?: MagicKeylines | null, onClose: () => void }) {
  const [hover, setHover] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const W = dp.width, H = dp.height, p = dp.padding

  const entries: Entry[] = [
    { id: "canvas", kind: "canvas" as const, name: "ViewBox (whole canvas)", x: 0, y: 0, w: W, h: H, rx: 0, circle: false },
    ...(p > 0 ? [{ id: "live", kind: "live" as const, name: "Live area", x: p, y: p, w: W - p * 2, h: H - p * 2, rx: 0, circle: false }] : []),
    ...dp.keylines.map((k) => ({
      id: k.id, kind: k.kind, name: MAGIC_LABELS[k.kind], x: (W - k.w) / 2, y: (H - k.h) / 2, w: k.w, h: k.h,
      rx: k.kind === "circle" ? 0 : Math.min(dp.radius, k.w / 2, k.h / 2), circle: k.kind === "circle",
      style: { ...lineStyle(k, "keyline"), opacity: undefined } as CSSProperties
    }))
  ]
  const hot = hover ?? pinned
  const align = (dp.alignmentKeylines ?? []).filter((a) => a.enabled)
  const usedBy = (kind: MagicRule["keyline"]) => magic?.enabled ? [...MAGIC_GROUPS.filter((g) => magic.rules[g].keyline === kind).map((g) => GROUP_LABELS[g].toLowerCase()), ...MAGIC_GROUPS.flatMap((g) => (magic.rules[g].advanced ?? []).flatMap((r, i) => (r.enabled && r.keyline === kind ? [`${g} rule ${i + 1}`] : []))), ...(magic.advanced ?? []).flatMap((r, i) => (r.enabled && r.keyline === kind ? [`all-shapes rule ${i + 1}`] : []))] : []
  const pick = (id: string) => setPinned((p) => (p === id ? null : id))
  const cls = (e: Entry) => `kx__shape${e.kind === "live" ? " kx__shape--live" : e.kind === "canvas" ? " kx__shape--canvas" : ""}${hot === e.id ? " is-hot" : hot ? " is-dim" : ""}`
  // Big shapes first, so smaller ones sit on top and stay hoverable
  const drawn = [...entries].sort((a, b) => b.w * b.h - a.w * a.h)

  return createPortal(
    <Modal onCancel={onClose}>
      <div className="kx">
        <div className="plugins__head">
          <h2 className="modal__title">{dp.name}: keylines</h2>
          <span className="text-3">{fmtNum(W, 2)} × {fmtNum(H, 2)} canvas</span>
        </div>
        <div className="kx__body">
          <div className="kx__stage" style={{ "--r": W / H } as CSSProperties} onMouseLeave={() => setHover(null)}>
            <GridGuides dp={dp} keylines={false} alignment={false} />
            <svg className="kx__hits" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
              {drawn.map((e) => e.circle
                ? <ellipse key={e.id} className={cls(e)} cx={W / 2} cy={H / 2} rx={e.w / 2} ry={e.h / 2} style={hot === e.id ? undefined : e.style} vectorEffect="non-scaling-stroke"
                    onMouseEnter={() => setHover(e.id)} onClick={() => pick(e.id)}><title>{e.name}</title></ellipse>
                : <rect key={e.id} className={cls(e)} x={e.x} y={e.y} width={e.w} height={e.h} rx={e.rx} style={hot === e.id ? undefined : e.style} vectorEffect="non-scaling-stroke"
                    onMouseEnter={() => setHover(e.id)} onClick={() => pick(e.id)}><title>{e.name}</title></rect>)}
              {align.map((a) => (
                <g key={a.id} className={`kx__align${hot === a.id ? " is-hot" : hot ? " is-dim" : ""}`} onMouseEnter={() => setHover(a.id)} onClick={() => pick(a.id)}>
                  <path className="kx__align-hit" d={alignmentPath(a, dp)} vectorEffect="non-scaling-stroke" />
                  <path className="kx__align-line" d={alignmentPath(a, dp)} style={hot === a.id ? undefined : alignmentStyle(a)} vectorEffect="non-scaling-stroke"><title>{a.name || ALIGNMENT_LABELS[a.kind]}</title></path>
                </g>
              ))}
            </svg>
          </div>
          <ul className="kx__list" onMouseLeave={() => setHover(null)}>
            {entries.map((e) => {
              const used = usedBy(e.kind)
              return (
                <li key={e.id}>
                  <button type="button" className={`kx__item${hot === e.id ? " is-hot" : ""}${pinned === e.id ? " is-pinned" : ""}`}
                    aria-pressed={pinned === e.id} onMouseEnter={() => setHover(e.id)} onFocus={() => setHover(e.id)} onClick={() => pick(e.id)}>
                    <span className="kx__item-name"><span>{e.name}</span><span>{fmtNum(e.w, 2)} × {fmtNum(e.h, 2)}</span></span>
                    <span className="kx__item-meta text-3">
                      {e.w === e.h ? "1:1" : `${ratioText(e.w, e.h)} ${e.w > e.h ? "wide" : "tall"}`}
                      {e.circle ? "" : e.kind === "canvas" ? ", built in, always there" : e.kind === "live" ? `, ${fmtNum(p, 2)} padding` : `, corner radius ${fmtNum(e.rx, 2)}`}
                      {`, ${fmtNum((e.w / W) * 100, 1)}% of the canvas width`}
                    </span>
                    {used.length > 0 && <span className="kx__used">Smart Sizing: {used.join(", ")} goes here</span>}
                  </button>
                </li>
              )
            })}
          {align.length > 0 && <>
            <li className="kx__list-head text-3" role="presentation">Alignment keylines <span>· reference only</span></li>
            {align.map((a) => (
              <li key={a.id}>
                <button type="button" className={`kx__item kx__item--align${hot === a.id ? " is-hot" : ""}${pinned === a.id ? " is-pinned" : ""}`}
                  aria-pressed={pinned === a.id} onMouseEnter={() => setHover(a.id)} onFocus={() => setHover(a.id)} onClick={() => pick(a.id)}>
                  <span className="kx__item-name"><span>{a.name || ALIGNMENT_LABELS[a.kind]}</span><span>{a.kind === "circle" || a.kind === "rect" ? `${fmtNum(a.w, 2)} × ${fmtNum(a.h, 2)}` : ""}</span></span>
                  <span className="kx__item-meta text-3">{alignmentText(a)}. Not used for sizing or masks</span>
                </button>
              </li>
            ))}
          </>}
          </ul>
        </div>
        <div className="modal__actions">
          <span className="text-3 modal__aside">Hover to highlight, click to pin</span>
          <button type="button" className="btn btn--primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </Modal>,
    portalRoot()
  )
}
