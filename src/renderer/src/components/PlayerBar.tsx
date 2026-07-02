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

// One timeline for the whole meeting, YouTube-style, pinned at the bottom.
// Both channels (Teams audio + room mic) were recorded simultaneously, so
// they are played back TOGETHER in sync — the full conversation — over a
// single merged waveform.
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
  const refs = useRef<Map<string, HTMLAudioElement>>(new Map())
  const [peaks, setPeaks] = useState<number[] | null>(null)
  const [duration, setDuration] = useState(0)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null)

  const audios = (): HTMLAudioElement[] => [...refs.current.values()]
  const master = (): HTMLAudioElement | undefined => refs.current.get(channels[0])

  // Merged waveform: the louder of the two channels per bucket.
  useEffect(() => {
    let cancelled = false
    setPeaks(null)
    Promise.all(channels.map((ch) => window.api.audio.peaks(meetingId, ch).catch(() => [])))
      .then((all) => {
        if (cancelled) return
        const valid = all.filter((p) => p.length > 0)
        if (valid.length === 0) return setPeaks([])
        const n = Math.max(...valid.map((p) => p.length))
        const merged = Array.from({ length: n }, (_, i) =>
          Math.max(...valid.map((p) => p[i] ?? 0))
        )
        setPeaks(merged)
      })
    return () => {
      cancelled = true
    }
  }, [meetingId, channels])

  // Keep the secondary channel locked to the master clock.
  const syncSlaves = (): void => {
    const m = master()
    if (!m) return
    for (const a of audios()) {
      if (a !== m && Math.abs(a.currentTime - m.currentTime) > 0.25) {
        a.currentTime = m.currentTime
      }
    }
  }

  const playAll = (): void => {
    syncSlaves()
    audios().forEach((a) => a.play().catch(() => {}))
  }
  const pauseAll = (): void => audios().forEach((a) => a.pause())

  const seek = (t: number, andPlay = true): void => {
    const clamped = Math.min(Math.max(0, t), duration || t)
    audios().forEach((a) => (a.currentTime = clamped))
    setTime(clamped)
    onTimeChange(clamped, playing)
    if (andPlay) playAll()
  }

  // External seek requests (transcript line / pin clicks upstream).
  useEffect(() => {
    if (seekReq) seek(seekReq.t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekReq?.nonce])

  // Draw the merged waveform with played-portion coloring.
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
    if (playing) pauseAll()
    else playAll()
  }

  const src = (ch: string): string =>
    `meeterz-audio://recordings/${meetingId}/${ch}.${audioFormat}`

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

      {channels.map((ch) => (
        <audio
          key={ch}
          ref={(el) => {
            if (el) refs.current.set(ch, el)
            else refs.current.delete(ch)
          }}
          src={src(ch)}
          preload="metadata"
          onLoadedMetadata={(e) => {
            // capture before the updater runs — React nulls currentTarget
            // after dispatch, and the updater executes at flush time.
            // A stream Chromium can't index reports Infinity — fall back to
            // the duration measured at recording time.
            const raw = e.currentTarget.duration
            const dur = Number.isFinite(raw) && raw > 0 ? raw : fallbackDuration
            setDuration((d) => Math.max(d, dur))
          }}
          {...(ch === channels[0]
            ? {
                onTimeUpdate: (e: React.SyntheticEvent<HTMLAudioElement>) => {
                  const t = e.currentTarget.currentTime
                  setTime(t)
                  syncSlaves()
                  onTimeChange(t, !e.currentTarget.paused)
                },
                onPlay: () => {
                  setPlaying(true)
                  onTimeChange(master()?.currentTime ?? 0, true)
                },
                onPause: () => {
                  setPlaying(false)
                  pauseAll()
                  onTimeChange(master()?.currentTime ?? 0, false)
                },
                onEnded: () => {
                  setPlaying(false)
                  pauseAll()
                }
              }
            : {})}
        />
      ))}
    </div>
  )
}

export const playerSupportsMeeting = (status: string, audioDir: string | null, channels: string[]): boolean =>
  status === 'ready' && !!audioDir && channels.length > 0
