import type { TranscriptSegment } from '../types'

export function speakerName(seg: TranscriptSegment): string {
  if (seg.source === 'import') return seg.speaker ?? 'Speaker'
  const channel = seg.source === 'system' ? 'Them' : 'You / Room'
  return seg.speaker ? `${channel} · ${seg.speaker}` : channel
}

export function speakerClass(seg: TranscriptSegment): string {
  return seg.source
}
