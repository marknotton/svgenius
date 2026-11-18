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
export const IconFilter = (p: P) => <Icon {...p}><path d="M2 3h12l-4.5 5.5V13l-3-1.5v-3z" /></Icon>
export const IconCaret = (p: P) => <Icon width={10} height={10} {...p}><path d="m6 4 4 4-4 4" /></Icon>
export const IconSwap = (p: P) => <Icon {...p}><path d="M2.5 5.5h10l-2.5-2.5M13.5 10.5h-10l2.5 2.5" /></Icon>
