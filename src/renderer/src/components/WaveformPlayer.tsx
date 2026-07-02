import { useEffect, useRef, useState } from 'react'
import type { JSX, RefObject } from 'react'
import { formatTimestamp } from '../lib/format'
import { IconPause, IconPlay } from './Icons'

export interface TimelinePin {
  time: number
  label: string
  segIdx: number
}

interface WaveformPlayerProps {
  audioRef: RefObject<HTMLAudioElement | null>
  src: string
  channels: string[]
  channel: 'mic' | 'system'
  onChannelChange: (ch: 'mic' | 'system') => void
  peaks: number[] | null
  pins: TimelinePin[]
  time: number
  onTimeUpdate: (t: number) => void
  onPinClick: (pin: TimelinePin) => void
}

export function WaveformPlayer({
  audioRef,
  src,
  channels,
  channel,
  onChannelChange,
  peaks,
  pins,
  time,
  onTimeUpdate,
  onPinClick
}: WaveformPlayerProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const waveRef = useRef<HTMLDivElement>(null)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null)

  // Draw the waveform: played portion in accent, remainder muted.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth * dpr
    const h = canvas.clientHeight * dpr
    canvas.width = w
    canvas.height = h
    ctx.clearRect(0, 0, w, h)

    const style = getComputedStyle(document.documentElement)
    const accent = style.getPropertyValue('--accent').trim() || '#575af5'
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const mutedCol = dark ? 'rgba(245,245,247,0.22)' : 'rgba(29,29,31,0.18)'

    const bars = peaks && peaks.length > 0 ? peaks : new Array(400).fill(0.06)
    const n = bars.length
    const gap = Math.max(1, Math.floor(dpr))
    const barW = Math.max(1, (w - gap * (n - 1)) / n)
    const playedFrac = duration > 0 ? time / duration : 0

    for (let i = 0; i < n; i++) {
      const level = Math.max(0.04, bars[i])
      const bh = Math.max(2 * dpr, level * (h - 2 * dpr))
      const x = i * (barW + gap)
      ctx.fillStyle = i / n <= playedFrac ? accent : mutedCol
      ctx.beginPath()
      ctx.roundRect(x, (h - bh) / 2, barW, bh, barW / 2)
      ctx.fill()
    }
  }, [peaks, time, duration])

  const seekToFrac = (clientX: number): void => {
    const el = audioRef.current
    const wave = waveRef.current
    if (!el || !wave || duration === 0) return
    const rect = wave.getBoundingClientRect()
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    el.currentTime = frac * duration
    onTimeUpdate(el.currentTime)
    el.play().catch(() => {})
  }

  const toggle = (): void => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) el.play().catch(() => {})
    else el.pause()
  }

  return (
    <div className="wf-player">
      <div className="wf-top">
        <button className="wf-play" onClick={toggle} title={playing ? 'Pause' : 'Play'}>
          {playing ? <IconPause size={13} /> : <IconPlay size={13} />}
        </button>
        <span className="wf-time">
          {formatTimestamp(time)} <span className="wf-time-total">/ {formatTimestamp(duration)}</span>
        </span>
        {channels.length > 1 && (
          <span className="wf-channels">
            <button
              className={`wf-channel ${channel === 'system' ? 'on' : ''}`}
              onClick={() => onChannelChange('system')}
            >
              Them
            </button>
            <button
              className={`wf-channel ${channel === 'mic' ? 'on' : ''}`}
              onClick={() => onChannelChange('mic')}
            >
              You
            </button>
          </span>
        )}
      </div>

      <div
        ref={waveRef}
        className="wf-wave"
        onClick={(e) => seekToFrac(e.clientX)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
          setHover({ x: e.clientX - rect.left, t: frac * duration })
        }}
        onMouseLeave={() => setHover(null)}
      >
        <canvas ref={canvasRef} className="wf-canvas" />
        {duration > 0 &&
          pins.map((pin, i) => (
            <button
              key={i}
              className="wf-pin"
              style={{ left: `${(pin.time / duration) * 100}%` }}
              title={pin.label}
              onClick={(e) => {
                e.stopPropagation()
                onPinClick(pin)
              }}
            />
          ))}
        {duration > 0 && (
          <div className="wf-playhead" style={{ left: `${(time / duration) * 100}%` }} />
        )}
        {hover && (
          <div className="wf-hover" style={{ left: hover.x }}>
            {formatTimestamp(hover.t)}
          </div>
        )}
      </div>

      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  )
}
