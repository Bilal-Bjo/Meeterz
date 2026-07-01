import { BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'
import type { Meeting, TranscriptSegment } from './db'

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function speakerLabel(seg: TranscriptSegment): string {
  if (seg.speaker) {
    return seg.source === 'import' ? seg.speaker : `${seg.source === 'system' ? 'Them' : 'You / Room'} · ${seg.speaker}`
  }
  if (seg.source === 'import') return 'Speaker'
  return seg.source === 'system' ? 'Them' : 'You / Room'
}

function parseSegments(m: Meeting): TranscriptSegment[] {
  try {
    return JSON.parse(m.transcript ?? '[]')
  } catch {
    return []
  }
}

function notesToMarkdown(html: string): string {
  return html
    .replace(/<li[^>]*data-checked="true"[^>]*>(.*?)<\/li>/gs, '- [x] $1\n')
    .replace(/<li[^>]*data-checked="false"[^>]*>(.*?)<\/li>/gs, '- [ ] $1\n')
    .replace(/<h1[^>]*>(.*?)<\/h1>/gs, '# $1\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gs, '## $1\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gs, '### $1\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gs, '- $1\n')
    .replace(/<(strong|b)>(.*?)<\/\1>/gs, '**$2**')
    .replace(/<(em|i)>(.*?)<\/\1>/gs, '*$2*')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/(p|ul|ol|div)>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function meetingToMarkdown(m: Meeting): string {
  const date = new Date(m.created_at).toLocaleString()
  const parts: string[] = [`# ${m.title}`, '', `_${date}${m.duration_sec ? ` · ${fmtTime(m.duration_sec)}` : ''}_`, '']
  const notes = notesToMarkdown(m.notes)
  if (notes) {
    parts.push('## Notes', '', notes, '')
  }
  const segments = parseSegments(m)
  if (segments.length > 0) {
    parts.push('## Transcript', '')
    for (const s of segments) {
      parts.push(`**${speakerLabel(s)}** \`${fmtTime(s.start)}\`  ${s.text}`, '')
    }
  }
  return parts.join('\n')
}

function meetingToHtml(m: Meeting): string {
  const esc = (t: string): string =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const segments = parseSegments(m)
  const date = new Date(m.created_at).toLocaleString()
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: -apple-system, 'Helvetica Neue', sans-serif; color: #1d1d1f; margin: 48px; line-height: 1.6; }
    h1 { font-size: 26px; margin-bottom: 4px; } .meta { color: #6e6e73; font-size: 13px; margin-bottom: 24px; }
    h2 { font-size: 17px; margin: 24px 0 10px; border-bottom: 1px solid #e5e5e5; padding-bottom: 4px; }
    .seg { margin-bottom: 10px; font-size: 13.5px; } .who { font-weight: 600; } .t { color: #aeaeb2; font-size: 11px; margin-left: 6px; }
    .notes { font-size: 14px; } ul[data-type="taskList"] { list-style: none; padding-left: 0; }
  </style></head><body>
    <h1>${esc(m.title)}</h1>
    <div class="meta">${esc(date)}${m.duration_sec ? ` · ${fmtTime(m.duration_sec)}` : ''}</div>
    ${m.notes.trim() ? `<h2>Notes</h2><div class="notes">${m.notes}</div>` : ''}
    ${
      segments.length > 0
        ? `<h2>Transcript</h2>` +
          segments
            .map(
              (s) =>
                `<div class="seg"><span class="who">${esc(speakerLabel(s))}</span><span class="t">${fmtTime(s.start)}</span><br>${esc(s.text)}</div>`
            )
            .join('')
        : ''
    }
  </body></html>`
}

export async function exportPdf(m: Meeting, outPath: string): Promise<void> {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(meetingToHtml(m))}`)
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
    await writeFile(outPath, pdf)
  } finally {
    win.destroy()
  }
}
