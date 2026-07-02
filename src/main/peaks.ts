import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, readFileSync } from 'fs'
import { readFile, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import type { Channel } from './recording'

const execFileAsync = promisify(execFile)

const BUCKETS = 400

// Waveform peaks (0..1) for a recorded channel, computed once and cached
// beside the audio. Works for both WAV (fresh) and M4A (archived) — the M4A
// is decoded to a throwaway low-rate WAV via macOS's afconvert first.
export async function getPeaks(dir: string, channel: Channel): Promise<number[]> {
  const cache = join(dir, `${channel}.peaks.json`)
  if (existsSync(cache)) {
    try {
      return JSON.parse(await readFile(cache, 'utf-8'))
    } catch {
      /* recompute */
    }
  }

  let wav = join(dir, `${channel}.wav`)
  let temp: string | null = null
  if (!existsSync(wav)) {
    const m4a = join(dir, `${channel}.m4a`)
    if (!existsSync(m4a)) return []
    temp = join(dir, `${channel}.peaks-tmp.wav`)
    await execFileAsync('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@4000', '-c', '1', m4a, temp])
    wav = temp
  }

  try {
    const buf = readFileSync(wav)
    const dataIdx = buf.indexOf('data')
    if (dataIdx < 0) return []
    const start = dataIdx + 8
    const samples = Math.floor((buf.length - start) / 2)
    if (samples < BUCKETS) return []
    const per = Math.floor(samples / BUCKETS)
    const peaks: number[] = []
    for (let b = 0; b < BUCKETS; b++) {
      let max = 0
      const from = start + b * per * 2
      for (let i = 0; i < per; i += 4) {
        const v = Math.abs(buf.readInt16LE(from + i * 2))
        if (v > max) max = v
      }
      peaks.push(max / 32768)
    }
    // Normalize so quiet recordings still render a visible shape.
    const top = Math.max(...peaks, 0.05)
    const norm = peaks.map((p) => Math.round((p / top) * 100) / 100)
    await writeFile(cache, JSON.stringify(norm)).catch(() => {})
    return norm
  } finally {
    if (temp) await unlink(temp).catch(() => {})
  }
}
