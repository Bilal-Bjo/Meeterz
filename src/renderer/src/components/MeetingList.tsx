import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import type { Meeting, SearchHit } from '../types'
import { formatDuration, formatRelativeDay, formatTime } from '../lib/format'
import { IconSearch } from './Icons'

interface MeetingListProps {
  meetings: Meeting[]
  selectedId: number | null
  onSelect: (id: number) => void
  isTrash: boolean
  onEmptyTrash: () => void
  query: string
  onQueryChange: (q: string) => void
}

function snippet(m: Meeting): string {
  const notes = m.notes.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (notes) return notes.slice(0, 90)
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

export function MeetingList({ meetings, selectedId, onSelect, isTrash, onEmptyTrash, query, onQueryChange }: MeetingListProps): JSX.Element {
  const [hits, setHits] = useState<Map<number, string> | null>(null)

  // Full-text search (SQLite FTS5) over title, notes and transcript.
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setHits(null)
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      const results: SearchHit[] = await window.api.meetings.search(q)
      if (!cancelled) setHits(new Map(results.map((h) => [h.id, h.snippet])))
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query])

  const filtered = useMemo(() => {
    if (hits === null) return meetings
    return meetings.filter((m) => hits.has(m.id))
  }, [meetings, hits])

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
          onChange={(e) => onQueryChange(e.target.value)}
          spellCheck={false}
        />
      </div>

      {isTrash && (
        <div className="trash-banner">
          <span>Deleted after 30 days</span>
          {meetings.length > 0 && (
            <button className="trash-empty-btn" onClick={onEmptyTrash}>
              Empty
            </button>
          )}
        </div>
      )}

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
                onDoubleClick={() => {
                  onSelect(m.id)
                  requestAnimationFrame(() => {
                    const el = document.querySelector<HTMLInputElement>('.detail-title')
                    el?.focus()
                    el?.select()
                  })
                }}
                title="Double-click to rename"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('meeterz/meeting-id', String(m.id))
                  e.dataTransfer.effectAllowed = 'move'
                }}
              >
                <div className="row-top">
                  <span className="row-title">{m.title}</span>
                  <StatusDot status={m.status} />
                </div>
                <div className="row-meta">
                  {formatTime(m.created_at)}
                  {m.duration_sec > 0 && <> · {formatDuration(m.duration_sec)}</>}
                </div>
                <div className="row-snippet">{hits?.get(m.id) || snippet(m)}</div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
