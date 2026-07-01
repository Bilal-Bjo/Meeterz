import { execFile } from 'child_process'
import { existsSync, statSync } from 'fs'
import { readFile, unlink } from 'fs/promises'
import { join } from 'path'
import type { Channel } from './recording'
import type { TranscriptSegment } from './db'
import { settings } from './db'
import { modelsDir } from './paths'
import { diarizeChannel } from './diarize'
import { extractWavWindow } from './wav'

const WHISPER_CANDIDATES = [
  process.env.MEETERZ_WHISPER ?? '',
  '/opt/homebrew/bin/whisper-cli',
  '/usr/local/bin/whisper-cli'
].filter(Boolean)

export function whisperBin(): string | null {
  for (const c of WHISPER_CANDIDATES) if (existsSync(c)) return c
  return null
}

export function activeModelPath(): string {
  if (process.env.MEETERZ_MODEL && existsSync(process.env.MEETERZ_MODEL)) {
    return process.env.MEETERZ_MODEL
  }
  const chosen = settings.get('model', 'ggml-small.bin')
  const dir = modelsDir()
  const candidates = [join(dir, chosen), join(dir, 'ggml-small.bin'), join(dir, 'ggml-base.en.bin')]
  for (const c of candidates) if (existsSync(c)) return c
  throw new Error('No Whisper model found — download one in Settings.')
}

// Whisper emits bracketed non-speech markers on silence/noise; drop them.
const NOISE = /^[\s([]*(BLANK_AUDIO|silence|music|noise|inaudible|typing|no audio)[\s)\]]*$/i

interface WhisperJson {
  result?: { language?: string }
  transcription?: { offsets: { from: number; to: number }; text: string }[]
}

function execWhisper(args: string[]): Promise<void> {
  const bin = whisperBin()
  if (!bin) {
    return Promise.reject(
      new Error('whisper-cli not found. Install it with `brew install whisper-cpp`.')
    )
  }
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 64 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) {
        const detail = (stderr || err.message).split('\n').filter(Boolean).slice(-3).join(' ')
        reject(new Error(`whisper failed: ${detail}`))
      } else resolve()
    })
  })
}

export function wavDurationSec(wav: string): number {
  // Our WAVs are 16 kHz mono 16-bit with a 44-byte header.
  return Math.max(0, (statSync(wav).size - 44) / 2 / 16000)
}

// Transcribe one time-window of a WAV with per-window language auto-detection.
// This is what makes NL/FR code-switching work: language is re-detected every
// window instead of once for the whole file. Also reused by live transcription.
export async function transcribeWindow(
  wav: string,
  source: TranscriptSegment['source'],
  fromSec: number,
  durSec: number | null
): Promise<TranscriptSegment[]> {
  const model = activeModelPath()
  const isWhole = fromSec === 0 && durSec === null
  // whisper-cli's -ot/-d window flags are unreliable (-d is ignored by some
  // builds), so the window is sliced into a temp WAV instead.
  const input = isWhole ? wav : `${wav}.win-${Math.round(fromSec * 1000)}.wav`
  if (!isWhole) extractWavWindow(wav, input, fromSec, durSec)
  const outPrefix = `${input}.out`
  const args = ['-m', model, '-f', input, '-oj', '-of', outPrefix, '-t', '4', '-np']
  if (!model.includes('.en.')) args.push('-l', 'auto')

  try {
    await execWhisper(args)
    const raw: WhisperJson = JSON.parse(await readFile(`${outPrefix}.json`, 'utf-8'))
    const lang = raw.result?.language
    return (raw.transcription ?? [])
      .map((s) => ({
        source,
        start: s.offsets.from / 1000 + fromSec,
        end: s.offsets.to / 1000 + fromSec,
        text: s.text.trim(),
        ...(lang ? { lang } : {})
      }))
      .filter((s) => s.text.length > 0 && !NOISE.test(s.text))
  } finally {
    await unlink(`${outPrefix}.json`).catch(() => {})
    if (!isWhole) await unlink(input).catch(() => {})
  }
}

function windowSec(): number {
  const env = Number(process.env.MEETERZ_CHUNK_SEC)
  if (Number.isFinite(env) && env >= 4) return env
  return Number(settings.get('chunk_sec', '30'))
}

const OVERLAP_SEC = 2

async function transcribeChannelWav(
  wav: string,
  source: Channel
): Promise<TranscriptSegment[]> {
  const total = wavDurationSec(wav)
  const win = windowSec()
  if (total <= win + OVERLAP_SEC) {
    return transcribeWindow(wav, source, 0, null)
  }
  const out: TranscriptSegment[] = []
  let coveredUntil = 0
  for (let start = 0; start < total; start += win - OVERLAP_SEC) {
    const dur = Math.min(win, total - start)
    const segs = await transcribeWindow(wav, source, start, dur)
    for (const s of segs) {
      if (s.end > coveredUntil + 0.2) {
        out.push(s)
        coveredUntil = Math.max(coveredUntil, s.end)
      }
    }
    if (start + dur >= total) break
  }
  return out
}

// Transcribes each recorded channel (windowed, language re-detected per
// window), then diarizes speakers within each channel, then interleaves.
export async function transcribeMeeting(
  dir: string,
  channels: Channel[]
): Promise<TranscriptSegment[]> {
  const present = channels.filter((ch) => existsSync(join(dir, `${ch}.wav`)))
  const perChannel = await Promise.all(
    present.map(async (ch) => {
      const wav = join(dir, `${ch}.wav`)
      const segs = await transcribeChannelWav(wav, ch)
      return diarizeChannel(wav, segs).catch(() => segs)
    })
  )
  return perChannel.flat().sort((a, b) => a.start - b.start)
}
