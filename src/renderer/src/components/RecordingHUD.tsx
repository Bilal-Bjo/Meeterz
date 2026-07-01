import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { MeetingCapture, CaptureSources } from '../lib/capture'
import { formatDuration } from '../lib/format'
import { IconMic, IconSpeaker, IconStop } from './Icons'

interface RecordingHUDProps {
  capture: MeetingCapture
  startedAt: number
  sources: CaptureSources
  onStop: () => void
}

const BAR_COUNT = 48

export function RecordingHUD({
  capture,
  startedAt,
  sources,
  onStop
}: RecordingHUDProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 250)
    return () => clearInterval(t)
  }, [startedAt])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.clientWidth * dpr
    canvas.height = canvas.clientHeight * dpr
    const history: number[] = new Array(BAR_COUNT).fill(0)
    let raf = 0
    let frame = 0

    const draw = (): void => {
      frame++
      if (frame % 3 === 0) {
        const { mic, system } = capture.levels()
        history.push(Math.max(mic, system))
        history.shift()
      }
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
      const gap = 2 * dpr
      const barW = (w - gap * (BAR_COUNT - 1)) / BAR_COUNT
      for (let i = 0; i < BAR_COUNT; i++) {
        const level = history[i]
        const barH = Math.max(2 * dpr, level * h)
        const recent = i > BAR_COUNT - 6
        ctx.fillStyle = recent
          ? 'rgba(255,69,58,0.8)'
          : dark
            ? 'rgba(245,245,247,0.32)'
            : 'rgba(29,29,31,0.28)'
        const x = i * (barW + gap)
        const y = (h - barH) / 2
        ctx.beginPath()
        ctx.roundRect(x, y, barW, barH, barW / 2)
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [capture])

  return (
    <div className="recording-hud" role="status" aria-label="Recording in progress">
      <span className="rec-dot" />
      <span className="rec-timer">{formatDuration(elapsed)}</span>
      <canvas ref={canvasRef} className="rec-wave" />
      <div className="rec-sources">
        <span className={`source-pill ${sources.system ? 'on' : ''}`} title="System audio (Teams)">
          <IconSpeaker size={13} />
        </span>
        <span className={`source-pill ${sources.mic ? 'on' : ''}`} title="Microphone (room)">
          <IconMic size={13} />
        </span>
      </div>
      <button className="stop-btn" onClick={onStop}>
        <IconStop size={14} />
        Stop
      </button>
    </div>
  )
}
