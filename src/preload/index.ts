import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

function on(channel: string, cb: (payload: unknown) => void): () => void {
  const listener = (_e: unknown, payload: unknown): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  folders: {
    list: () => ipcRenderer.invoke('folders:list'),
    create: (name: string) => ipcRenderer.invoke('folders:create', name),
    rename: (id: number, name: string) => ipcRenderer.invoke('folders:rename', id, name),
    remove: (id: number) => ipcRenderer.invoke('folders:remove', id)
  },
  meetings: {
    list: () => ipcRenderer.invoke('meetings:list'),
    get: (id: number) => ipcRenderer.invoke('meetings:get', id),
    create: (title: string, folderId: number | null) =>
      ipcRenderer.invoke('meetings:create', title, folderId),
    update: (id: number, fields: object) => ipcRenderer.invoke('meetings:update', id, fields),
    remove: (id: number) => ipcRenderer.invoke('meetings:remove', id),
    listDeleted: () => ipcRenderer.invoke('meetings:listDeleted'),
    restore: (id: number) => ipcRenderer.invoke('meetings:restore', id),
    deleteForever: (id: number) => ipcRenderer.invoke('meetings:deleteForever', id),
    emptyTrash: () => ipcRenderer.invoke('meetings:emptyTrash'),
    search: (query: string) => ipcRenderer.invoke('meetings:search', query)
  },
  recording: {
    start: (meetingId: number) => ipcRenderer.invoke('recording:start', meetingId),
    append: (channel: 'mic' | 'system', data: ArrayBuffer) =>
      ipcRenderer.send('recording:append', channel, data),
    pause: (paused: boolean) => ipcRenderer.invoke('recording:pause', paused),
    stop: () => ipcRenderer.invoke('recording:stop')
  },
  transcribe: {
    retry: (meetingId: number) => ipcRenderer.invoke('transcribe:retry', meetingId)
  },
  importVtt: () => ipcRenderer.invoke('import:vtt'),
  exportMeeting: {
    markdown: (id: number) => ipcRenderer.invoke('export:markdown', id),
    pdf: (id: number) => ipcRenderer.invoke('export:pdf', id),
    copyMarkdown: (id: number) => ipcRenderer.invoke('export:copyMarkdown', id)
  },
  models: {
    list: () => ipcRenderer.invoke('models:list'),
    download: (file: string) => ipcRenderer.invoke('models:download', file),
    setActive: (file: string) => ipcRenderer.invoke('models:setActive', file)
  },
  settings: {
    get: (key: string, fallback: string) => ipcRenderer.invoke('settings:get', key, fallback),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value)
  },
  onMeetingUpdated: (cb: (meeting: unknown) => void) => on('meeting:updated', cb),
  onLiveSegments: (cb: (payload: unknown) => void) => on('live:segments', cb),
  onToggleRecord: (cb: () => void) => on('command:toggle-record', cb),
  onModelProgress: (cb: (payload: unknown) => void) => on('models:progress', cb)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
