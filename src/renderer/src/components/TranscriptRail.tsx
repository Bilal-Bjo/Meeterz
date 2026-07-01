import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import type { Meeting, TranscriptSegment } from '../types'
import { formatTimestamp } from '../lib/format'
import { IconCopy, IconMic, IconWave } from './Icons'

interface TranscriptRailProps {
  meeting: Meeting
}

function speakerName(source: TranscriptSegment['source']): string {
  return source === 'system' ? 'Them' : 'You / Room'
}

export function TranscriptRail({ meeting }: TranscriptRailProps): JSX.Element {
  const [copied, setCopied] = useState(false)

  const segments = useMemo<TranscriptSegment[]>(() => {
    if (!meeting.transcript) return []
    try {
      return JSON.parse(meeting.transcript)
    } catch {
      return []
    }
  }, [meeting.transcript])

  const channels = useMemo<string[]>(() => {
    try {
      return JSON.parse(meeting.channels ?? '[]')
    } catch {
      return []
    }
  }, [meeting.channels])

  const copyAll = (): void => {
    const text = segments
      .map((s) => `[${formatTimestamp(s.start)}] ${speakerName(s.source)}: ${s.text}`)
      .join('\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <aside className="transcript-rail">
      <div className="rail-header">
        <span>Transcript</span>
        {segments.length > 0 && (
          <button className="icon-btn" title="Copy transcript" onClick={copyAll}>
            {copied ? <span className="copied-note">Copied</span> : <IconCopy size={14} />}
          </button>
        )}
      </div>

      {meeting.audio_dir && meeting.status === 'ready' && channels.length > 0 && (
        <div className="audio-players">
          {channels.includes('system') && (
            <AudioRow label="Teams / system" file={`${meeting.id}/system.wav`} />
          )}
          {channels.includes('mic') && (
            <AudioRow label="Room mic" file={`${meeting.id}/mic.wav`} />
          )}
        </div>
      )}

      <div className="rail-scroll">
        {meeting.status === 'recording' && (
          <RailEmpty icon={<IconWave size={20} />} text="Recording… transcript appears when you stop." />
        )}
        {meeting.status === 'transcribing' && (
          <RailEmpty
            icon={<span className="dots-pulse"><i /><i /><i /></span>}
            text="Transcribing on-device…"
          />
        )}
        {meeting.status === 'error' && (
          <RailEmpty icon={<IconMic size={20} />} text="Transcription failed. Check that whisper-cli is installed." />
        )}
        {meeting.status === 'ready' && segments.length === 0 && (
          <RailEmpty icon={<IconMic size={20} />} text="No speech detected in this recording." />
        )}
        {(meeting.status === 'idle' || !meeting.status) && segments.length === 0 && (
          <RailEmpty icon={<IconMic size={20} />} text="Transcript appears after the meeting." />
        )}

        {segments.map((s, i) => (
          <div key={i} className="segment" style={{ animationDelay: `${Math.min(i * 24, 400)}ms` }}>
            <div className="segment-head">
              <span className={`speaker-chip ${s.source}`}>{speakerName(s.source)}</span>
              <span className="segment-time">{formatTimestamp(s.start)}</span>
            </div>
            <p className="segment-text">{s.text}</p>
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

function AudioRow({ label, file }: { label: string; file: string }): JSX.Element {
  return (
    <div className="audio-row">
      <span className="audio-label">{label}</span>
      <audio controls preload="metadata" src={`meeterz-audio://recordings/${file}`} />
    </div>
  )
}
