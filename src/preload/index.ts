import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

export interface MeeterzApi {
  folders: {
    list: () => Promise<unknown[]>
    create: (name: string) => Promise<unknown>
    rename: (id: number, name: string) => Promise<void>
    remove: (id: number) => Promise<void>
  }
  meetings: {
    list: () => Promise<unknown[]>
    get: (id: number) => Promise<unknown>
    create: (title: string, folderId: number | null) => Promise<unknown>
    update: (id: number, fields: object) => Promise<unknown>
    remove: (id: number) => Promise<void>
  }
  recording: {
    start: (meetingId: number) => Promise<string>
    append: (channel: 'mic' | 'system', data: ArrayBuffer) => void
    stop: () => Promise<unknown>
  }
  onMeetingUpdated: (cb: (meeting: unknown) => void) => () => void
}

const api: MeeterzApi = {
  folders: {
    list: () => ipcRenderer.invoke('folders:list'),
    create: (name) => ipcRenderer.invoke('folders:create', name),
    rename: (id, name) => ipcRenderer.invoke('folders:rename', id, name),
    remove: (id) => ipcRenderer.invoke('folders:remove', id)
  },
  meetings: {
    list: () => ipcRenderer.invoke('meetings:list'),
    get: (id) => ipcRenderer.invoke('meetings:get', id),
    create: (title, folderId) => ipcRenderer.invoke('meetings:create', title, folderId),
    update: (id, fields) => ipcRenderer.invoke('meetings:update', id, fields),
    remove: (id) => ipcRenderer.invoke('meetings:remove', id)
  },
  recording: {
    start: (meetingId) => ipcRenderer.invoke('recording:start', meetingId),
    append: (channel, data) => ipcRenderer.send('recording:append', channel, data),
    stop: () => ipcRenderer.invoke('recording:stop')
  },
  onMeetingUpdated: (cb) => {
    const listener = (_e: unknown, meeting: unknown): void => cb(meeting)
    ipcRenderer.on('meeting:updated', listener)
    return () => ipcRenderer.removeListener('meeting:updated', listener)
  }
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
