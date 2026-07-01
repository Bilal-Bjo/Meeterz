// Dev-only: adds the audio-capture usage keys to the Electron dev binary's
// Info.plist. Without NSAudioCaptureUsageDescription in the (parent) app
// bundle, macOS creates the system-audio loopback stream silently dead.
// Packaged builds get these keys from electron-builder.yml extendInfo instead.
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const electronDist = dirname(require.resolve('electron/package.json'))
const plist = join(electronDist, 'dist', 'Electron.app', 'Contents', 'Info.plist')

if (process.platform !== 'darwin' || !existsSync(plist)) {
  process.exit(0)
}

const keys = {
  NSAudioCaptureUsageDescription:
    'Meeterz records system audio (e.g. Teams calls) to transcribe your meetings.',
  NSMicrophoneUsageDescription:
    'Meeterz records your microphone to transcribe in-person meetings.'
}

for (const [key, value] of Object.entries(keys)) {
  try {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist], { stdio: 'pipe' })
  } catch {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, plist])
    console.log(`Added ${key} to dev Electron Info.plist`)
  }
}
