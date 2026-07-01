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

export function IconWave({ size = 16 }: IconProps): JSX.Element {
  return (
    <svg {...base(size)}>
      <path d="M2 8h1M5 5.5v5M8 3.5v9M11 5.5v5M14 8h-1" strokeWidth={1.8} />
    </svg>
  )
}
