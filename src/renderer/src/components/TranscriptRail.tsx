import { useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { Meeting, TranscriptSegment } from '../types'
import { formatTimestamp } from '../lib/format'
import { speakerName, speakerClass } from '../lib/speakers'
import { IconCopy, IconMic, IconSearch, IconWave } from './Icons'

interface TranscriptRailProps {
  meeting: Meeting
  liveSegments: TranscriptSegment[]
  onRetry: () => void
  seed?: string
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function Highlighted({ text, query }: { text: string; query: string }): JSX.Element {
  if (!query) return <>{text}</>
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'ig'))
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === query.toLowerCase() ? <mark key={i}>{p}</mark> : p
      )}
    </>
  )
}

export function TranscriptRail({ meeting, liveSegments, onRetry, seed }: TranscriptRailProps): JSX.Element {
  const [copied, setCopied] = useState(false)
  const [query, setQuery] = useState('')
  const [matchIdx, setMatchIdx] = useState(0)
  const [playing, setPlaying] = useState<{ source: string; time: number } | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playerSource, setPlayerSource] = useState<'mic' | 'system' | null>(null)

  const segments = useMemo<TranscriptSegment[]>(() => {
    if (meeting.status === 'recording' && liveSegments.length > 0) return liveSegments
    if (!meeting.transcript) return []
    try {
      return JSON.parse(meeting.transcript)
    } catch {
      return []
    }
  }, [meeting.transcript, meeting.status, liveSegments])

  const channels = useMemo<string[]>(() => {
    try {
      return JSON.parse(meeting.channels ?? '[]')
    } catch {
      return []
    }
  }, [meeting.channels])

  const hasAudio = meeting.audio_dir && meeting.status === 'ready' && channels.length > 0
  const isLive = meeting.status === 'recording' && liveSegments.length > 0

  useEffect(() => {
    setPlayerSource(null)
    setPlaying(null)
    // A meeting opened from an active library search starts pre-filtered.
    setQuery(seed ?? '')
    setMatchIdx(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.id])

  const q = query.trim().toLowerCase()
  const matches = useMemo(
    () => (q ? segments.map((s, i) => ({ s, i })).filter((x) => x.s.text.toLowerCase().includes(q)) : []),
    [segments, q]
  )

  useEffect(() => setMatchIdx(0), [q])

  const currentSegIdx = matches.length > 0 ? matches[Math.min(matchIdx, matches.length - 1)].i : -1

  useEffect(() => {
    if (currentSegIdx >= 0) {
      document
        .querySelector(`[data-seg-idx="${currentSegIdx}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [currentSegIdx])

  const cycle = (dir: 1 | -1): void => {
    if (matches.length === 0) return
    setMatchIdx((v) => (v + dir + matches.length) % matches.length)
  }

  const audioSrc = (source: string): string =>
    `meeterz-audio://recordings/${meeting.id}/${source}.${meeting.audio_format}`

  const seekTo = (seg: TranscriptSegment): void => {
    if (!hasAudio || seg.source === 'import') return
    const source = seg.source as 'mic' | 'system'
    if (!channels.includes(source)) return
    setPlayerSource(source)
    // src change needs a tick before seeking
    requestAnimationFrame(() => {
      const el = audioRef.current
      if (!el) return
      const doSeek = (): void => {
        el.currentTime = seg.start
        el.play().catch(() => {})
      }
      if (el.readyState >= 1) doSeek()
      else el.addEventListener('loadedmetadata', doSeek, { once: true })
    })
  }

  const isActive = (seg: TranscriptSegment): boolean =>
    playing !== null &&
    playing.source === seg.source &&
    playing.time >= seg.start &&
    playing.time < seg.end

  const copyAll = (): void => {
    const text = segments
      .map((s) => `[${formatTimestamp(s.start)}] ${speakerName(s)}: ${s.text}`)
      .join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <aside className="transcript-rail">
      <div className="rail-header">
        <span>
          Transcript
          {isLive && <span className="live-badge">Live</span>}
        </span>
        {segments.length > 0 && (
          <button className="icon-btn" title="Copy transcript" onClick={copyAll}>
            {copied ? <span className="copied-note">Copied</span> : <IconCopy size={14} />}
          </button>
        )}
      </div>

      {segments.length > 0 && (
        <div className="rail-search">
          <IconSearch size={13} />
          <input
            placeholder="Find in transcript"
            value={query}
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') cycle(e.shiftKey ? -1 : 1)
              if (e.key === 'Escape') {
                setQuery('')
                ;(e.target as HTMLInputElement).blur()
              }
            }}
          />
          {q && (
            <span className="rail-search-meta">
              <span className="rail-search-count">
                {matches.length === 0 ? '0' : `${Math.min(matchIdx + 1, matches.length)}/${matches.length}`}
              </span>
              <button className="icon-btn" title="Previous match (⇧↩)" onClick={() => cycle(-1)}>
                ↑
              </button>
              <button className="icon-btn" title="Next match (↩)" onClick={() => cycle(1)}>
                ↓
              </button>
            </span>
          )}
        </div>
      )}

      {hasAudio && (
        <div className="audio-players">
          {playerSource ? (
            <div className="audio-row">
              <span className="audio-label">
                {playerSource === 'system' ? 'Teams / system' : 'Room mic'}
              </span>
              <audio
                ref={audioRef}
                controls
                preload="metadata"
                src={audioSrc(playerSource)}
                onTimeUpdate={(e) =>
                  setPlaying({ source: playerSource, time: e.currentTarget.currentTime })
                }
                onPause={() => setPlaying(null)}
                onEnded={() => setPlaying(null)}
              />
            </div>
          ) : (
            <div className="audio-hint">Click a transcript line to play it.</div>
          )}
        </div>
      )}

      <div className="rail-scroll">
        {meeting.status === 'recording' && segments.length === 0 && (
          <RailEmpty icon={<IconWave size={20} />} text="Recording… live transcript appears in ~15 seconds." />
        )}
        {meeting.status === 'transcribing' && (
          <RailEmpty
            icon={<span className="dots-pulse"><i /><i /><i /></span>}
            text="Transcribing on-device…"
          />
        )}
        {meeting.status === 'error' && (
          <div className="rail-error">
            <p className="rail-error-msg">{meeting.error_msg ?? 'Transcription failed.'}</p>
            <button className="record-btn" onClick={onRetry}>
              Try again
            </button>
          </div>
        )}
        {meeting.status === 'ready' && segments.length === 0 && (
          <RailEmpty icon={<IconMic size={20} />} text="No speech detected in this recording." />
        )}
        {meeting.status === 'idle' && segments.length === 0 && (
          <RailEmpty icon={<IconMic size={20} />} text="Transcript appears after the meeting." />
        )}

        {segments.map((s, i) => (
          <div
            key={`${s.source}-${s.start}-${i}`}
            data-seg-idx={i}
            className={`segment ${isActive(s) ? 'active' : ''} ${hasAudio && s.source !== 'import' ? 'seekable' : ''} ${i === currentSegIdx ? 'search-current' : ''}`}
            style={{ animationDelay: `${Math.min(i * 24, 400)}ms` }}
            onClick={() => seekTo(s)}
          >
            <div className="segment-head">
              <span className={`speaker-chip ${speakerClass(s)}`}>{speakerName(s)}</span>
              <span className="segment-time">{formatTimestamp(s.start)}</span>
              {s.lang && <span className="segment-lang">{s.lang}</span>}
            </div>
            <p className="segment-text">
              <Highlighted text={s.text} query={q} />
            </p>
          </div>
        ))}
      </div>
    </aside>
  )
}

function RailEmpty({ icon, text }: { icon: JSX.Element; text: string }): JSX.Element {
  return (
    <div className="rail-empty">
      <div className="rail-empty-icon">{icon}</div>
      <p>{text}</p>
    </div>
  )
}
