import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { Folder, Meeting, TranscriptSegment } from '../types'
import type { CaptureSources } from '../lib/capture'
import { formatDuration } from '../lib/format'
import { TranscriptRail } from './TranscriptRail'
import { NotesEditor } from './NotesEditor'
import { IconExport, IconMic, IconSpeaker, IconTrash, IconWave } from './Icons'

interface MeetingDetailProps {
  meeting: Meeting
  folders: Folder[]
  recordingActive: boolean
  liveSegments: TranscriptSegment[]
  onUpdate: (fields: Partial<Meeting>) => void
  onDelete: () => void
  onStartRecording: (sources: CaptureSources) => void
  onToast: (text: string) => void
}

export function MeetingDetail({
  meeting,
  folders,
  recordingActive,
  liveSegments,
  onUpdate,
  onDelete,
  onStartRecording,
  onToast
}: MeetingDetailProps): JSX.Element {
  const [title, setTitle] = useState(meeting.title)
  const [exportOpen, setExportOpen] = useState(false)

  useEffect(() => {
    setTitle(meeting.title)
  }, [meeting.id])

  const createdAt = new Date(meeting.created_at)
  const canRecord =
    meeting.status === 'idle' && !meeting.audio_dir && meeting.origin !== 'import' && !recordingActive

  const doExport = async (kind: 'md' | 'pdf' | 'copy'): Promise<void> => {
    setExportOpen(false)
    if (kind === 'md') {
      if (await window.api.exportMeeting.markdown(meeting.id)) onToast('Exported Markdown.')
    } else if (kind === 'pdf') {
      if (await window.api.exportMeeting.pdf(meeting.id)) onToast('Exported PDF.')
    } else {
      if (await window.api.exportMeeting.copyMarkdown(meeting.id)) onToast('Copied as Markdown.')
    }
  }

  return (
    <main className="detail">
      <div className="detail-toolbar">
        <div className="export-wrap">
          <button className="icon-btn" title="Export meeting" onClick={() => setExportOpen(!exportOpen)}>
            <IconExport size={15} />
          </button>
          {exportOpen && (
            <div className="export-menu" onMouseLeave={() => setExportOpen(false)}>
              <button onClick={() => doExport('md')}>Export Markdown…</button>
              <button onClick={() => doExport('pdf')}>Export PDF…</button>
              <button onClick={() => doExport('copy')}>Copy as Markdown</button>
            </div>
          )}
        </div>
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
            {meeting.origin === 'import' && <span className="status-chip import">Imported</span>}
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
            {meeting.status === 'error' && <span className="status-chip err">Failed</span>}
          </div>

          {canRecord && <StartRecordingCard onStart={onStartRecording} />}

          <NotesEditor
            meetingId={meeting.id}
            initialHtml={meeting.notes}
            onChange={(html) => onUpdate({ notes: html })}
          />
        </div>

        <TranscriptRail
          meeting={meeting}
          liveSegments={liveSegments}
          onRetry={() => window.api.transcribe.retry(meeting.id)}
        />
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
