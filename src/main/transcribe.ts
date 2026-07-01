import { app } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import type { Channel } from './recording'
import type { TranscriptSegment } from './db'

const execFileAsync = promisify(execFile)

const WHISPER_CANDIDATES = [
  process.env.MEETERZ_WHISPER ?? '',
  '/opt/homebrew/bin/whisper-cli',
  '/usr/local/bin/whisper-cli'
].filter(Boolean)

function whisperBin(): string {
  for (const c of WHISPER_CANDIDATES) if (existsSync(c)) return c
  throw new Error(
    'whisper-cli not found. Install it with `brew install whisper-cpp` or set MEETERZ_WHISPER.'
  )
}

// Multilingual model preferred (Dutch/French/English with auto-detection);
// base.en is the lightweight fallback.
function modelPath(): string {
  // getAppPath varies with how the app is launched (packaged, `electron .`,
  // `electron out/main/index.js`), so walk up from it and try cwd too.
  const appPath = app.getAppPath()
  const roots = [
    appPath,
    join(appPath, '..', '..'),
    process.cwd(),
    process.resourcesPath ?? ''
  ].filter(Boolean)
  const candidates = [
    process.env.MEETERZ_MODEL ?? '',
    ...roots.flatMap((r) => [
      join(r, 'models', 'ggml-small.bin'),
      join(r, 'models', 'ggml-base.en.bin')
    ])
  ].filter(Boolean)
  for (const c of candidates) if (existsSync(c)) return c
  throw new Error('Whisper model not found (models/ggml-small.bin).')
}

interface WhisperJsonSegment {
  offsets: { from: number; to: number }
  text: string
}

// Whisper emits bracketed non-speech markers on silence/noise; drop them.
const NOISE = /^[\s([]*(BLANK_AUDIO|silence|music|noise|inaudible|typing|no audio)[\s)\]]*$/i

async function transcribeWav(wav: string, source: Channel): Promise<TranscriptSegment[]> {
  const outPrefix = wav.replace(/\.wav$/, '')
  const model = modelPath()
  const args = ['-m', model, '-f', wav, '-oj', '-of', outPrefix, '-t', '4', '-np']
  // English-only models reject language auto-detection.
  if (!model.includes('.en.')) args.push('-l', 'auto')
  await execFileAsync(whisperBin(), args, { maxBuffer: 64 * 1024 * 1024 })
  const raw = JSON.parse(await readFile(`${outPrefix}.json`, 'utf-8'))
  const segments: WhisperJsonSegment[] = raw.transcription ?? []
  return segments
    .map((s) => ({
      source,
      start: s.offsets.from / 1000,
      end: s.offsets.to / 1000,
      text: s.text.trim()
    }))
    .filter((s) => s.text.length > 0 && !NOISE.test(s.text))
}

// Transcribes each recorded channel and interleaves the segments by time,
// so "them" (system audio) and "you/room" (mic) read as one conversation.
export async function transcribeMeeting(
  dir: string,
  channels: Channel[]
): Promise<TranscriptSegment[]> {
  const perChannel = await Promise.all(
    channels
      .filter((ch) => existsSync(join(dir, `${ch}.wav`)))
      .map((ch) => transcribeWav(join(dir, `${ch}.wav`), ch))
  )
  return perChannel.flat().sort((a, b) => a.start - b.start)
}
