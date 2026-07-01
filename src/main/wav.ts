import { openSync, writeSync, closeSync, statSync, readFileSync, writeFileSync } from 'fs'

// Streaming 16-bit PCM mono WAV writer. The header is re-patched on sync()
// (so live transcription can read the growing file) and on close(); a crash
// mid-recording is recoverable via repairWavHeader().
export class WavWriter {
  private fd: number
  private dataBytes = 0
  readonly sampleRate: number

  constructor(path: string, sampleRate: number) {
    this.sampleRate = sampleRate
    this.fd = openSync(path, 'w')
    writeSync(this.fd, this.header(0))
  }

  private header(dataBytes: number): Buffer {
    return buildHeader(this.sampleRate, dataBytes)
  }

  append(int16: Buffer): void {
    writeSync(this.fd, int16)
    this.dataBytes += int16.length
  }

  // Patch the header in place so readers see the data written so far.
  sync(): number {
    writeSync(this.fd, this.header(this.dataBytes), 0, 44, 0)
    return this.durationSec
  }

  get durationSec(): number {
    return this.dataBytes / 2 / this.sampleRate
  }

  close(): number {
    this.sync()
    closeSync(this.fd)
    return this.durationSec
  }
}

export function buildHeader(sampleRate: number, dataBytes: number): Buffer {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + dataBytes, 4)
  h.write('WAVE', 8)
  h.write('fmt ', 12)
  h.writeUInt32LE(16, 16)
  h.writeUInt16LE(1, 20) // PCM
  h.writeUInt16LE(1, 22) // mono
  h.writeUInt32LE(sampleRate, 24)
  h.writeUInt32LE(sampleRate * 2, 28)
  h.writeUInt16LE(2, 32)
  h.writeUInt16LE(16, 34)
  h.write('data', 36)
  h.writeUInt32LE(dataBytes, 40)
  return h
}

// Copy a time window of a 16 kHz mono 16-bit WAV into its own file.
// whisper-cli's -d/--duration flag is unreliable, so windows are sliced here.
export function extractWavWindow(
  src: string,
  dest: string,
  fromSec: number,
  durSec: number | null,
  sampleRate = 16000
): void {
  const buf = readFileSync(src)
  const bytesPerSec = sampleRate * 2
  const dataStart = 44
  const from = dataStart + Math.floor(fromSec * bytesPerSec)
  const to =
    durSec === null ? buf.length : Math.min(buf.length, from + Math.ceil(durSec * bytesPerSec))
  const data = buf.subarray(Math.min(from, buf.length), to)
  writeFileSync(dest, Buffer.concat([buildHeader(sampleRate, data.length), data]))
}

// After a crash the header still says 0 data bytes; the samples are on disk.
// Rewrite the header from the real file size. Returns the recovered duration.
export function repairWavHeader(path: string, sampleRate = 16000): number {
  const size = statSync(path).size
  const dataBytes = Math.max(0, size - 44)
  const fd = openSync(path, 'r+')
  try {
    writeSync(fd, buildHeader(sampleRate, dataBytes), 0, 44, 0)
  } finally {
    closeSync(fd)
  }
  return dataBytes / 2 / sampleRate
}
