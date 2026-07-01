import { existsSync } from 'fs'
import { join } from 'path'
import type { TranscriptSegment } from './db'
import { modelsDir } from './paths'

// Speaker diarization within one audio channel via sherpa-onnx (pyannote
// segmentation + TitaNet embeddings, both language-agnostic). Entirely
// optional: any failure (missing module, missing models) leaves the
// channel-level labels untouched.

interface DiarSeg {
  start: number
  end: number
  speaker: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sherpa: any | null | undefined

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadSherpa(): any | null {
  if (sherpa !== undefined) return sherpa
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sherpa = require('sherpa-onnx-node')
  } catch {
    sherpa = null
  }
  return sherpa
}

function diarModelsDir(): string {
  return join(modelsDir(), 'diarization')
}

export async function diarizeChannel(
  wav: string,
  segments: TranscriptSegment[]
): Promise<TranscriptSegment[]> {
  if (segments.length === 0) return segments
  const s = loadSherpa()
  const dir = diarModelsDir()
  const segModel = join(dir, 'segmentation.onnx')
  const embModel = join(dir, 'embedding.onnx')
  if (!s || !existsSync(segModel) || !existsSync(embModel)) return segments

  const sd = new s.OfflineSpeakerDiarization({
    segmentation: { pyannote: { model: segModel } },
    embedding: { model: embModel },
    clustering: { numClusters: -1, threshold: 0.6 },
    minDurationOn: 0.3,
    minDurationOff: 0.5
  })
  const wave = s.readWave(wav)
  if (wave.sampleRate !== sd.sampleRate) return segments
  const diar: DiarSeg[] = sd.process(wave.samples) ?? []
  if (diar.length === 0) return segments

  const speakers = new Set(diar.map((d) => d.speaker))
  if (speakers.size <= 1) return segments // one voice — channel label is enough

  return segments.map((seg) => {
    let best = -1
    let bestOverlap = 0
    for (const d of diar) {
      const overlap = Math.min(seg.end, d.end) - Math.max(seg.start, d.start)
      if (overlap > bestOverlap) {
        bestOverlap = overlap
        best = d.speaker
      }
    }
    return best >= 0 ? { ...seg, speaker: `Speaker ${best + 1}` } : seg
  })
}
