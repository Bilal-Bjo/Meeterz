import { openSync, writeSync, closeSync } from 'fs'

// Streaming 16-bit PCM mono WAV writer. Header sizes are patched on close so a
// crash mid-recording still leaves a recoverable file.
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
    const h = Buffer.alloc(44)
    h.write('RIFF', 0)
    h.writeUInt32LE(36 + dataBytes, 4)
    h.write('WAVE', 8)
    h.write('fmt ', 12)
    h.writeUInt32LE(16, 16)
    h.writeUInt16LE(1, 20) // PCM
    h.writeUInt16LE(1, 22) // mono
    h.writeUInt32LE(this.sampleRate, 24)
    h.writeUInt32LE(this.sampleRate * 2, 28)
    h.writeUInt16LE(2, 32)
    h.writeUInt16LE(16, 34)
    h.write('data', 36)
    h.writeUInt32LE(dataBytes, 40)
    return h
  }

  append(int16: Buffer): void {
    writeSync(this.fd, int16)
    this.dataBytes += int16.length
  }

  get durationSec(): number {
    return this.dataBytes / 2 / this.sampleRate
  }

  close(): number {
    writeSync(this.fd, this.header(this.dataBytes), 0, 44, 0)
    closeSync(this.fd)
    return this.durationSec
  }
}
