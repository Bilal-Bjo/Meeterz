import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  session,
  systemPreferences,
  net,
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
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDb, folders, meetings, settings } from './db'
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
  protocol.handle('meeterz-audio', (request) => {
    const url = new URL(request.url)
    const rel = decodeURIComponent(url.pathname).replace(/^\//, '')
    if (rel.includes('..')) return new Response('forbidden', { status: 403 })
    const file = join(recordingsRoot(), rel)
    return net.fetch(pathToFileURL(file).toString())
  })
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
  ipcMain.handle('meetings:remove', async (_e, id: number) => {
    const m = meetings.get(id)
    if (!m) return true
    const { response } = await dialog.showMessageBox(mainWindow!, {
      type: 'warning',
      buttons: ['Delete Meeting', 'Cancel'],
      defaultId: 1,
      message: `Delete “${m.title}”?`,
      detail: 'Notes and transcript are removed. Audio is moved to the Trash.'
    })
    if (response !== 0) return false
    if (m.audio_dir) await shell.trashItem(m.audio_dir).catch(() => {})
    meetings.remove(id)
    return true
  })
  ipcMain.handle('meetings:search', (_e, query: string) => meetings.search(query))

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
  const trayIcon = nativeImage.createFromPath(icon).resize({ width: 18, height: 18 })
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
