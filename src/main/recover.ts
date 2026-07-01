import { join } from 'path'
import { existsSync } from 'fs'
import { meetings } from './db'
import { repairWavHeader } from './wav'
import { channelsOnDisk } from './recording'
import type { Channel } from './recording'

// If the app died mid-recording, meetings are stuck in 'recording' and their
// WAV headers claim 0 bytes. The samples are on disk: repair the headers,
// restore the real duration, and hand the meeting back ready to transcribe.
export function recoverStuckRecordings(
  transcribe: (meetingId: number, dir: string, channels: Channel[]) => void
): void {
  for (const m of meetings.stuckRecordings()) {
    if (!m.audio_dir || !existsSync(m.audio_dir)) {
      meetings.update(m.id, {
        status: 'error',
        error_msg: 'Recording was interrupted and no audio was found.'
      })
      continue
    }
    const channels = channelsOnDisk(m.audio_dir)
    if (channels.length === 0) {
      meetings.update(m.id, {
        status: 'error',
        error_msg: 'Recording was interrupted before any audio was captured.'
      })
      continue
    }
    let duration = 0
    for (const ch of channels) {
      duration = Math.max(duration, repairWavHeader(join(m.audio_dir, `${ch}.wav`)))
    }
    meetings.update(m.id, {
      status: 'transcribing',
      duration_sec: duration,
      channels: JSON.stringify(channels),
      error_msg: null
    })
    transcribe(m.id, m.audio_dir, channels)
  }
}
