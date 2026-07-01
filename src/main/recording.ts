import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'
import { WavWriter } from './wav'
import { transcribeWindow, whisperBin } from './transcribe'
import type { TranscriptSegment } from './db'

export type Channel = 'mic' | 'system'
export const SAMPLE_RATE = 16000

// Live transcription cadence. Each tick transcribes only the audio that
// arrived since the previous tick (language auto-detected per tick, so
// NL/FR switching shows correctly even live).
const LIVE_INTERVAL_MS = 15_000
const LIVE_MIN_NEW_SEC = 5

interface Session {
  meetingId: number
  dir: string
  writers: Partial<Record<Channel, WavWriter>>
  startedAt: number
  paused: boolean
  liveTimer: NodeJS.Timeout | null
  liveBusy: boolean
  liveProcessed: Partial<Record<Channel, number>>
  liveSegments: TranscriptSegment[]
}

let session: Session | null = null
let onLiveSegments: ((meetingId: number, segments: TranscriptSegment[]) => void) | null = null

export function setLiveListener(
  cb: (meetingId: number, segments: TranscriptSegment[]) => void
): void {
  onLiveSegments = cb
}

export function recordingsRoot(): string {
  return join(app.getPath('userData'), 'recordings')
}

export function startSession(meetingId: number, live: boolean): string {
  if (session) throw new Error('A recording session is already active')
  const dir = join(recordingsRoot(), String(meetingId))
  mkdirSync(dir, { recursive: true })
  session = {
    meetingId,
    dir,
    writers: {},
    startedAt: Date.now(),
    paused: false,
    liveTimer: null,
    liveBusy: false,
    liveProcessed: {},
    liveSegments: []
  }
  if (live && whisperBin()) {
    session.liveTimer = setInterval(liveTick, LIVE_INTERVAL_MS)
  }
  return dir
}

export function setPaused(paused: boolean): void {
  if (session) session.paused = paused
}

export function appendAudio(channel: Channel, data: ArrayBuffer): void {
  if (!session || session.paused) return
  let writer = session.writers[channel]
  if (!writer) {
    writer = new WavWriter(join(session.dir, `${channel}.wav`), SAMPLE_RATE)
    session.writers[channel] = writer
  }
  writer.append(Buffer.from(data))
}

async function liveTick(): Promise<void> {
  const s = session
  if (!s || s.liveBusy || s.paused) return
  s.liveBusy = true
  try {
    for (const ch of ['mic', 'system'] as Channel[]) {
      const w = s.writers[ch]
      if (!w) continue
      const total = w.sync()
      const from = s.liveProcessed[ch] ?? 0
      if (total - from < LIVE_MIN_NEW_SEC) continue
      const wav = join(s.dir, `${ch}.wav`)
      const segs = await transcribeWindow(wav, ch, from, total - from)
      s.liveProcessed[ch] = total
      if (segs.length > 0 && session === s) {
        s.liveSegments = [...s.liveSegments, ...segs].sort((a, b) => a.start - b.start)
        onLiveSegments?.(s.meetingId, s.liveSegments)
      }
    }
  } catch {
    // live transcription is best-effort; the post-meeting pass is authoritative
  } finally {
    s.liveBusy = false
  }
}

export interface StopResult {
  meetingId: number
  dir: string
  durationSec: number
  channels: Channel[]
}

export function stopSession(): StopResult | null {
  if (!session) return null
  const { meetingId, dir, writers, liveTimer } = session
  if (liveTimer) clearInterval(liveTimer)
  session = null
  let duration = 0
  const channels: Channel[] = []
  for (const ch of ['mic', 'system'] as Channel[]) {
    const w = writers[ch]
    if (w) {
      duration = Math.max(duration, w.close())
      channels.push(ch)
    }
  }
  return { meetingId, dir, durationSec: duration, channels }
}

export function isRecording(): boolean {
  return session !== null
}

export function activeMeetingId(): number | null {
  return session?.meetingId ?? null
}

export function channelsOnDisk(dir: string): Channel[] {
  return (['mic', 'system'] as Channel[]).filter((ch) => existsSync(join(dir, `${ch}.wav`)))
}
