export interface Folder {
  id: number
  name: string
  created_at: number
}

export interface TranscriptSegment {
  source: 'mic' | 'system'
  start: number
  end: number
  text: string
}

export type MeetingStatus = 'idle' | 'recording' | 'transcribing' | 'ready' | 'error'

export interface Meeting {
  id: number
  folder_id: number | null
  title: string
  notes: string
  created_at: number
  duration_sec: number
  status: MeetingStatus
  transcript: string | null
  audio_dir: string | null
  channels: string
}

export interface MeeterzApi {
  folders: {
    list: () => Promise<Folder[]>
    create: (name: string) => Promise<Folder>
    rename: (id: number, name: string) => Promise<void>
    remove: (id: number) => Promise<void>
  }
  meetings: {
    list: () => Promise<Meeting[]>
    get: (id: number) => Promise<Meeting | undefined>
    create: (title: string, folderId: number | null) => Promise<Meeting>
    update: (id: number, fields: Partial<Meeting>) => Promise<Meeting>
    remove: (id: number) => Promise<void>
  }
  recording: {
    start: (meetingId: number) => Promise<string>
    append: (channel: 'mic' | 'system', data: ArrayBuffer) => void
    stop: () => Promise<Meeting | null>
  }
  onMeetingUpdated: (cb: (meeting: Meeting) => void) => () => void
}

declare global {
  interface Window {
    api: MeeterzApi
  }
}
