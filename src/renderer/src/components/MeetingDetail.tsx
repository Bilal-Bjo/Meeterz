import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import type { Folder, Meeting, TranscriptSegment } from '../types'
import type { CaptureSources } from '../lib/capture'
import { formatDuration, formatTimestamp } from '../lib/format'
import { TranscriptRail } from './TranscriptRail'
import { PlayerBar, type SeekRequest, type TimelinePin } from './PlayerBar'
import { NotesEditor } from './NotesEditor'
import {
  IconExport,
  IconMic,
  IconPanelRight,
  IconRefresh,
  IconRestore,
  IconSpeaker,
  IconTrash,
  IconWave
} from './Icons'

interface MeetingDetailProps {
  meeting: Meeting
  folders: Folder[]
  recordingActive: boolean
  liveSegments: TranscriptSegment[]
  onUpdate: (fields: Partial<Meeting>) => void
  onDelete: () => void
  onRestore: () => void
  onDeleteForever: () => void
  onStartRecording: (sources: CaptureSources) => void
  onToast: (text: string) => void
  railCollapsed: boolean
  onToggleRail: () => void
  transcriptSeed: string
}

export function MeetingDetail({
  meeting,
  folders,
  recordingActive,
  liveSegments,
  onUpdate,
  onDelete,
  onRestore,
  onDeleteForever,
  onStartRecording,
  onToast,
  railCollapsed,
  onToggleRail,
  transcriptSeed
}: MeetingDetailProps): JSX.Element {
  const [title, setTitle] = useState(meeting.title)
  const [exportOpen, setExportOpen] = useState(false)

  // ── Transcript + playback state shared by the rail and the player bar ──
  const [query, setQuery] = useState('')
  const [matchIdx, setMatchIdx] = useState(0)
  const [playTime, setPlayTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [seekReq, setSeekReq] = useState<SeekRequest | null>(null)

  useEffect(() => {
    setTitle(meeting.title)
    setQuery(transcriptSeed ?? '')
    setMatchIdx(0)
    setPlayTime(0)
    setIsPlaying(false)
    setSeekReq(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.id])

  const segments = useMemo<TranscriptSegment[]>(() => {
    if (meeting.status === 'recording' && liveSegments.length > 0) return liveSegments
    if (!meeting.transcript) return []
    try {
      return JSON.parse(meeting.transcript)
    } catch {
      return []
    }
  }, [meeting.transcript, meeting.status, liveSegments])

  const channels = useMemo<('mic' | 'system')[]>(() => {
    try {
      return JSON.parse(meeting.channels ?? '[]')
    } catch {
      return []
    }
  }, [meeting.channels])

  const hasAudio = meeting.status === 'ready' && !!meeting.audio_dir && channels.length > 0

  const q = query.trim().toLowerCase()
  const matches = useMemo(
    () =>
      q ? segments.map((s, i) => ({ s, i })).filter((x) => x.s.text.toLowerCase().includes(q)) : [],
    [segments, q]
  )
  useEffect(() => setMatchIdx(0), [q])

  const currentSegIdx = matches.length > 0 ? matches[Math.min(matchIdx, matches.length - 1)].i : -1

  const cycle = (dir: 1 | -1): void => {
    if (matches.length === 0) return
    setMatchIdx((v) => (v + dir + matches.length) % matches.length)
  }

  // Timeline pins: every search match across the whole meeting.
  const pins = useMemo<TimelinePin[]>(
    () =>
      hasAudio
        ? matches.map((m) => ({
            time: m.s.start,
            label: `${formatTimestamp(m.s.start)} — ${m.s.text.slice(0, 80)}`,
            segIdx: m.i
          }))
        : [],
    [matches, hasAudio]
  )

  const seekTo = (t: number): void => setSeekReq({ t, nonce: Date.now() })

  // Cmd+F: find in transcript (expands the rail if collapsed).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        if (railCollapsed) onToggleRail()
        requestAnimationFrame(() => {
          document.querySelector<HTMLInputElement>('.rail-search input')?.focus()
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [railCollapsed, onToggleRail])

  const createdAt = new Date(meeting.created_at)
  const isDeleted = meeting.deleted_at != null
  const purgeDays = isDeleted
    ? Math.max(0, Math.ceil(30 - (Date.now() - meeting.deleted_at!) / 86_400_000))
    : 0
  const canRecord =
    meeting.status === 'idle' &&
    !meeting.audio_dir &&
    meeting.origin !== 'import' &&
    !recordingActive &&
    !isDeleted

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
        {isDeleted ? (
          <>
            <button className="icon-btn" title="Restore meeting" onClick={onRestore}>
              <IconRestore size={15} />
            </button>
            <button className="icon-btn" title="Delete forever" onClick={onDeleteForever}>
              <IconTrash size={15} />
            </button>
          </>
        ) : (
          <div className="export-wrap">
            <button
              className="icon-btn"
              title="Export meeting"
              onClick={() => setExportOpen(!exportOpen)}
            >
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
        )}
        {!isDeleted && hasAudio && meeting.origin !== 'import' && (
          <button
            className="icon-btn"
            title="Re-transcribe (re-runs on-device with the latest noise filtering)"
            onClick={() => {
              onToast('Re-transcribing on-device…')
              window.api.transcribe.retry(meeting.id)
            }}
          >
            <IconRefresh size={15} />
          </button>
        )}
        {!isDeleted && (
          <button className="icon-btn" title="Move to Recently Deleted" onClick={onDelete}>
            <IconTrash size={15} />
          </button>
        )}
        <button
          className="icon-btn"
          title={railCollapsed ? 'Show transcript' : 'Hide transcript'}
          onClick={onToggleRail}
        >
          <IconPanelRight size={15} />
        </button>
      </div>

      {isDeleted && (
        <div className="deleted-banner">
          <span>
            This meeting is in Recently Deleted — it will be permanently erased in {purgeDays} day
            {purgeDays === 1 ? '' : 's'}.
          </span>
          <button className="record-btn small" onClick={onRestore}>
            Restore
          </button>
        </div>
      )}

      <div className="detail-body">
        <div className="notes-column">
          <input
            className="detail-title"
            value={title}
            spellCheck={false}
            placeholder="Untitled meeting"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() =>
              title.trim() && title !== meeting.title && onUpdate({ title: title.trim() })
            }
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

        {!railCollapsed && (
          <TranscriptRail
            meeting={meeting}
            segments={segments}
            isLive={meeting.status === 'recording' && liveSegments.length > 0}
            canSeek={hasAudio}
            query={query}
            onQueryChange={setQuery}
            matchCount={matches.length}
            matchPos={Math.min(matchIdx + 1, matches.length)}
            onCycle={cycle}
            currentSegIdx={currentSegIdx}
            playTime={playTime}
            isPlaying={isPlaying}
            onSegmentClick={(seg) => {
              if (hasAudio && seg.source !== 'import') seekTo(seg.start)
            }}
            onSegmentsChange={(next) => onUpdate({ transcript: JSON.stringify(next) })}
            onRetry={() => window.api.transcribe.retry(meeting.id)}
          />
        )}
      </div>

      {hasAudio && (
        <PlayerBar
          key={meeting.id}
          meetingId={meeting.id}
          audioFormat={meeting.audio_format}
          fallbackDuration={meeting.duration_sec}
          channels={channels}
          pins={pins}
          seekReq={seekReq}
          onTimeChange={(t, playing) => {
            setPlayTime(t)
            setIsPlaying(playing)
          }}
          onPinClick={(pin) => {
            const mi = matches.findIndex((m) => m.i === pin.segIdx)
            if (mi >= 0) setMatchIdx(mi)
            seekTo(pin.time)
          }}
        />
      )}
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
  const [readiness, setReadiness] = useState<'checking' | 'ready' | 'microphone' | 'model'>(
    'checking'
  )

  useEffect(() => {
    Promise.all([window.api.permissions.status(), window.api.models.list()]).then(
      ([permission, models]) => {
        if (
          !models.whisperInstalled ||
          !models.models.some((model) => model.installed && model.active)
        ) {
          setReadiness('model')
        } else if (permission.microphone !== 'granted') {
          setReadiness('microphone')
        } else {
          setReadiness('ready')
        }
      }
    )
  }, [])

  return (
    <div className="start-card">
      <div className="start-card-info">
        <div className="start-card-title">Ready to record</div>
        <div className="start-card-sub">
          Captures Teams call audio and your room, transcribed on-device.
        </div>
        <button
          className={`readiness-status ${readiness}`}
          disabled={readiness === 'checking' || readiness === 'ready'}
          onClick={() => {
            if (readiness === 'microphone') void window.api.permissions.openPane('microphone')
            if (readiness === 'model')
              window.dispatchEvent(new CustomEvent('meeterz:open-settings'))
          }}
        >
          <span aria-hidden="true" />
          {readiness === 'checking'
            ? 'Checking setup…'
            : readiness === 'ready'
              ? 'Recording setup ready'
              : readiness === 'microphone'
                ? 'Microphone access needs attention'
                : 'Transcription model needs attention'}
        </button>
      </div>
      <div className="start-card-controls">
        <button
          className={`toggle-pill ${system ? 'on' : ''}`}
          aria-pressed={system}
          aria-label="Capture system audio"
          onClick={() => setSystem(!system)}
          title="Capture system audio (Teams, any app)"
        >
          <IconSpeaker size={14} /> System
        </button>
        <button
          className={`toggle-pill ${mic ? 'on' : ''}`}
          aria-pressed={mic}
          aria-label="Capture microphone"
          onClick={() => setMic(!mic)}
          title="Capture microphone (room)"
        >
          <IconMic size={14} /> Mic
        </button>
        <button
          className="record-btn"
          disabled={
            (!system && !mic) || readiness === 'model' || (mic && readiness === 'microphone')
          }
          onClick={() => onStart({ system, mic })}
        >
          <IconWave size={15} />
          Record
        </button>
      </div>
    </div>
  )
}
