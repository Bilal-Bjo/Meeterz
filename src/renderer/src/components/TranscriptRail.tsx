import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { Meeting, TranscriptSegment } from '../types'
import { formatTimestamp } from '../lib/format'
import { speakerName, speakerClass } from '../lib/speakers'
import { IconCopy, IconMic, IconSearch, IconWave } from './Icons'

interface TranscriptRailProps {
  meeting: Meeting
  segments: TranscriptSegment[]
  isLive: boolean
  canSeek: boolean
  query: string
  onQueryChange: (q: string) => void
  matchCount: number
  matchPos: number
  onCycle: (dir: 1 | -1) => void
  currentSegIdx: number
  playTime: number
  isPlaying: boolean
  onSegmentClick: (seg: TranscriptSegment) => void
  onRetry: () => void
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

export function TranscriptRail({
  meeting,
  segments,
  isLive,
  canSeek,
  query,
  onQueryChange,
  matchCount,
  matchPos,
  onCycle,
  currentSegIdx,
  playTime,
  isPlaying,
  onSegmentClick,
  onRetry
}: TranscriptRailProps): JSX.Element {
  const [copied, setCopied] = useState(false)
  const q = query.trim().toLowerCase()

  useEffect(() => {
    if (currentSegIdx >= 0) {
      document
        .querySelector(`[data-seg-idx="${currentSegIdx}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, [currentSegIdx])

  const isActive = (seg: TranscriptSegment): boolean =>
    isPlaying && playTime >= seg.start && playTime < seg.end

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
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCycle(e.shiftKey ? -1 : 1)
              if (e.key === 'Escape') {
                onQueryChange('')
                ;(e.target as HTMLInputElement).blur()
              }
            }}
          />
          {q && (
            <span className="rail-search-meta">
              <span className="rail-search-count">
                {matchCount === 0 ? '0' : `${matchPos}/${matchCount}`}
              </span>
              <button className="icon-btn" title="Previous match (⇧↩)" onClick={() => onCycle(-1)}>
                ↑
              </button>
              <button className="icon-btn" title="Next match (↩)" onClick={() => onCycle(1)}>
                ↓
              </button>
            </span>
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
            className={`segment ${isActive(s) ? 'active' : ''} ${canSeek && s.source !== 'import' ? 'seekable' : ''} ${i === currentSegIdx ? 'search-current' : ''}`}
            style={{ animationDelay: `${Math.min(i * 24, 400)}ms` }}
            onClick={() => onSegmentClick(s)}
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
