import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { formatTimestamp } from '../lib/format'
import { IconPause, IconPlay } from './Icons'

export interface TimelinePin {
  time: number
  label: string
  segIdx: number
}

export interface SeekRequest {
  t: number
  nonce: number
}

interface PlayerBarProps {
  meetingId: number
  audioFormat: 'wav' | 'm4a'
  fallbackDuration: number
  channels: ('mic' | 'system')[]
  pins: TimelinePin[]
  seekReq: SeekRequest | null
  onTimeChange: (t: number, playing: boolean) => void
  onPinClick: (pin: TimelinePin) => void
}

// One timeline for the whole meeting, YouTube-style, docked at the bottom.
// The two recorded channels (Teams audio + room mic) are pre-mixed into a
// single `mixed.m4a` at processing time, so playback is ONE audio element —
// no two-stream sync to drift, stall, or freeze.
export function PlayerBar({
  meetingId,
  audioFormat,
  fallbackDuration,
  channels,
  pins,
  seekReq,
  onTimeChange,
  onPinClick
}: PlayerBarProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const waveRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const [duration, setDuration] = useState(0)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null)
  // Prefer the single mixed track; fall back to the first channel if a meeting
  // predates mixing (mixed peaks come back empty → use that channel instead).
  const [source, setSource] = useState<'mixed' | 'mic' | 'system'>('mixed')

  // Source selection is decoupled from peaks: playback always starts on the
  // mixed track and only falls back (via the audio element's onError) if that
  // file is genuinely missing. Peaks are purely visual and loaded separately,
  // so a slow/empty peaks response can never reload the audio mid-playback.
  useEffect(() => {
    setSource('mixed')
  }, [meetingId])

  useEffect(() => {
    let cancelled = false
    setPeaks(null)
    const load = async (): Promise<void> => {
      let p = await window.api.audio.peaks(meetingId, 'mixed').catch(() => [])
      if ((!p || p.length === 0) && channels[0]) {
        p = await window.api.audio.peaks(meetingId, channels[0]).catch(() => [])
      }
      if (!cancelled) setPeaks(p ?? [])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [meetingId, channels])

  const src =
    source === 'mixed'
      ? `meeterz-audio://recordings/${meetingId}/mixed.m4a`
      : `meeterz-audio://recordings/${meetingId}/${source}.${audioFormat}`

  const seek = (t: number, andPlay = true): void => {
    const el = audioRef.current
    if (!el) return
    const clamped = Math.min(Math.max(0, t), duration || t)
    el.currentTime = clamped
    setTime(clamped)
    if (andPlay) el.play().catch(() => {})
  }

  // External seek requests (transcript line / pin clicks upstream).
  useEffect(() => {
    if (seekReq) seek(seekReq.t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekReq?.nonce])

  // Draw the waveform with played-portion coloring.
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

  const fracFromEvent = (clientX: number): number => {
    const rect = waveRef.current!.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  const toggle = (): void => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) el.play().catch(() => {})
    else el.pause()
  }

  return (
    <div className="player-bar">
      <button className="wf-play" onClick={toggle} title={playing ? 'Pause' : 'Play'}>
        {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
      </button>

      <div
        ref={waveRef}
        className="wf-wave"
        onClick={(e) => duration > 0 && seek(fracFromEvent(e.clientX) * duration)}
        onMouseMove={(e) =>
          duration > 0 && setHover({ x: e.clientX - e.currentTarget.getBoundingClientRect().left, t: fracFromEvent(e.clientX) * duration })
        }
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

      <span className="wf-time">
        {formatTimestamp(time)} <span className="wf-time-total">/ {formatTimestamp(duration)}</span>
      </span>

      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onLoadedMetadata={(e) => {
          const raw = e.currentTarget.duration
          const dur = Number.isFinite(raw) && raw > 0 ? raw : fallbackDuration
          setDuration(dur)
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime
          setTime(t)
          onTimeChange(t, !e.currentTarget.paused)
        }}
        onPlay={() => {
          setPlaying(true)
          onTimeChange(audioRef.current?.currentTime ?? 0, true)
        }}
        onPause={() => {
          setPlaying(false)
          onTimeChange(audioRef.current?.currentTime ?? 0, false)
        }}
        onEnded={() => setPlaying(false)}
        onError={() => {
          // Mixed track missing (older meeting mid-migration) — fall back to
          // the first channel so playback still works.
          if (source === 'mixed' && channels[0]) setSource(channels[0])
        }}
      />
    </div>
  )
}
