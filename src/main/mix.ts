import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { unlink } from 'fs/promises'
import { join } from 'path'
import { buildHeader } from './wav'
import type { Channel } from './recording'

const execFileAsync = promisify(execFile)
const SR = 16000

// Produces a single mixed.m4a (mic + system summed) for a meeting, so the
// player uses ONE audio element instead of two fighting to stay in sync.
// Idempotent: skips if mixed.m4a already exists.
export async function mixMeeting(dir: string, channels: Channel[]): Promise<boolean> {
  const mixedM4a = join(dir, 'mixed.m4a')
  if (existsSync(mixedM4a)) return true
  if (channels.length === 0) return false

  // A single channel needs no mixing — just reuse it under the mixed name.
  const wavs: string[] = []
  const temps: string[] = []
  try {
    for (const ch of channels) {
      const wav = join(dir, `${ch}.wav`)
      if (existsSync(wav)) {
        wavs.push(wav)
      } else {
        const m4a = join(dir, `${ch}.m4a`)
        if (!existsSync(m4a)) continue
        const tmp = join(dir, `${ch}.mixsrc.wav`)
        await execFileAsync('/usr/bin/afconvert', [
          '-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', m4a, tmp
        ])
        wavs.push(tmp)
        temps.push(tmp)
      }
    }
    if (wavs.length === 0) return false

    // Int16 views over the PCM payloads — summing via typed arrays is orders
    // of magnitude faster than per-sample Buffer reads on 25M-sample files.
    const views = wavs.map((w) => {
      const buf = readFileSync(w)
      const di = buf.indexOf('data')
      const payload = buf.subarray(di >= 0 ? di + 8 : 44)
      const aligned = payload.byteLength - (payload.byteLength % 2)
      return new Int16Array(payload.buffer, payload.byteOffset, aligned / 2)
    })
    const samples = Math.max(...views.map((v) => v.length))
    const out = new Int16Array(samples)
    for (const v of views) {
      const len = v.length
      for (let i = 0; i < len; i++) {
        // Soft clip to keep loud overlaps from wrapping.
        const sum = out[i] + v[i]
        out[i] = sum > 32767 ? 32767 : sum < -32768 ? -32768 : sum
      }
    }
    const mixedWav = join(dir, 'mixed.mix.wav')
    writeFileSync(mixedWav, Buffer.concat([buildHeader(SR, out.byteLength), Buffer.from(out.buffer, out.byteOffset, out.byteLength)]))
    temps.push(mixedWav)
    await execFileAsync('/usr/bin/afconvert', ['-f', 'm4af', '-d', 'aac', mixedWav, mixedM4a])
    return true
  } catch {
    return false
  } finally {
    for (const t of temps) await unlink(t).catch(() => {})
  }
}
