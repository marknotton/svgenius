import logoUrl from "./assets/logo.png"
import type { SVGProps } from "react"

// ── Inline icons ──────────────────────────────────────────────────────────────
// 16px stroke icons, inherit currentColor.

type P = SVGProps<SVGSVGElement>

const Icon = ({ children, ...props }: P) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {children}
  </svg>
)

export const IconFile = (p: P) => <Icon {...p}><path d="M9 1.75H4.5a1 1 0 0 0-1 1v10.5a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5.25L9 1.75Z" /><path d="M9 1.75v3.5h3.5" /></Icon>
export const IconFolder = (p: P) => <Icon {...p}><path d="M1.75 4.25a1 1 0 0 1 1-1h3.5l1.5 1.5h5.5a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1v-8Z" /></Icon>
export const IconPlus = (p: P) => <Icon {...p}><path d="M8 3v10M3 8h10" /></Icon>
export const IconTrash = (p: P) => <Icon {...p}><path d="M2.5 4h11M6 4V2.75h4V4M4 4l.6 9.25h6.8L12 4" /></Icon>
export const IconBack = (p: P) => <Icon {...p}><path d="M10 3 5 8l5 5" /></Icon>
export const IconPlay = (p: P) => <Icon {...p}><path d="M4.5 2.75v10.5L13 8 4.5 2.75Z" /></Icon>
export const IconRefresh = (p: P) => <Icon {...p}><path d="M13.25 8a5.25 5.25 0 1 1-1.54-3.71M13.25 2.5v3h-3" /></Icon>
export const IconReport = (p: P) => <Icon {...p}><path d="M4 1.5h5.5L12.5 4.5v10h-8.5zM9.5 1.5v3h3M6 8h4.5M6 10.5h4.5M6 5.5h2" /></Icon>
export const IconDownload = (p: P) => <Icon {...p}><path d="M8 2v8.5M4.5 7 8 10.5 11.5 7M2.5 13.5h11" /></Icon>
export const IconUpload = (p: P) => <Icon {...p}><path d="M8 10.5V2M4.5 5.5 8 2l3.5 3.5M2.5 13.5h11" /></Icon>
export const IconEye = (p: P) => <Icon {...p}><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" /><circle cx="8" cy="8" r="2" /></Icon>
export const IconSun = (p: P) => <Icon {...p}><circle cx="8" cy="8" r="2.75" /><path d="M8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" /></Icon>
export const IconMoon = (p: P) => <Icon {...p}><path d="M13.5 9.5A5.75 5.75 0 0 1 6.5 2.5a5.75 5.75 0 1 0 7 7Z" /></Icon>
export const IconStar = ({ filled, ...p }: P & { filled?: boolean }) => <Icon {...p}><path fill={filled ? "currentColor" : "none"} d="m8 1.75 1.9 3.9 4.3.6-3.1 3 .75 4.25L8 11.5l-3.85 2 .75-4.25-3.1-3 4.3-.6L8 1.75Z" /></Icon>
export const IconPencil = (p: P) => <Icon {...p}><path d="M10.5 2.5 13.5 5.5 5.5 13.5H2.5v-3l8-8Z" /></Icon>
export const IconReset = (p: P) => <Icon {...p}><path d="M2.75 8a5.25 5.25 0 1 0 1.54-3.71M2.75 2.5v3h3" /></Icon>
export const IconX = (p: P) => <Icon {...p}><path d="m4 4 8 8M12 4l-8 8" /></Icon>
export const IconReveal = (p: P) => <Icon {...p}><path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" /></Icon>
export const IconCircle = (p: P) => <Icon width={13} height={13} {...p}><circle cx="8" cy="8" r="5.75" strokeDasharray="2 1.6" /></Icon>
export const IconClip = (p: P) => <Icon width={13} height={13} {...p}><circle cx="8" cy="8" r="5.75" /><path d="M5 8h6M8 5v6" strokeWidth="1.25" /></Icon>
export const IconCode = (p: P) => <Icon {...p}><path d="m5.5 4.5-3.5 3.5 3.5 3.5M10.5 4.5l3.5 3.5-3.5 3.5" /></Icon>
export const IconCopy = (p: P) => <Icon {...p}><rect x="5.5" y="5.5" width="8" height="8" rx="1" /><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></Icon>
export const IconSliders = (p: P) => <Icon {...p}><path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" /><circle cx="10" cy="4.5" r="1.5" /><circle cx="6" cy="11.5" r="1.5" /></Icon>

export const Logo = ({ width = 16, height = 16 }: { width?: number, height?: number }) => (
  <img src={logoUrl} width={width} height={height} alt="" aria-hidden="true" draggable={false} style={{ display: "block" }} />
)
export const IconGrip = (p: P) => <Icon width={12} height={12} {...p}><circle cx="6" cy="4" r=".9" fill="currentColor" /><circle cx="10" cy="4" r=".9" fill="currentColor" /><circle cx="6" cy="8" r=".9" fill="currentColor" /><circle cx="10" cy="8" r=".9" fill="currentColor" /><circle cx="6" cy="12" r=".9" fill="currentColor" /><circle cx="10" cy="12" r=".9" fill="currentColor" /></Icon>
export const IconGear = (p: P) => <Icon {...p}><circle cx="8" cy="8" r="2.25" /><path d="M8 1.75v1.5M8 12.75v1.5M14.25 8h-1.5M3.25 8h-1.5M12.42 3.58l-1.06 1.06M4.64 11.36l-1.06 1.06M12.42 12.42l-1.06-1.06M4.64 4.64 3.58 3.58" /><circle cx="8" cy="8" r="4.5" /></Icon>
export const IconExpand = (p: P) => <Icon {...p}><path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" /></Icon>
export const IconOpen = (p: P) => <Icon {...p}><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3" /></Icon>
export const IconInfo = (p: P) => <Icon width={13} height={13} {...p}><circle cx="8" cy="8" r="6" /><path d="M8 7.25v4M8 4.9v.1" /></Icon>
export const IconDuplicate = (p: P) => <Icon {...p}><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 3.5v-.25A1.25 1.25 0 0 0 9.25 2h-6A1.25 1.25 0 0 0 2 3.25v6a1.25 1.25 0 0 0 1.25 1.25h.25M9.5 7.5v4M7.5 9.5h4" /></Icon>
export const IconFlag = ({ filled, ...p }: P & { filled?: boolean }) => (
  <Icon {...p}><path d="M3.5 14.5v-12M3.5 2.5h8l-1.8 3 1.8 3h-8" fill={filled ? "currentColor" : "none"} /></Icon>
)
export const IconSort = (p: P) => <Icon {...p}><path d="M5 3v10M2.5 10.5 5 13l2.5-2.5M11 13V3M8.5 5.5 11 3l2.5 2.5" /></Icon>
export const IconFilter = (p: P) => <Icon {...p}><path d="M2 3h12l-4.5 5.5V13l-3-1.5v-3z" /></Icon>
export const IconCaret = (p: P) => <Icon width={10} height={10} {...p}><path d="m6 4 4 4-4 4" /></Icon>
export const IconSwap = (p: P) => <Icon {...p}><path d="M2.5 5.5h10l-2.5-2.5M13.5 10.5h-10l2.5 2.5" /></Icon>
export const IconUndo = (p: P) => <Icon {...p}><path d="M5.5 3 2.5 6l3 3M2.5 6h7a4 4 0 0 1 0 8H7" /></Icon>
export const IconRedo = (p: P) => <Icon {...p}><path d="m10.5 3 3 3-3 3M13.5 6h-7a4 4 0 0 0 0 8H9" /></Icon>
// Editor layout: code panel on the right, or along the bottom
export const IconPanelRight = (p: P) => <Icon {...p}><rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M10 2.5v11" /></Icon>
export const IconPanelBottom = (p: P) => <Icon {...p}><rect x="2" y="2.5" width="12" height="11" rx="1.5" /><path d="M2 9.5h12" /></Icon>
// Select tools: a solid arrow picks whole objects, a hollow one picks points
export const IconArrowSolid = (p: P) => <Icon {...p}><path d="M4 2.5v10.5l3-3 2 4.5 1.8-.8-2-4.4H13z" fill="currentColor" /></Icon>
export const IconArrowHollow = (p: P) => <Icon {...p}><path d="M4 2.5v10.5l3-3 2 4.5 1.8-.8-2-4.4H13z" /></Icon>
// Align: a bar for the edge or centre line, boxes lined up against it
export const IconAlignLeft = (p: P) => <Icon {...p}><path d="M2.5 2v12" /><rect x="4.5" y="4" width="8" height="3" rx=".5" /><rect x="4.5" y="9" width="5" height="3" rx=".5" /></Icon>
export const IconAlignHCentre = (p: P) => <Icon {...p}><path d="M8 2v12" /><rect x="3.5" y="4" width="9" height="3" rx=".5" /><rect x="5" y="9" width="6" height="3" rx=".5" /></Icon>
export const IconAlignRight = (p: P) => <Icon {...p}><path d="M13.5 2v12" /><rect x="3.5" y="4" width="8" height="3" rx=".5" /><rect x="6.5" y="9" width="5" height="3" rx=".5" /></Icon>
export const IconAlignTop = (p: P) => <Icon {...p}><path d="M2 2.5h12" /><rect x="4" y="4.5" width="3" height="8" rx=".5" /><rect x="9" y="4.5" width="3" height="5" rx=".5" /></Icon>
export const IconAlignVMiddle = (p: P) => <Icon {...p}><path d="M2 8h12" /><rect x="4" y="3.5" width="3" height="9" rx=".5" /><rect x="9" y="5" width="3" height="6" rx=".5" /></Icon>
export const IconAlignBottom = (p: P) => <Icon {...p}><path d="M2 13.5h12" /><rect x="4" y="3.5" width="3" height="8" rx=".5" /><rect x="9" y="6.5" width="3" height="5" rx=".5" /></Icon>
// Pathfinder: two overlapping squares, with the part that's kept filled
export const IconUnite = (p: P) => <Icon {...p}><path d="M2.5 2.5h7v4h4v7h-7v-4h-4z" fill="currentColor" fillOpacity=".35" /></Icon>
export const IconMinusFront = (p: P) => <Icon {...p}><path d="M2.5 2.5h7v4h-3v3h-4z" fill="currentColor" fillOpacity=".35" /><rect x="6.5" y="6.5" width="7" height="7" strokeDasharray="1.5 1.5" /></Icon>
export const IconIntersect = (p: P) => <Icon {...p}><rect x="2.5" y="2.5" width="7" height="7" strokeDasharray="1.5 1.5" /><rect x="6.5" y="6.5" width="7" height="7" strokeDasharray="1.5 1.5" /><rect x="6.5" y="6.5" width="3" height="3" fill="currentColor" fillOpacity=".5" /></Icon>
export const IconExclude = (p: P) => <Icon {...p}><path d="M2.5 2.5h7v4h-3v3h-4zM9.5 9.5v-3h4v7h-7v-4z" fill="currentColor" fillOpacity=".35" /><rect x="6.5" y="6.5" width="3" height="3" /></Icon>
export const IconPin = (p: P) => <Icon {...p}><path d="M6 2.5h4M6.8 2.5v4L4.5 9h7L9.2 6.5v-4M8 9v4.5" /></Icon>
export const IconMore = (p: P) => <Icon {...p}><circle cx="3.5" cy="8" r=".9" fill="currentColor" /><circle cx="8" cy="8" r=".9" fill="currentColor" /><circle cx="12.5" cy="8" r=".9" fill="currentColor" /></Icon>
export const IconLock = (p: P) => <Icon {...p}><rect x="3.5" y="7" width="9" height="6.5" rx="1.2" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></Icon>
export const IconUnlock = (p: P) => <Icon {...p}><rect x="3.5" y="7" width="9" height="6.5" rx="1.2" /><path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.7" /></Icon>
// Preview background: a checkerboard, and an ink drop for a solid colour
export const IconChecker = (p: P) => <Icon {...p}><rect x="2.5" y="2.5" width="11" height="11" rx="1" /><path d="M2.5 8h11M8 2.5v11" strokeWidth="1" /><rect x="2.5" y="2.5" width="5.5" height="5.5" fill="currentColor" stroke="none" /><rect x="8" y="8" width="5.5" height="5.5" fill="currentColor" stroke="none" /></Icon>
export const IconInkDrop = (p: P) => <Icon {...p}><path d="M8 2.2c2.3 2.8 4.2 5.2 4.2 7.4a4.2 4.2 0 0 1-8.4 0c0-2.2 1.9-4.6 4.2-7.4Z" /></Icon>
// Editor toolbar
export const IconGroup = (p: P) => <Icon {...p}><rect x="2" y="2" width="12" height="12" rx="1.5" strokeDasharray="2 1.6" /><rect x="4.5" y="4.5" width="4" height="4" rx=".6" /><circle cx="10" cy="10" r="2" /></Icon>
export const IconUngroup = (p: P) => <Icon {...p}><rect x="2.5" y="2.5" width="5" height="5" rx=".8" /><circle cx="11" cy="11" r="2.5" /><path d="M10 3h3v3M3 10v3h3" strokeDasharray="1.4 1.2" /></Icon>
export const IconBreakApart = (p: P) => <Icon {...p}><path d="M2.5 4.5 5 2l2.5 2.5L5 7z" /><path d="M8.5 11.5 11 9l2.5 2.5L11 14z" /><path d="M7 9 9 7" strokeDasharray="1.2 1.2" /></Icon>
export const IconToPath = (p: P) => <Icon {...p}><rect x="2.5" y="2.5" width="6" height="6" rx=".8" /><path d="M8.5 13.5c2.5 0 5-1 5-5" /><circle cx="8.5" cy="13.5" r="1.1" fill="currentColor" /><circle cx="13.5" cy="8.5" r="1.1" fill="currentColor" /></Icon>
export const IconStrokeToPath = (p: P) => <Icon {...p}><path d="M3 12.5c2-6 8-6 10-9" /><path d="M3 9c2-4.5 6-5 8.5-7.5M5 14c2-4 6-5 8.5-7.5" strokeWidth="1" opacity=".6" /></Icon>

export const IconMagnet = (p: P) => <Icon {...p}><path d="M3.5 2.5v5a4.5 4.5 0 0 0 9 0v-5" /><path d="M3.5 2.5h2.5v5a2 2 0 0 0 4 0v-5h2.5" /><path d="M3.5 5h2.5M10 5h2.5" /></Icon>

export const IconChevronLeft = (p: P) => <Icon {...p}><path d="M10 3 5 8l5 5" /></Icon>
export const IconChevronRight = (p: P) => <Icon {...p}><path d="m6 3 5 5-5 5" /></Icon>
export const IconChevronDown = (p: P) => <Icon {...p}><path d="m3.5 6 4.5 4.5L12.5 6" /></Icon>
export const IconZoomIn = (p: P) => <Icon {...p}><circle cx="7" cy="7" r="4.75" /><path d="m10.5 10.5 3.5 3.5M7 4.75v4.5M4.75 7h4.5" /></Icon>
export const IconZoomOut = (p: P) => <Icon {...p}><circle cx="7" cy="7" r="4.75" /><path d="m10.5 10.5 3.5 3.5M4.75 7h4.5" /></Icon>
export const IconEyeOff = (p: P) => <Icon {...p}><path d="M1.5 8S4 3.5 8 3.5c1.3 0 2.4.5 3.3 1.1M14.5 8S12 12.5 8 12.5c-1.3 0-2.4-.5-3.3-1.1" /><path d="m2.5 13.5 11-11" /></Icon>
/** Opens the editor: a pen nib over a node */
export const IconEditPath = (p: P) => <Icon {...p}><path d="M2.5 13.5c3-1 4.5-3 5.5-6" /><rect x="7" y="3.5" width="3" height="3" rx=".5" /><path d="m10 3.5 3.5-1v3.5L10 6.5" /><circle cx="2.5" cy="13.5" r="1" fill="currentColor" /></Icon>
/** A project: a box of files */
export const IconProject = (p: P) => <Icon {...p}><path d="M2.5 5.5h11v7.75a.75.75 0 0 1-.75.75H3.25a.75.75 0 0 1-.75-.75z" /><path d="M2.5 5.5 4 2.5h8l1.5 3M6.5 8.5h3" /></Icon>
