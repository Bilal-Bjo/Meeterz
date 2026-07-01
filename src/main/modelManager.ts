import { net } from 'electron'
import { createWriteStream, existsSync, statSync } from 'fs'
import { mkdir, rename, unlink } from 'fs/promises'
import { join } from 'path'
import { whisperBin } from './transcribe'
import { modelsDir } from './paths'
import { settings } from './db'

// Whisper models the user can manage from Settings. `small` is the default:
// multilingual with solid NL/FR/EN. large-v3-turbo is the accuracy upgrade.
export const AVAILABLE_MODELS = [
  {
    file: 'ggml-base.bin',
    label: 'Base — fastest, decent accuracy',
    sizeMb: 148
  },
  {
    file: 'ggml-small.bin',
    label: 'Small — recommended balance',
    sizeMb: 488
  },
  {
    file: 'ggml-medium.bin',
    label: 'Medium — slower, more accurate',
    sizeMb: 1530
  },
  {
    file: 'ggml-large-v3-turbo.bin',
    label: 'Large v3 Turbo — best accuracy',
    sizeMb: 1620
  }
] as const

const HF_BASE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main'

export interface ModelStatus {
  file: string
  label: string
  sizeMb: number
  installed: boolean
  active: boolean
  downloading: boolean
  progress: number
}

const downloads = new Map<string, number>() // file -> progress 0..1

export function modelStatuses(): ModelStatus[] {
  const dir = modelsDir()
  const active = settings.get('model', 'ggml-small.bin')
  return AVAILABLE_MODELS.map((m) => ({
    ...m,
    installed: existsSync(join(dir, m.file)) && statSync(join(dir, m.file)).size > 1_000_000,
    active: m.file === active,
    downloading: downloads.has(m.file),
    progress: downloads.get(m.file) ?? 0
  }))
}

export function whisperInstalled(): boolean {
  return whisperBin() !== null
}

export function setActiveModel(file: string): void {
  settings.set('model', file)
}

export async function downloadModel(
  file: string,
  onProgress: (file: string, progress: number) => void
): Promise<void> {
  if (downloads.has(file)) return
  if (!AVAILABLE_MODELS.some((m) => m.file === file)) throw new Error(`Unknown model: ${file}`)
  const dir = modelsDir()
  await mkdir(dir, { recursive: true })
  const tmp = join(dir, `${file}.download`)
  const dest = join(dir, file)
  downloads.set(file, 0)

  try {
    const response = await net.fetch(`${HF_BASE}/${file}`)
    if (!response.ok || !response.body) throw new Error(`Download failed (HTTP ${response.status})`)
    const total = Number(response.headers.get('content-length') ?? 0)
    const out = createWriteStream(tmp)
    const reader = response.body.getReader()
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (total > 0) {
        const p = received / total
        downloads.set(file, p)
        onProgress(file, p)
      }
      await new Promise<void>((res, rej) =>
        out.write(Buffer.from(value), (e) => (e ? rej(e) : res()))
      )
    }
    await new Promise<void>((res, rej) => out.end((e: Error | null) => (e ? rej(e) : res())))
    await rename(tmp, dest)
    onProgress(file, 1)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw err
  } finally {
    downloads.delete(file)
  }
}
