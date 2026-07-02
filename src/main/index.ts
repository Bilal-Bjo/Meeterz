import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  session,
  systemPreferences,
  protocol,
  dialog,
  Tray,
  Menu,
  nativeImage,
  globalShortcut,
  clipboard,
  nativeTheme
} from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import trayGlyph from '../../resources/trayTemplate.png?asset'
import trayGlyph2x from '../../resources/trayTemplate@2x.png?asset'
import { initDb, folders, meetings, settings, type Meeting } from './db'
import {
  startSession,
  appendAudio,
  stopSession,
  setPaused,
  recordingsRoot,
  isRecording,
  setLiveListener,
  type Channel
} from './recording'
import { transcribeMeeting } from './transcribe'
import { recoverStuckRecordings } from './recover'
import { parseVttFile } from './importVtt'
import { meetingToMarkdown, exportPdf } from './exporter'
import { compressChannels, decodeToWav } from './compress'
import { modelStatuses, downloadModel, setActiveModel, whisperInstalled } from './modelManager'
import { getPeaks } from './peaks'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

// Test isolation: point userData (db + recordings) at a scratch directory.
if (process.env.MEETERZ_USERDATA) {
  app.setPath('userData', process.env.MEETERZ_USERDATA)
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'meeterz-audio', privileges: { stream: true, supportFetchAPI: true } }
])

function send(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 18 },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function setupAudioCapture(): void {
  // Electron 39+: Chromium routes this through Apple's CoreAudio tap API on
  // macOS, so 'loopback' delivers system audio with no virtual driver.
  // Audio-only grant: no video source means no Screen Recording permission is
  // touched — only the separate "System Audio Recording Only" TCC applies.
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      callback({ audio: 'loopback' })
    },
    { useSystemPicker: false }
  )

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media' || permission === 'display-capture')
  })

  if (process.platform === 'darwin') {
    systemPreferences.askForMediaAccess('microphone').catch(() => {})
  }
}

function setupAudioProtocol(): void {
  // Serves recordings to the renderer: meeterz-audio://recordings/<id>/<file>
  // Range requests are essential: M4A stores its index (moov atom) at the
  // end of the file, so without byte ranges Chromium cannot determine the
  // duration or seek — the player timeline appears dead.
  protocol.handle('meeterz-audio', async (request) => {
    const url = new URL(request.url)
    const rel = decodeURIComponent(url.pathname).replace(/^\//, '')
    if (rel.includes('..')) return new Response('forbidden', { status: 403 })
    const file = join(recordingsRoot(), rel)
    const { existsSync, statSync, createReadStream } = await import('fs')
    const { Readable } = await import('stream')
    if (!existsSync(file)) return new Response('not found', { status: 404 })
    const size = statSync(file).size
    const mime = file.endsWith('.m4a') ? 'audio/mp4' : 'audio/wav'
    // All three RFC 7233 single-range forms matter here: "A-B", "A-" and
    // the suffix form "-N" (used to read the moov index at the end of an
    // M4A) — mishandling any of them silently corrupts the decoder's view
    // of the file.
    const range = request.headers.get('range')
    const m = range ? /^\s*bytes=(\d*)-(\d*)\s*$/.exec(range) : null
    if (m && (m[1] || m[2])) {
      const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]))
      let end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1
      if (start >= size || start > end) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${size}` }
        })
      }
      // Serve a bounded, fully-buffered chunk (RFC 7233 permits a subrange;
      // the client re-requests the rest). Streaming large bodies through
      // Readable.toWeb can deadlock on backpressure and stall playback.
      end = Math.min(end, start + 8 * 1024 * 1024 - 1)
      const { open } = await import('fs/promises')
      const fh = await open(file, 'r')
      try {
        const len = end - start + 1
        const buf = Buffer.alloc(len)
        await fh.read(buf, 0, len, start)
        return new Response(new Uint8Array(buf), {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(len),
            'Content-Type': mime
          }
        })
      } finally {
        await fh.close()
      }
    }
    const stream = Readable.toWeb(createReadStream(file)) as ReadableStream
    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
        'Content-Type': mime
      }
    })
  })
}

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

async function confirmDialog(message: string, detail: string, action: string): Promise<boolean> {
  if (process.env.MEETERZ_SKIP_CONFIRM === '1') return true
  const { response } = await dialog.showMessageBox(mainWindow!, {
    type: 'warning',
    buttons: [action, 'Cancel'],
    defaultId: 1,
    message,
    detail
  })
  return response === 0
}

async function eraseMeeting(m: Meeting): Promise<void> {
  // Safety: only ever erase a directory strictly inside the recordings root.
  const root = recordingsRoot()
  if (m.audio_dir && m.audio_dir.startsWith(root + '/') && m.audio_dir.length > root.length + 1) {
    const { rm } = await import('fs/promises')
    await rm(m.audio_dir, { recursive: true, force: true }).catch(() => {})
  }
  meetings.remove(m.id)
}

async function purgeExpiredTrash(): Promise<void> {
  for (const m of meetings.expired(TRASH_RETENTION_MS)) await eraseMeeting(m)
}

// Meetings recorded while AAC compression was broken are stranded as WAVs,
// which the player cannot serve reliably. Convert them in the background.
async function migrateWavMeetings(): Promise<void> {
  for (const m of meetings.list()) {
    if (m.audio_format !== 'wav' || !m.audio_dir || m.status !== 'ready') continue
    try {
      const channels = JSON.parse(m.channels) as Channel[]
      if (channels.length === 0) continue
      if (await compressChannels(m.audio_dir, channels)) {
        meetings.update(m.id, { audio_format: 'm4a' })
        notifyMeetingUpdated(m.id)
      }
    } catch {
      /* leave as WAV; retried next launch */
    }
  }
}

function notifyMeetingUpdated(meetingId: number): void {
  send('meeting:updated', meetings.get(meetingId))
}

function setRecordingIndicators(recording: boolean): void {
  if (process.platform === 'darwin') app.dock?.setBadge(recording ? '●' : '')
  rebuildTrayMenu()
}

// Shared post-recording pipeline: transcribe (windowed, per-window language
// detection, diarization) → compress WAV → M4A → ready.
function runTranscription(meetingId: number, dir: string, channels: Channel[]): void {
  transcribeMeeting(dir, channels)
    .then(async (segments) => {
      const compressed = await compressChannels(dir, channels)
      meetings.update(meetingId, {
        transcript: JSON.stringify(segments),
        status: 'ready',
        error_msg: null,
        audio_format: compressed ? 'm4a' : 'wav'
      })
      notifyMeetingUpdated(meetingId)
    })
    .catch((err) => {
      meetings.update(meetingId, {
        status: 'error',
        error_msg: err instanceof Error ? err.message : String(err)
      })
      notifyMeetingUpdated(meetingId)
    })
}

function registerIpc(): void {
  ipcMain.handle('folders:list', () => folders.list())
  ipcMain.handle('folders:create', (_e, name: string) => folders.create(name))
  ipcMain.handle('folders:rename', (_e, id: number, name: string) => folders.rename(id, name))
  ipcMain.handle('folders:remove', async (_e, id: number) => {
    const { response } = await dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      buttons: ['Delete Folder', 'Cancel'],
      defaultId: 1,
      message: 'Delete this folder?',
      detail: 'Meetings inside it are kept and moved to All Meetings.'
    })
    if (response === 0) folders.remove(id)
    return response === 0
  })

  ipcMain.handle('meetings:list', () => meetings.list())
  ipcMain.handle('meetings:get', (_e, id: number) => meetings.get(id))
  ipcMain.handle('meetings:create', (_e, title: string, folderId: number | null) =>
    meetings.create(title, folderId)
  )
  ipcMain.handle('meetings:update', (_e, id: number, fields: object) => {
    meetings.update(id, fields)
    return meetings.get(id)
  })
  // Reversible: meetings land in Recently Deleted and are purged after 30 days.
  ipcMain.handle('meetings:remove', (_e, id: number) => {
    meetings.softDelete(id)
    return true
  })
  ipcMain.handle('meetings:listDeleted', () => meetings.listDeleted())
  ipcMain.handle('meetings:restore', (_e, id: number) => meetings.restore(id))
  ipcMain.handle('meetings:deleteForever', async (_e, id: number) => {
    const m = meetings.get(id)
    if (!m) return true
    if (!(await confirmDialog(`Permanently delete “${m.title}”?`, 'Notes, transcript and audio are erased. This cannot be undone.', 'Delete Forever'))) {
      return false
    }
    await eraseMeeting(m)
    return true
  })
  ipcMain.handle('meetings:emptyTrash', async () => {
    const deleted = meetings.listDeleted()
    if (deleted.length === 0) return true
    if (!(await confirmDialog(`Permanently delete ${deleted.length} meeting${deleted.length > 1 ? 's' : ''}?`, 'Everything in Recently Deleted is erased. This cannot be undone.', 'Delete Forever'))) {
      return false
    }
    for (const m of deleted) await eraseMeeting(m)
    return true
  })
  ipcMain.handle('meetings:search', (_e, query: string) => meetings.search(query))

  ipcMain.handle('audio:peaks', (_e, meetingId: number, channel: Channel) => {
    const m = meetings.get(meetingId)
    if (!m?.audio_dir) return []
    return getPeaks(m.audio_dir, channel)
  })

  ipcMain.handle('recording:start', (_e, meetingId: number) => {
    const dir = startSession(meetingId, settings.get('live_transcript', '1') === '1')
    meetings.update(meetingId, { status: 'recording', audio_dir: dir })
    setRecordingIndicators(true)
    return dir
  })

  ipcMain.on('recording:append', (_e, channel: Channel, data: ArrayBuffer) => {
    appendAudio(channel, data)
  })

  ipcMain.handle('recording:pause', (_e, paused: boolean) => setPaused(paused))

  ipcMain.handle('recording:stop', async () => {
    const result = stopSession()
    setRecordingIndicators(false)
    if (!result) return null
    const { meetingId, dir, durationSec, channels } = result
    meetings.update(meetingId, {
      duration_sec: durationSec,
      status: 'transcribing',
      channels: JSON.stringify(channels)
    })
    notifyMeetingUpdated(meetingId)
    runTranscription(meetingId, dir, channels)
    return meetings.get(meetingId)
  })

  ipcMain.handle('transcribe:retry', async (_e, meetingId: number) => {
    const m = meetings.get(meetingId)
    if (!m?.audio_dir) return
    const channels = JSON.parse(m.channels) as Channel[]
    if (m.audio_format === 'm4a') {
      for (const ch of channels) await decodeToWav(m.audio_dir, ch)
    }
    meetings.update(meetingId, { status: 'transcribing', error_msg: null })
    notifyMeetingUpdated(meetingId)
    runTranscription(meetingId, m.audio_dir, channels)
  })

  ipcMain.handle('import:vtt', async () => {
    // MEETERZ_IMPORT_FILE bypasses the native dialog (E2E tests).
    let file = process.env.MEETERZ_IMPORT_FILE
    if (!file) {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow!, {
        title: 'Import Teams transcript',
        filters: [{ name: 'Transcript', extensions: ['vtt'] }],
        properties: ['openFile']
      })
      if (canceled || filePaths.length === 0) return null
      file = filePaths[0]
    }
    const parsed = await parseVttFile(file)
    const meeting = meetings.create(parsed.title, null, 'import')
    meetings.update(meeting.id, {
      transcript: JSON.stringify(parsed.segments),
      duration_sec: parsed.durationSec,
      status: 'ready'
    })
    return meetings.get(meeting.id)
  })

  ipcMain.handle('export:markdown', async (_e, meetingId: number) => {
    const m = meetings.get(meetingId)
    if (!m) return false
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: `${m.title.replace(/[/\\:]/g, '-')}.md`
    })
    if (canceled || !filePath) return false
    const { writeFile } = await import('fs/promises')
    await writeFile(filePath, meetingToMarkdown(m))
    return true
  })

  ipcMain.handle('export:pdf', async (_e, meetingId: number) => {
    const m = meetings.get(meetingId)
    if (!m) return false
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: `${m.title.replace(/[/\\:]/g, '-')}.pdf`
    })
    if (canceled || !filePath) return false
    await exportPdf(m, filePath)
    return true
  })

  ipcMain.handle('export:copyMarkdown', (_e, meetingId: number) => {
    const m = meetings.get(meetingId)
    if (!m) return false
    clipboard.writeText(meetingToMarkdown(m))
    return true
  })

  ipcMain.handle('models:list', () => ({
    whisperInstalled: whisperInstalled(),
    models: modelStatuses()
  }))
  ipcMain.handle('models:download', (_e, file: string) =>
    downloadModel(file, (f, p) => send('models:progress', { file: f, progress: p }))
  )
  ipcMain.handle('models:setActive', (_e, file: string) => setActiveModel(file))
  ipcMain.handle('settings:get', (_e, key: string, fallback: string) =>
    settings.get(key, fallback)
  )
  ipcMain.handle('settings:set', (_e, key: string, value: string) => {
    settings.set(key, value)
    if (key === 'theme') applyTheme(value)
  })
}

function rebuildTrayMenu(): void {
  if (!tray) return
  const recording = isRecording()
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: recording ? 'Stop Recording' : 'Start Recording',
        click: () => {
          mainWindow?.show()
          send('command:toggle-record', null)
        }
      },
      { type: 'separator' },
      { label: 'Open Meeterz', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: 'Quit', role: 'quit' }
    ])
  )
  tray.setToolTip(recording ? 'Meeterz — recording' : 'Meeterz')
}

function setupTrayAndShortcut(): void {
  // Monochrome template glyph: macOS recolors it for light/dark menu bars.
  const trayIcon = nativeImage.createEmpty()
  trayIcon.addRepresentation({ scaleFactor: 1, buffer: readFileSync(trayGlyph) })
  trayIcon.addRepresentation({ scaleFactor: 2, buffer: readFileSync(trayGlyph2x) })
  trayIcon.setTemplateImage(true)
  tray = new Tray(trayIcon)
  rebuildTrayMenu()

  globalShortcut.register('Alt+Command+R', () => {
    mainWindow?.show()
    send('command:toggle-record', null)
  })
}

function applyTheme(theme: string): void {
  nativeTheme.themeSource = theme === 'light' || theme === 'dark' ? theme : 'system'
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.meeterz.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDb(process.env.MEETERZ_DB)
  applyTheme(settings.get('theme', 'system'))
  setupAudioCapture()
  setupAudioProtocol()
  registerIpc()
  setLiveListener((meetingId, segments) => send('live:segments', { meetingId, segments }))
  createWindow()
  setupTrayAndShortcut()
  recoverStuckRecordings(runTranscription)
  purgeExpiredTrash()
  migrateWavMeetings()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
