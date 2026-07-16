import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import type { Meeting, SearchHit } from '../types'
import { formatDuration, formatRelativeDay, formatTime } from '../lib/format'
import { IconSearch } from './Icons'

interface MeetingListProps {
  meetings: Meeting[]
  selectedId: number | null
  onSelect: (id: number) => void
  onContextMenu: (id: number) => void
  isTrash: boolean
  onEmptyTrash: () => void
  query: string
  onQueryChange: (q: string) => void
  scopeLabel: string
}

function cleanSnippet(text: string): string {
  return text
    .replace(/[\u0001\u0002]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function HighlightedSnippet({ text, query }: { text: string; query: string }): JSX.Element {
  const clean = cleanSnippet(text)
  const q = query.trim()
  if (!q) return <>{clean}</>
  const start = clean.toLocaleLowerCase().indexOf(q.toLocaleLowerCase())
  if (start < 0) return <>{clean}</>
  return (
    <>
      {clean.slice(0, start)}
      <mark>{clean.slice(start, start + q.length)}</mark>
      {clean.slice(start + q.length)}
    </>
  )
}

function snippet(m: Meeting): string {
  const notes = m.notes
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (notes) return notes.slice(0, 90)
  if (m.transcript) {
    try {
      const segs = JSON.parse(m.transcript) as { text: string }[]
      if (segs.length > 0)
        return segs
          .map((s) => s.text)
          .join(' ')
          .slice(0, 90)
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

export function MeetingList({
  meetings,
  selectedId,
  onSelect,
  onContextMenu,
  isTrash,
  onEmptyTrash,
  query,
  onQueryChange,
  scopeLabel
}: MeetingListProps): JSX.Element {
  const [hits, setHits] = useState<Map<number, string> | null>(null)
  const [origin, setOrigin] = useState<'all' | Meeting['origin']>('all')
  const [period, setPeriod] = useState<'all' | 'today' | 'week'>('all')

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
    const now = Date.now()
    const startOfToday = new Date().setHours(0, 0, 0, 0)
    return meetings.filter((meeting) => {
      if (hits !== null && !hits.has(meeting.id)) return false
      if (origin !== 'all' && meeting.origin !== origin) return false
      if (period === 'today' && meeting.created_at < startOfToday) return false
      if (period === 'week' && meeting.created_at < now - 7 * 24 * 60 * 60 * 1000) return false
      return true
    })
  }, [meetings, hits, origin, period])

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

  const moveKeyboardSelection = (currentId: number, direction: -1 | 1 | 'first' | 'last'): void => {
    if (filtered.length === 0) return
    const currentIndex = filtered.findIndex((meeting) => meeting.id === currentId)
    const nextIndex =
      direction === 'first'
        ? 0
        : direction === 'last'
          ? filtered.length - 1
          : Math.max(0, Math.min(filtered.length - 1, currentIndex + direction))
    const nextId = filtered[nextIndex].id
    onSelect(nextId)
    requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>(`[data-meeting-id="${nextId}"]`)?.focus()
    })
  }

  return (
    <section className="meeting-list">
      <div className="list-search">
        <IconSearch size={14} />
        <input
          aria-label="Search meetings"
          placeholder="Search meetings"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onQueryChange('')
              e.currentTarget.blur()
            }
          }}
          spellCheck={false}
        />
        {query && (
          <button
            className="search-clear"
            aria-label="Clear meeting search"
            title="Clear search"
            onClick={() => onQueryChange('')}
          >
            ×
          </button>
        )}
      </div>

      <div className="list-context" aria-live="polite">
        <span>{scopeLabel}</span>
        <span className="list-result-count">
          {hits === null
            ? `${meetings.length} meeting${meetings.length === 1 ? '' : 's'}`
            : `${filtered.length} result${filtered.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {!isTrash && (
        <div className="list-filters" aria-label="Meeting filters">
          <select
            aria-label="Meeting source"
            value={origin}
            onChange={(event) => setOrigin(event.target.value as typeof origin)}
          >
            <option value="all">All sources</option>
            <option value="recording">Recorded</option>
            <option value="import">Imported</option>
          </select>
          <select
            aria-label="Meeting date"
            value={period}
            onChange={(event) => setPeriod(event.target.value as typeof period)}
          >
            <option value="all">Any date</option>
            <option value="today">Today</option>
            <option value="week">Last 7 days</option>
          </select>
        </div>
      )}

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
            <strong>
              {query
                ? 'No matching meetings'
                : isTrash
                  ? 'Recently deleted is empty'
                  : scopeLabel === 'All meetings'
                    ? 'No meetings yet'
                    : 'This folder is empty'}
            </strong>
            <span>
              {query
                ? `Try a different word or clear “${query.trim()}”.`
                : isTrash
                  ? 'Deleted meetings stay here for up to 30 days.'
                  : 'Create a meeting from the sidebar to get started.'}
            </span>
            {query && (
              <button className="text-action" onClick={() => onQueryChange('')}>
                Clear search
              </button>
            )}
          </div>
        )}
        {groups.map((g) => (
          <div key={g.day} className="list-group">
            <div className="list-day">{g.day}</div>
            {g.items.map((m) => (
              <button
                key={m.id}
                data-meeting-id={m.id}
                className={`meeting-row ${selectedId === m.id ? 'selected' : ''}`}
                aria-current={selectedId === m.id ? 'true' : undefined}
                aria-label={`${m.title}, ${formatTime(m.created_at)}`}
                onClick={() => onSelect(m.id)}
                onContextMenu={(event) => {
                  event.preventDefault()
                  onSelect(m.id)
                  onContextMenu(m.id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault()
                    moveKeyboardSelection(m.id, event.key === 'ArrowDown' ? 1 : -1)
                  } else if (event.key === 'Home' || event.key === 'End') {
                    event.preventDefault()
                    moveKeyboardSelection(m.id, event.key === 'Home' ? 'first' : 'last')
                  }
                }}
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
                <div className="row-snippet">
                  <HighlightedSnippet text={hits?.get(m.id) || snippet(m)} query={query} />
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
