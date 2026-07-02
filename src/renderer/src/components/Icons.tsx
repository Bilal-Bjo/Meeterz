import type { JSX } from 'react'

interface IconProps {
  size?: number
}

const base = (size: number): { [k: string]: string | number } => ({
  width: size,
  height: size,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
})

export function IconMic({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <rect x="6" y="1.5" width="4" height="8" rx="2" />
      <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0" />
      <path d="M8 12v2.5" />
    </svg>
  )
}

export function IconSpeaker({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M2.5 6v4h2.5L8.5 13V3L5 6H2.5z" fill="currentColor" stroke="none" />
      <path d="M11 5.5a3.5 3.5 0 0 1 0 5" />
      <path d="M12.8 3.5a6 6 0 0 1 0 9" />
    </svg>
  )
}

export function IconFolder({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M1.75 4.25c0-.83.67-1.5 1.5-1.5h3l1.5 1.75h4.5c.83 0 1.5.67 1.5 1.5v6c0 .83-.67 1.5-1.5 1.5h-9c-.83 0-1.5-.67-1.5-1.5v-7.75z" />
    </svg>
  )
}

export function IconTray({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M2 9.5h3l1.25 2h3.5L11 9.5h3" />
      <path d="M3.5 3.5h9l1.5 6v3c0 .55-.45 1-1 1H3c-.55 0-1-.45-1-1v-3l1.5-6z" />
    </svg>
  )
}

export function IconPlus({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  )
}

export function IconSearch({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  )
}

export function IconTrash({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M2.5 4h11M6.5 4V2.75h3V4M4 4l.6 9.25c.03.55.48 1 1.03 1h4.74c.55 0 1-.45 1.03-1L12 4" />
    </svg>
  )
}

export function IconCopy({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5v-2c0-.55-.45-1-1-1h-6c-.55 0-1 .45-1 1v6c0 .55.45 1 1 1h2" />
    </svg>
  )
}

export function IconStop({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16">
      <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" />
    </svg>
  )
}

export function IconPanelLeft({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
      <path d="M6 3v10" />
    </svg>
  )
}

export function IconPanelRight({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
      <path d="M10 3v10" />
    </svg>
  )
}

export function IconRestore({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M2.5 6.5a5.5 5.5 0 1 1 1 5" />
      <path d="M2.5 2.5v4h4" />
    </svg>
  )
}

export function IconRefresh({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M13.5 2.5V5H11" />
    </svg>
  )
}

export function IconPause({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16">
      <rect x="4" y="3.5" width="2.6" height="9" rx="1" fill="currentColor" />
      <rect x="9.4" y="3.5" width="2.6" height="9" rx="1" fill="currentColor" />
    </svg>
  )
}

export function IconPlay({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16">
      <path d="M5 3.2v9.6c0 .8.9 1.3 1.6.9l7-4.8c.6-.4.6-1.4 0-1.8l-7-4.8c-.7-.4-1.6.1-1.6.9z" fill="currentColor" />
    </svg>
  )
}

export function IconGear({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6L11 5M5 11l-1.4 1.4" />
    </svg>
  )
}

export function IconImport({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M8 2v7.5M5 6.5L8 9.5l3-3M3 11.5v1c0 .55.45 1 1 1h8c.55 0 1-.45 1-1v-1" />
    </svg>
  )
}

export function IconExport({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M8 9.5V2M5 5l3-3 3 3M3 11.5v1c0 .55.45 1 1 1h8c.55 0 1-.45 1-1v-1" />
    </svg>
  )
}

export function IconWave({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M2 8h1M5 5.5v5M8 3.5v9M11 5.5v5M14 8h-1" strokeWidth={1.8} />
    </svg>
  )
}
