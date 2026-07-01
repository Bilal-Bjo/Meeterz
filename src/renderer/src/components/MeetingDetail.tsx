import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { Folder, Meeting } from '../types'
import type { CaptureSources } from '../lib/capture'
import { formatDuration } from '../lib/format'
import { TranscriptRail } from './TranscriptRail'
import { IconMic, IconSpeaker, IconTrash, IconWave } from './Icons'

interface MeetingDetailProps {
  meeting: Meeting
  folders: Folder[]
  recordingActive: boolean
  onUpdate: (fields: Partial<Meeting>) => void
  onDelete: () => void
  onStartRecording: (sources: CaptureSources) => void
}

export function MeetingDetail({
  meeting,
  folders,
  recordingActive,
  onUpdate,
  onDelete,
  onStartRecording
}: MeetingDetailProps): JSX.Element {
  const [title, setTitle] = useState(meeting.title)
  const [notes, setNotes] = useState(meeting.notes)
  const notesTimer = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    setTitle(meeting.title)
    setNotes(meeting.notes)
  }, [meeting.id])

  const scheduleNotesSave = (value: string): void => {
    setNotes(value)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => onUpdate({ notes: value }), 500)
  }

  const createdAt = new Date(meeting.created_at)
  const canRecord = meeting.status === 'idle' && !meeting.audio_dir && !recordingActive

  return (
    <main className="detail">
      <div className="detail-toolbar">
        <button className="icon-btn" title="Delete meeting" onClick={onDelete}>
          <IconTrash size={15} />
        </button>
      </div>

      <div className="detail-body">
        <div className="notes-column">
          <input
            className="detail-title"
            value={title}
            spellCheck={false}
            placeholder="Untitled meeting"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== meeting.title && onUpdate({ title: title.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />

          <div className="detail-meta">
            <span>
              {createdAt.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric'
              })}
            </span>
            {meeting.duration_sec > 0 && <span>· {formatDuration(meeting.duration_sec)}</span>}
            <select
              className="folder-select"
              value={meeting.folder_id ?? ''}
              onChange={(e) =>
                onUpdate({ folder_id: e.target.value === '' ? null : Number(e.target.value) })
              }
            >
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            {meeting.status === 'transcribing' && (
              <span className="status-chip busy">Transcribing…</span>
            )}
            {meeting.status === 'recording' && <span className="status-chip rec">Recording</span>}
          </div>

          {canRecord && <StartRecordingCard onStart={onStartRecording} />}

          <textarea
            className="notes-editor"
            placeholder="Type your notes…"
            value={notes}
            onChange={(e) => scheduleNotesSave(e.target.value)}
            spellCheck
          />
        </div>

        <TranscriptRail meeting={meeting} />
      </div>
    </main>
  )
}

function StartRecordingCard({
  onStart
}: {
  onStart: (sources: CaptureSources) => void
}): JSX.Element {
  const [system, setSystem] = useState(true)
  const [mic, setMic] = useState(true)

  return (
    <div className="start-card">
      <div className="start-card-info">
        <div className="start-card-title">Ready to record</div>
        <div className="start-card-sub">Captures Teams call audio and your room, transcribed on-device.</div>
      </div>
      <div className="start-card-controls">
        <button
          className={`toggle-pill ${system ? 'on' : ''}`}
          onClick={() => setSystem(!system)}
          title="Capture system audio (Teams, any app)"
        >
          <IconSpeaker size={14} /> System
        </button>
        <button
          className={`toggle-pill ${mic ? 'on' : ''}`}
          onClick={() => setMic(!mic)}
          title="Capture microphone (room)"
        >
          <IconMic size={14} /> Mic
        </button>
        <button
          className="record-btn"
          disabled={!system && !mic}
          onClick={() => onStart({ system, mic })}
        >
          <IconWave size={15} />
          Record
        </button>
      </div>
    </div>
  )
}
