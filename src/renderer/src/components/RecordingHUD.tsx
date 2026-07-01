import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { MeetingCapture, CaptureSources } from '../lib/capture'
import { formatDuration } from '../lib/format'
import { IconMic, IconPause, IconPlay, IconSpeaker, IconStop } from './Icons'

interface RecordingHUDProps {
  capture: MeetingCapture
  sources: CaptureSources
  paused: boolean
  onTogglePause: () => void
  onStop: () => void
}

const BAR_COUNT = 44
const SILENCE_HINT_AFTER_MS = 3 * 60 * 1000
const SILENCE_LEVEL = 0.015

export function RecordingHUD({
  capture,
  sources,
  paused,
  onTogglePause,
  onStop
}: RecordingHUDProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [elapsed, setElapsed] = useState(0)
  const [silentHint, setSilentHint] = useState(false)
  const lastLoudRef = useRef(Date.now())
  const activeMsRef = useRef(0)
  const lastTickRef = useRef(Date.now())

  // Elapsed counts only unpaused time.
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now()
      if (!paused) activeMsRef.current += now - lastTickRef.current
      lastTickRef.current = now
      setElapsed(activeMsRef.current / 1000)
    }, 250)
    return () => clearInterval(t)
  }, [paused])

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
        const level = paused ? 0 : Math.max(mic, system)
        history.push(level)
        history.shift()
        if (level > SILENCE_LEVEL) {
          lastLoudRef.current = Date.now()
          setSilentHint(false)
        } else if (!paused && Date.now() - lastLoudRef.current > SILENCE_HINT_AFTER_MS) {
          setSilentHint(true)
        }
      }
      const w = canvas.width
      const h = canvas.height
      ctx.clearRect(0, 0, w, h)
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
      const gap = 2 * dpr
      const barW = (w - gap * (BAR_COUNT - 1)) / BAR_COUNT
      for (let i = 0; i < BAR_COUNT; i++) {
        const barH = Math.max(2 * dpr, history[i] * h)
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
  }, [capture, paused])

  return (
    <div className="recording-hud" role="status" aria-label="Recording in progress">
      {silentHint && !paused && (
        <div className="silence-hint">
          Quiet for a while — still meeting?
          <button onClick={onStop}>Stop recording</button>
        </div>
      )}
      <span className={`rec-dot ${paused ? 'paused' : ''}`} />
      <span className="rec-timer">{paused ? 'Paused' : formatDuration(elapsed)}</span>
      <canvas ref={canvasRef} className="rec-wave" />
      <div className="rec-sources">
        <span className={`source-pill ${sources.system ? 'on' : ''}`} title="System audio (Teams)">
          <IconSpeaker size={13} />
        </span>
        <span className={`source-pill ${sources.mic ? 'on' : ''}`} title="Microphone (room)">
          <IconMic size={13} />
        </span>
      </div>
      <button
        className="pause-btn"
        title={paused ? 'Resume recording' : 'Pause recording'}
        onClick={onTogglePause}
      >
        {paused ? <IconPlay size={14} /> : <IconPause size={14} />}
      </button>
      <button className="stop-btn" onClick={onStop}>
        <IconStop size={14} />
        Stop
      </button>
    </div>
  )
}
