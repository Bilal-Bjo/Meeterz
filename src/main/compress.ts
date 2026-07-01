import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { unlink } from 'fs/promises'
import { join } from 'path'
import type { Channel } from './recording'

const execFileAsync = promisify(execFile)

// WAV at 16 kHz mono is ~115 MB/hour; AAC is ~15. After transcription
// succeeds the WAVs are transcoded with macOS's built-in afconvert and
// deleted. Retry-transcription decodes back to a temp WAV on demand.

export async function compressChannels(dir: string, channels: Channel[]): Promise<boolean> {
  let allOk = true
  for (const ch of channels) {
    const wav = join(dir, `${ch}.wav`)
    const m4a = join(dir, `${ch}.m4a`)
    if (!existsSync(wav)) continue
    try {
      await execFileAsync('/usr/bin/afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '64000', wav, m4a])
      await unlink(wav)
    } catch {
      allOk = false // keep the WAV; playback and retry still work
    }
  }
  return allOk
}

// Decode an m4a channel back to 16 kHz mono WAV (for re-transcription).
export async function decodeToWav(dir: string, ch: Channel): Promise<string> {
  const wav = join(dir, `${ch}.wav`)
  if (existsSync(wav)) return wav
  const m4a = join(dir, `${ch}.m4a`)
  await execFileAsync('/usr/bin/afconvert', [
    '-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', m4a, wav
  ])
  return wav
}
