import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { WavWriter } from './wav'

export type Channel = 'mic' | 'system'
export const SAMPLE_RATE = 16000

interface Session {
  meetingId: number
  dir: string
  writers: Partial<Record<Channel, WavWriter>>
  startedAt: number
}

let session: Session | null = null

export function recordingsRoot(): string {
  return join(app.getPath('userData'), 'recordings')
}

export function startSession(meetingId: number): string {
  if (session) throw new Error('A recording session is already active')
  const dir = join(recordingsRoot(), String(meetingId))
  mkdirSync(dir, { recursive: true })
  session = { meetingId, dir, writers: {}, startedAt: Date.now() }
  return dir
}

export function appendAudio(channel: Channel, data: ArrayBuffer): void {
  if (!session) return // stray chunk after stop — drop it
  let writer = session.writers[channel]
  if (!writer) {
    writer = new WavWriter(join(session.dir, `${channel}.wav`), SAMPLE_RATE)
    session.writers[channel] = writer
  }
  writer.append(Buffer.from(data))
}

export interface StopResult {
  meetingId: number
  dir: string
  durationSec: number
  channels: Channel[]
}

export function stopSession(): StopResult | null {
  if (!session) return null
  const { meetingId, dir, writers } = session
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
