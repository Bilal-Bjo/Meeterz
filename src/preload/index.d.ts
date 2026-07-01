import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: import('../renderer/src/types').MeeterzApi
  }
}
