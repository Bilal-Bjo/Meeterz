import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import type { Meeting } from '../types'
import { formatDuration, formatRelativeDay, formatTime } from '../lib/format'
import { IconSearch } from './Icons'

interface MeetingListProps {
  meetings: Meeting[]
  selectedId: number | null
  onSelect: (id: number) => void
}

function snippet(m: Meeting): string {
  const notes = m.notes.trim()
  if (notes) return notes.replace(/\s+/g, ' ').slice(0, 90)
  if (m.transcript) {
    try {
      const segs = JSON.parse(m.transcript) as { text: string }[]
      if (segs.length > 0) return segs.map((s) => s.text).join(' ').slice(0, 90)
    } catch {
      /* ignore */
    }
  }
  return 'No notes yet'
}

function StatusDot({ status }: { status: Meeting['status'] }): JSX.Element | null {
  if (status === 'recording') return <span className="status-dot rec" title="Recording" />
  if (status === 'transcribing') return <span className="status-dot busy" title="Transcribing" />
  if (status === 'error') return <span className="status-dot err" title="Transcription failed" />
  return null
}

export function MeetingList({ meetings, selectedId, onSelect }: MeetingListProps): JSX.Element {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return meetings
    return meetings.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.notes.toLowerCase().includes(q) ||
        (m.transcript ?? '').toLowerCase().includes(q)
    )
  }, [meetings, query])

  const groups = useMemo(() => {
    const out: { day: string; items: Meeting[] }[] = []
    for (const m of filtered) {
      const day = formatRelativeDay(m.created_at)
      const last = out[out.length - 1]
      if (last && last.day === day) last.items.push(m)
      else out.push({ day, items: [m] })
    }
    return out
  }, [filtered])

  return (
    <section className="meeting-list">
      <div className="list-search">
        <IconSearch size={14} />
        <input
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="list-scroll">
        {groups.length === 0 && (
          <div className="list-empty">
            {query ? 'No meetings match your search.' : 'No meetings yet.'}
          </div>
        )}
        {groups.map((g) => (
          <div key={g.day} className="list-group">
            <div className="list-day">{g.day}</div>
            {g.items.map((m) => (
              <button
                key={m.id}
                className={`meeting-row ${selectedId === m.id ? 'selected' : ''}`}
                onClick={() => onSelect(m.id)}
              >
                <div className="row-top">
                  <span className="row-title">{m.title}</span>
                  <StatusDot status={m.status} />
                </div>
                <div className="row-meta">
                  {formatTime(m.created_at)}
                  {m.duration_sec > 0 && <> · {formatDuration(m.duration_sec)}</>}
                </div>
                <div className="row-snippet">{snippet(m)}</div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
