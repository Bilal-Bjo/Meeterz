import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import type { Meeting, MeetingSummary, MeetingSummaryItem } from '../types'
import { formatTimestamp } from '../lib/format'

interface SummaryCardProps {
  meeting: Meeting
  canSeek: boolean
  onSeek: (timestamp: number) => void
  onGenerated: (summary: string) => void
  onToast: (text: string) => void
}

function SummaryRow({
  item,
  canSeek,
  onSeek
}: {
  item: MeetingSummaryItem
  canSeek: boolean
  onSeek: (timestamp: number) => void
}): JSX.Element {
  return (
    <li>
      <span>{item.text}</span>
      {item.timestamp != null && (
        <button
          disabled={!canSeek}
          onClick={() => onSeek(item.timestamp!)}
          title="Jump to transcript source"
        >
          {formatTimestamp(item.timestamp)}
        </button>
      )}
    </li>
  )
}

export function SummaryCard({
  meeting,
  canSeek,
  onSeek,
  onGenerated,
  onToast
}: SummaryCardProps): JSX.Element | null {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null)
  const summary = useMemo<MeetingSummary | null>(() => {
    if (!meeting.summary) return null
    try {
      return JSON.parse(meeting.summary) as MeetingSummary
    } catch {
      return null
    }
  }, [meeting.summary])

  useEffect(() => {
    void window.api.summaries.keyStatus().then(({ configured }) => setKeyConfigured(configured))
  }, [])

  if (!meeting.transcript || meeting.status !== 'ready') return null

  const generate = async (): Promise<void> => {
    if (!keyConfigured) {
      const status = await window.api.summaries.keyStatus()
      setKeyConfigured(status.configured)
      if (!status.configured) {
        window.dispatchEvent(new CustomEvent('meeterz:open-settings'))
        onToast('Add your OpenAI API key in Settings to enable summaries.')
        return
      }
    }
    setLoading(true)
    setError(null)
    try {
      const updated = await window.api.summaries.generate(meeting.id)
      if (updated.summary) onGenerated(updated.summary)
      onToast(summary ? 'Summary regenerated.' : 'Summary ready.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setLoading(false)
    }
  }

  if (!summary) {
    return (
      <section className="summary-empty">
        <div className="summary-spark" aria-hidden="true">
          ✦
        </div>
        <div>
          <strong>Meeting summary</strong>
          <p>Optional. Uses your OpenAI API key and sends this transcript only when you ask.</p>
        </div>
        <button className="summary-generate" onClick={generate} disabled={loading}>
          {loading ? 'Summarizing…' : keyConfigured === false ? 'Set up' : 'Generate'}
        </button>
        {error && <p className="summary-error">{error}</p>}
      </section>
    )
  }

  return (
    <section className="summary-card">
      <header>
        <div>
          <span className="summary-spark" aria-hidden="true">
            ✦
          </span>
          <strong>Meeting summary</strong>
          <span className="ai-label">OpenAI</span>
        </div>
        <button onClick={generate} disabled={loading}>
          {loading ? 'Updating…' : 'Regenerate'}
        </button>
      </header>
      <p className="summary-overview">{summary.overview}</p>
      <div className="summary-columns">
        {summary.keyPoints.length > 0 && (
          <div>
            <h4>Key points</h4>
            <ul>
              {summary.keyPoints.map((item, index) => (
                <SummaryRow key={index} item={item} canSeek={canSeek} onSeek={onSeek} />
              ))}
            </ul>
          </div>
        )}
        {summary.decisions.length > 0 && (
          <div>
            <h4>Decisions</h4>
            <ul>
              {summary.decisions.map((item, index) => (
                <SummaryRow key={index} item={item} canSeek={canSeek} onSeek={onSeek} />
              ))}
            </ul>
          </div>
        )}
      </div>
      {summary.actionItems.length > 0 && (
        <div className="summary-actions">
          <h4>Action items</h4>
          {summary.actionItems.map((item, index) => (
            <div className="action-row" key={index}>
              <span className="action-check" />
              <span>{item.text}</span>
              {item.owner && <small>{item.owner}</small>}
              {item.due && <small>{item.due}</small>}
              {item.timestamp != null && (
                <button disabled={!canSeek} onClick={() => onSeek(item.timestamp!)}>
                  {formatTimestamp(item.timestamp)}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <footer>Generated from this transcript · Verify important details against the source</footer>
      {error && <p className="summary-error">{error}</p>}
    </section>
  )
}
