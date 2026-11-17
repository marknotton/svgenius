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
export const IconSliders = (p: P) => <Icon {...p}><path d="M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6" /><circle cx="10" cy="4.5" r="1.5" /><circle cx="6" cy="11.5" r="1.5" /></Icon>

export const Logo = (p: P) => (
  <svg width="18" height="18" viewBox="0 0 32 32" aria-hidden="true" {...p}>
    <rect width="32" height="32" rx="8" fill="var(--accent)" />
    <path d="M9 21.5c1.2 1.3 3 2 5 2 3 0 5-1.5 5-3.75 0-4.75-9.5-2.75-9.5-7.5C9.5 10 11.5 8.5 14.25 8.5c1.75 0 3.25.6 4.25 1.6"
      fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="23" cy="21" r="2.25" fill="#fff" />
  </svg>
)
