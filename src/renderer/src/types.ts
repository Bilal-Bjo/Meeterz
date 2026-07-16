export interface Folder {
  id: number
  name: string
  created_at: number
}

export interface TranscriptSegment {
  source: 'mic' | 'system' | 'import'
  start: number
  end: number
  text: string
  speaker?: string
  lang?: string
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
  summary: string | null
  audio_dir: string | null
  channels: string
  error_msg: string | null
  audio_format: 'wav' | 'm4a'
  origin: 'recording' | 'import'
  deleted_at: number | null
}

export interface SearchHit {
  id: number
  snippet: string
}

export interface MeetingContextAction {
  meetingId: number
  action:
    | 'open'
    | 'rename'
    | 'move'
    | 'export-markdown'
    | 'export-pdf'
    | 'copy-markdown'
    | 'delete'
    | 'restore'
    | 'delete-forever'
  folderId?: number | null
}

export interface ModelStatus {
  file: string
  label: string
  sizeMb: number
  installed: boolean
  active: boolean
  downloading: boolean
  progress: number
}

export interface MeetingSummaryItem {
  text: string
  timestamp: number | null
}

export interface MeetingSummary {
  overview: string
  keyPoints: MeetingSummaryItem[]
  decisions: MeetingSummaryItem[]
  actionItems: Array<MeetingSummaryItem & { owner: string | null; due: string | null }>
}

export interface MeeterzApi {
  folders: {
    list: () => Promise<Folder[]>
    create: (name: string) => Promise<Folder>
    rename: (id: number, name: string) => Promise<void>
    remove: (id: number) => Promise<boolean>
  }
  meetings: {
    list: () => Promise<Meeting[]>
    get: (id: number) => Promise<Meeting | undefined>
    create: (title: string, folderId: number | null) => Promise<Meeting>
    update: (id: number, fields: Partial<Meeting>) => Promise<Meeting>
    remove: (id: number) => Promise<boolean>
    listDeleted: () => Promise<Meeting[]>
    restore: (id: number) => Promise<void>
    deleteForever: (id: number) => Promise<boolean>
    emptyTrash: () => Promise<boolean>
    search: (query: string) => Promise<SearchHit[]>
    showContextMenu: (id: number) => void
  }
  recording: {
    start: (meetingId: number) => Promise<string>
    append: (channel: 'mic' | 'system', data: ArrayBuffer) => void
    pause: (paused: boolean) => Promise<void>
    stop: () => Promise<Meeting | null>
  }
  transcribe: {
    retry: (meetingId: number) => Promise<void>
  }
  audio: {
    peaks: (meetingId: number, channel: 'mic' | 'system' | 'mixed') => Promise<number[]>
  }
  importVtt: () => Promise<Meeting | null>
  exportMeeting: {
    markdown: (id: number) => Promise<boolean>
    pdf: (id: number) => Promise<boolean>
    copyMarkdown: (id: number) => Promise<boolean>
  }
  models: {
    list: () => Promise<{ whisperInstalled: boolean; models: ModelStatus[] }>
    download: (file: string) => Promise<void>
    setActive: (file: string) => Promise<void>
  }
  settings: {
    get: (key: string, fallback: string) => Promise<string>
    set: (key: string, value: string) => Promise<void>
  }
  summaries: {
    keyStatus: () => Promise<{ configured: boolean }>
    setKey: (key: string) => Promise<void>
    removeKey: () => Promise<void>
    generate: (meetingId: number) => Promise<Meeting>
  }
  permissions: {
    status: () => Promise<{ microphone: string }>
    requestMic: () => Promise<boolean>
    openPane: (pane: 'microphone' | 'audio') => Promise<void>
  }
  onMeetingUpdated: (cb: (meeting: Meeting) => void) => () => void
  onLiveSegments: (
    cb: (payload: { meetingId: number; segments: TranscriptSegment[] }) => void
  ) => () => void
  onToggleRecord: (cb: () => void) => () => void
  onNewMeeting: (cb: () => void) => () => void
  onImportTranscript: (cb: () => void) => () => void
  onOpenSettings: (cb: () => void) => () => void
  onFocusSearch: (cb: () => void) => () => void
  onToggleSidebar: (cb: () => void) => () => void
  onToggleTranscript: (cb: () => void) => () => void
  onMeetingContextAction: (cb: (payload: MeetingContextAction) => void) => () => void
  onRefresh: (cb: () => void) => () => void
  onModelProgress: (cb: (payload: { file: string; progress: number }) => void) => () => void
}

declare global {
  interface Window {
    api: MeeterzApi
  }
}
