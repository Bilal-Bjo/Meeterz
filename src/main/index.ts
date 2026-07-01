import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  session,
  systemPreferences,
  net,
  protocol
} from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initDb, folders, meetings } from './db'
import { startSession, appendAudio, stopSession, recordingsRoot, type Channel } from './recording'
import { transcribeMeeting } from './transcribe'

let mainWindow: BrowserWindow | null = null

// Test isolation: point userData (db + recordings) at a scratch directory.
if (process.env.MEETERZ_USERDATA) {
  app.setPath('userData', process.env.MEETERZ_USERDATA)
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'meeterz-audio', privileges: { stream: true, supportFetchAPI: true } }
])

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
  // Serves recorded WAVs to the renderer: meeterz-audio://recordings/<id>/<channel>.wav
  protocol.handle('meeterz-audio', (request) => {
    const url = new URL(request.url)
    const rel = decodeURIComponent(url.pathname).replace(/^\//, '')
    if (rel.includes('..')) return new Response('forbidden', { status: 403 })
    const file = join(recordingsRoot(), rel)
    return net.fetch(pathToFileURL(file).toString())
  })
}

function registerIpc(): void {
  ipcMain.handle('folders:list', () => folders.list())
  ipcMain.handle('folders:create', (_e, name: string) => folders.create(name))
  ipcMain.handle('folders:rename', (_e, id: number, name: string) => folders.rename(id, name))
  ipcMain.handle('folders:remove', (_e, id: number) => folders.remove(id))

  ipcMain.handle('meetings:list', () => meetings.list())
  ipcMain.handle('meetings:get', (_e, id: number) => meetings.get(id))
  ipcMain.handle('meetings:create', (_e, title: string, folderId: number | null) =>
    meetings.create(title, folderId)
  )
  ipcMain.handle('meetings:update', (_e, id: number, fields: object) => {
    meetings.update(id, fields)
    return meetings.get(id)
  })
  ipcMain.handle('meetings:remove', (_e, id: number) => meetings.remove(id))

  ipcMain.handle('recording:start', (_e, meetingId: number) => {
    const dir = startSession(meetingId)
    meetings.update(meetingId, { status: 'recording', audio_dir: dir })
    return dir
  })

  ipcMain.on('recording:append', (_e, channel: Channel, data: ArrayBuffer) => {
    appendAudio(channel, data)
  })

  ipcMain.handle('recording:stop', async () => {
    const result = stopSession()
    if (!result) return null
    const { meetingId, dir, durationSec, channels } = result
    meetings.update(meetingId, {
      duration_sec: durationSec,
      status: 'transcribing',
      channels: JSON.stringify(channels)
    })
    notifyMeetingUpdated(meetingId)

    transcribeMeeting(dir, channels)
      .then((segments) => {
        meetings.update(meetingId, { transcript: JSON.stringify(segments), status: 'ready' })
        notifyMeetingUpdated(meetingId)
      })
      .catch((err) => {
        console.error('transcription failed:', err)
        meetings.update(meetingId, { status: 'error' })
        notifyMeetingUpdated(meetingId)
      })

    return meetings.get(meetingId)
  })
}

function notifyMeetingUpdated(meetingId: number): void {
  mainWindow?.webContents.send('meeting:updated', meetings.get(meetingId))
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.meeterz.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDb(process.env.MEETERZ_DB)
  setupAudioCapture()
  setupAudioProtocol()
  registerIpc()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
