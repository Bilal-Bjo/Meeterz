import { readFile } from 'fs/promises'
import { basename } from 'path'
import type { TranscriptSegment } from './db'

// Parses a Microsoft Teams transcript export (WebVTT). Teams wraps each cue's
// text in a voice span: <v Jan Peeters>Goedemorgen iedereen</v>. Plain VTT and
// SRT-style files without voice tags also work (no speaker attribution).

function parseTimestamp(ts: string): number | null {
  const m = ts.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/)
  if (!m) return null
  const [, h, min, s, ms] = m
  return Number(h ?? 0) * 3600 + Number(min) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000
}

export interface VttImport {
  title: string
  segments: TranscriptSegment[]
  durationSec: number
}

export async function parseVttFile(path: string): Promise<VttImport> {
  const raw = await readFile(path, 'utf-8')
  const lines = raw.replace(/^﻿/, '').split(/\r?\n/)
  const segments: TranscriptSegment[] = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const arrow = line.includes('-->') ? line : null
    if (!arrow) {
      i++
      continue
    }
    const [fromRaw, toRaw] = arrow.split('-->')
    const start = parseTimestamp(fromRaw)
    const end = parseTimestamp(toRaw.trim().split(/\s+/)[0] ?? '')
    i++
    const textLines: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].includes('-->')) {
      textLines.push(lines[i])
      i++
    }
    if (start === null || end === null || textLines.length === 0) continue

    const joined = textLines.join(' ').trim()
    const voice = joined.match(/^<v(?:\.[^ >]*)?\s+([^>]+)>([\s\S]*?)(?:<\/v>)?$/)
    const speaker = voice?.[1]?.trim()
    const text = (voice ? voice[2] : joined).replace(/<[^>]+>/g, '').trim()
    if (!text) continue

    segments.push({
      source: 'import',
      start,
      end,
      text,
      ...(speaker ? { speaker } : {})
    })
  }

  if (segments.length === 0) {
    throw new Error('No transcript cues found — is this a Teams .vtt transcript export?')
  }
  return {
    title: basename(path).replace(/\.[^.]+$/, ''),
    segments,
    durationSec: Math.max(...segments.map((s) => s.end))
  }
}
