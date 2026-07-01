// Dual-channel audio capture: microphone via getUserMedia, system/loopback via
// getDisplayMedia (Electron 39+ grants audio:'loopback' through the CoreAudio
// tap — see src/main/index.ts). Both are captured at 16 kHz mono and streamed
// to the main process as Int16 PCM, which writes them into separate WAVs.

const CAPTURE_SAMPLE_RATE = 16000

// Converts Float32 frames to Int16 inside the audio thread and posts them out.
const WORKLET_SOURCE = `
class PCMCapture extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]
    if (input && input[0] && input[0].length > 0) {
      const f32 = input[0]
      const i16 = new Int16Array(f32.length)
      for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i]))
        i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }
      this.port.postMessage(i16.buffer, [i16.buffer])
    }
    return true
  }
}
registerProcessor('pcm-capture', PCMCapture)
`

export interface CaptureSources {
  mic: boolean
  system: boolean
}

interface ChannelPipe {
  stream: MediaStream
  analyser: AnalyserNode
  node: AudioWorkletNode
}

export class MeetingCapture {
  private ctx: AudioContext | null = null
  private pipes = new Map<'mic' | 'system', ChannelPipe>()

  get running(): boolean {
    return this.ctx !== null
  }

  async start(sources: CaptureSources): Promise<void> {
    if (this.ctx) throw new Error('capture already running')
    const ctx = new AudioContext({ sampleRate: CAPTURE_SAMPLE_RATE })
    this.ctx = ctx
    const workletUrl = URL.createObjectURL(
      new Blob([WORKLET_SOURCE], { type: 'application/javascript' })
    )
    await ctx.audioWorklet.addModule(workletUrl)
    URL.revokeObjectURL(workletUrl)

    try {
      if (sources.system) {
        // Audio-only display capture; main grants { audio: 'loopback' }. If
        // this Chromium build insists on a video request, retry with video and
        // discard the track.
        const display = await navigator.mediaDevices
          .getDisplayMedia({ audio: true, video: false })
          .catch(() => navigator.mediaDevices.getDisplayMedia({ audio: true, video: true }))
        display.getVideoTracks().forEach((t) => t.stop())
        if (display.getAudioTracks().length === 0) {
          throw new Error(
            'No system-audio track. Grant "System Audio Recording" permission in System Settings › Privacy & Security.'
          )
        }
        this.attach('system', new MediaStream(display.getAudioTracks()))
      }
      if (sources.mic) {
        const mic = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        })
        this.attach('mic', mic)
      }
    } catch (err) {
      await this.teardown()
      throw err
    }
  }

  private attach(channel: 'mic' | 'system', stream: MediaStream): void {
    const ctx = this.ctx!
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    const node = new AudioWorkletNode(ctx, 'pcm-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      channelCountMode: 'explicit'
    })
    node.port.onmessage = (e: MessageEvent<ArrayBuffer>): void => {
      window.api.recording.append(channel, e.data)
    }
    source.connect(analyser)
    source.connect(node)
    this.pipes.set(channel, { stream, analyser, node })
  }

  // 0..1 momentary level per channel, for the waveform HUD.
  levels(): { mic: number; system: number } {
    const out = { mic: 0, system: 0 }
    for (const [channel, pipe] of this.pipes) {
      const buf = new Uint8Array(pipe.analyser.fftSize)
      pipe.analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128
        sum += v * v
      }
      out[channel] = Math.min(1, Math.sqrt(sum / buf.length) * 4)
    }
    return out
  }

  async stop(): Promise<void> {
    await this.teardown()
  }

  private async teardown(): Promise<void> {
    for (const pipe of this.pipes.values()) {
      pipe.node.port.onmessage = null
      pipe.stream.getTracks().forEach((t) => t.stop())
    }
    this.pipes.clear()
    if (this.ctx) {
      await this.ctx.close().catch(() => {})
      this.ctx = null
    }
  }
}
