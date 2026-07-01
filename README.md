# Meeterz

Local-first meeting recorder and transcriber for macOS. Records **Teams/system audio** and the
**room microphone** as separate channels — no virtual audio drivers — and transcribes on-device
with Whisper (English, French, Dutch and 90+ other languages, auto-detected). Notes, folders,
search. Nothing leaves your Mac.

## How it works

- **System audio (Teams, any app):** Electron 39+'s `getDisplayMedia` loopback path, which
  Chromium routes through Apple's CoreAudio process-tap API (macOS 14.2+). Audio-only grant —
  no Screen Recording permission needed, only "System Audio Recording".
- **Microphone:** `getUserMedia` with echo cancellation, so the mic channel stays clean of
  speaker bleed.
- Both channels stream as 16 kHz PCM to the main process and are written to separate WAVs.
- **Transcription:** `whisper-cli` (whisper.cpp, Metal-accelerated) runs after the meeting on
  each channel; segments are interleaved by time and labeled **Them** (system) / **You / Room**
  (mic).
- **Storage:** SQLite (better-sqlite3) in `~/Library/Application Support/meeterz`.

## Requirements

- macOS 14.4+ on Apple Silicon
- `brew install whisper-cpp`
- A Whisper model in `models/` — multilingual (recommended):
  `curl -L -o models/ggml-small.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin`

Env overrides: `MEETERZ_WHISPER` (whisper-cli path), `MEETERZ_MODEL` (model path).

## Develop

```sh
npm install
npm run dev
```

First recording prompts for **System Audio Recording** and **Microphone** permissions. In dev,
the permission is attributed to the Electron binary (its Info.plist already carries the usage
keys; `scripts/patch-electron-plist.mjs` ensures it).

## Test

End-to-end suite (Playwright driving the real app — records `say` output through the loopback
and asserts the Whisper transcript in English, French and Dutch; also checks dark mode and
responsive layout):

```sh
npm run build && npm run test:e2e
```

## Package

```sh
npm run build:mac
```

`electron-builder.yml` adds `NSAudioCaptureUsageDescription` / `NSMicrophoneUsageDescription`
and bundles `models/` into app resources.

## Docs

- `docs/research-report.html` — verified technical research behind the architecture
- `docs/UI_SPEC.md` + `docs/MOBBIN_REFS.md` — design system and references
