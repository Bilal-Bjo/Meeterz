import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { Folder, Meeting, TranscriptSegment } from './types'
import { MeetingCapture, type CaptureSources } from './lib/capture'
import { defaultMeetingTitle } from './lib/format'
import { Sidebar } from './components/Sidebar'
import { MeetingList } from './components/MeetingList'
import { MeetingDetail } from './components/MeetingDetail'
import { RecordingHUD } from './components/RecordingHUD'
import { SettingsModal } from './components/SettingsModal'
import { IconPanelLeft, IconWave } from './components/Icons'

interface RecordingState {
  meetingId: number
  sources: CaptureSources
  paused: boolean
}

function App(): JSX.Element {
  const [foldersList, setFoldersList] = useState<Folder[]>([])
  const [meetingsList, setMeetingsList] = useState<Meeting[]>([])
  const [deletedList, setDeletedList] = useState<Meeting[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<number | 'all' | 'trash'>('all')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    localStorage.getItem('meeterz.sidebarCollapsed') === '1'
  )
  const [railCollapsed, setRailCollapsed] = useState(
    localStorage.getItem('meeterz.railCollapsed') === '1'
  )
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null)
  const [recording, setRecording] = useState<RecordingState | null>(null)
  const [liveSegments, setLiveSegments] = useState<TranscriptSegment[]>([])
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const captureRef = useRef(new MeetingCapture())
  const recordingRef = useRef<RecordingState | null>(null)
  recordingRef.current = recording

  const showToast = useCallback((text: string, error = false): void => {
    setToast({ text, error })
    setTimeout(() => setToast(null), error ? 6000 : 2500)
  }, [])

  const refresh = useCallback(async () => {
    const [f, m, d] = await Promise.all([
      window.api.folders.list(),
      window.api.meetings.list(),
      window.api.meetings.listDeleted()
    ])
    setFoldersList(f)
    setMeetingsList(m)
    setDeletedList(d)
  }, [])

  const toggleSidebar = (): void => {
    setSidebarCollapsed((v) => {
      localStorage.setItem('meeterz.sidebarCollapsed', v ? '0' : '1')
      return !v
    })
  }

  const toggleRail = (): void => {
    setRailCollapsed((v) => {
      localStorage.setItem('meeterz.railCollapsed', v ? '0' : '1')
      return !v
    })
  }

  useEffect(() => {
    refresh()
    const offUpdated = window.api.onMeetingUpdated((updated) => {
      setMeetingsList((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
    })
    const offLive = window.api.onLiveSegments(({ meetingId, segments }) => {
      if (recordingRef.current?.meetingId === meetingId) setLiveSegments(segments)
    })
    return () => {
      offUpdated()
      offLive()
    }
  }, [refresh])

  const visibleMeetings = useMemo(() => {
    if (selectedFolderId === 'trash') return deletedList
    if (selectedFolderId === 'all') return meetingsList
    return meetingsList.filter((m) => m.folder_id === selectedFolderId)
  }, [meetingsList, deletedList, selectedFolderId])

  const selectedMeeting =
    meetingsList.find((m) => m.id === selectedMeetingId) ??
    deletedList.find((m) => m.id === selectedMeetingId) ??
    null

  const meetingCounts = useMemo(() => {
    const counts = new Map<number | 'all' | 'trash', number>()
    counts.set('all', meetingsList.length)
    for (const m of meetingsList) {
      if (m.folder_id != null) counts.set(m.folder_id, (counts.get(m.folder_id) ?? 0) + 1)
    }
    counts.set('trash', deletedList.length)
    return counts
  }, [meetingsList, deletedList])

  const newMeeting = useCallback(async (): Promise<Meeting> => {
    const folderId = typeof selectedFolderId === 'number' ? selectedFolderId : null
    const meeting = await window.api.meetings.create(defaultMeetingTitle(), folderId)
    await refresh()
    setSelectedMeetingId(meeting.id)
    return meeting
  }, [refresh, selectedFolderId])

  const updateMeeting = async (id: number, fields: Partial<Meeting>): Promise<void> => {
    const updated = await window.api.meetings.update(id, fields)
    setMeetingsList((prev) => prev.map((m) => (m.id === id ? updated : m)))
  }

  const deleteMeeting = async (id: number): Promise<void> => {
    await window.api.meetings.remove(id)
    if (selectedMeetingId === id) setSelectedMeetingId(null)
    await refresh()
    showToast('Moved to Recently Deleted.')
  }

  const restoreMeeting = async (id: number): Promise<void> => {
    await window.api.meetings.restore(id)
    await refresh()
    setSelectedFolderId('all')
    setSelectedMeetingId(id)
    showToast('Meeting restored.')
  }

  const deleteForever = async (id: number): Promise<void> => {
    const done = await window.api.meetings.deleteForever(id)
    if (!done) return
    if (selectedMeetingId === id) setSelectedMeetingId(null)
    await refresh()
  }

  const emptyTrash = async (): Promise<void> => {
    if (await window.api.meetings.emptyTrash()) {
      setSelectedMeetingId(null)
      setSelectedFolderId('all')
      await refresh()
    }
  }

  const startRecording = useCallback(
    async (meetingId: number, sources: CaptureSources): Promise<void> => {
      try {
        await window.api.recording.start(meetingId)
        await captureRef.current.start(sources)
        setLiveSegments([])
        setRecording({ meetingId, sources, paused: false })
        await refresh()
        // Mic sanity check: if the mic is on but dead silent after 3 s, warn.
        if (sources.mic) {
          setTimeout(() => {
            if (recordingRef.current?.meetingId === meetingId) {
              const { mic } = captureRef.current.levels()
              if (mic < 0.005) showToast('Your microphone looks silent — is it muted?', true)
            }
          }, 3000)
        }
      } catch (err) {
        await captureRef.current.stop().catch(() => {})
        await window.api.recording.stop().catch(() => {})
        await refresh()
        showToast(
          `Couldn’t start recording. ${err instanceof Error ? err.message : String(err)}`,
          true
        )
      }
    },
    [refresh, showToast]
  )

  const stopRecording = useCallback(async (): Promise<void> => {
    // Hide the HUD immediately; capture teardown happens behind it.
    setRecording(null)
    setLiveSegments([])
    await captureRef.current.stop()
    await window.api.recording.stop()
    await refresh()
  }, [refresh])

  const togglePause = async (): Promise<void> => {
    if (!recording) return
    const paused = !recording.paused
    await window.api.recording.pause(paused)
    setRecording({ ...recording, paused })
  }

  // Tray menu / ⌥⌘R: toggle recording from anywhere.
  useEffect(() => {
    return window.api.onToggleRecord(async () => {
      if (recordingRef.current) {
        await stopRecording()
      } else {
        const meeting = await newMeeting()
        await startRecording(meeting.id, { system: true, mic: true })
      }
    })
  }, [newMeeting, startRecording, stopRecording])

  const importTranscript = async (): Promise<void> => {
    try {
      const meeting = await window.api.importVtt()
      if (meeting) {
        await refresh()
        setSelectedFolderId('all')
        setSelectedMeetingId(meeting.id)
        showToast('Transcript imported.')
      }
    } catch (err) {
      showToast(`Import failed. ${err instanceof Error ? err.message : String(err)}`, true)
    }
  }

  return (
    <div className="app">
      <button
        className={`panel-toggle left ${sidebarCollapsed ? 'collapsed' : ''}`}
        title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        onClick={toggleSidebar}
      >
        <IconPanelLeft size={16} />
      </button>

      {!sidebarCollapsed && (
      <Sidebar
        folders={foldersList}
        selectedFolderId={selectedFolderId}
        meetingCounts={meetingCounts}
        onSelectFolder={(id) => {
          setSelectedFolderId(id)
          setSelectedMeetingId(null)
        }}
        onCreateFolder={async (name) => {
          await window.api.folders.create(name)
          refresh()
        }}
        onRenameFolder={async (id, name) => {
          await window.api.folders.rename(id, name)
          refresh()
        }}
        onDeleteFolder={async (id) => {
          const deleted = await window.api.folders.remove(id)
          if (deleted && selectedFolderId === id) setSelectedFolderId('all')
          refresh()
        }}
        onDropMeeting={async (meetingId, folderId) => {
          await updateMeeting(meetingId, { folder_id: folderId })
          refresh()
        }}
        onNewMeeting={newMeeting}
        onImport={importTranscript}
        onOpenSettings={() => setSettingsOpen(true)}
        recording={recording !== null}
      />
      )}

      <MeetingList
        meetings={visibleMeetings}
        selectedId={selectedMeetingId}
        onSelect={setSelectedMeetingId}
        isTrash={selectedFolderId === 'trash'}
        onEmptyTrash={emptyTrash}
      />

      {selectedMeeting ? (
        <MeetingDetail
          key={selectedMeeting.id}
          meeting={selectedMeeting}
          folders={foldersList}
          recordingActive={recording !== null}
          liveSegments={recording?.meetingId === selectedMeeting.id ? liveSegments : []}
          onUpdate={(fields) => updateMeeting(selectedMeeting.id, fields)}
          onDelete={() => deleteMeeting(selectedMeeting.id)}
          onRestore={() => restoreMeeting(selectedMeeting.id)}
          onDeleteForever={() => deleteForever(selectedMeeting.id)}
          onStartRecording={(sources) => startRecording(selectedMeeting.id, sources)}
          onToast={showToast}
          railCollapsed={railCollapsed}
          onToggleRail={toggleRail}
        />
      ) : (
        <main className="detail detail-empty">
          <div className="empty-state">
            <div className="empty-icon">
              <IconWave size={26} />
            </div>
            <h2>No meeting selected</h2>
            <p>Choose a meeting from the list, or start a new one.</p>
            <button className="record-btn" onClick={newMeeting} disabled={recording !== null}>
              New Meeting
            </button>
          </div>
        </main>
      )}

      {recording && (
        <RecordingHUD
          capture={captureRef.current}
          sources={recording.sources}
          paused={recording.paused}
          onTogglePause={togglePause}
          onStop={stopRecording}
        />
      )}

      {toast && (
        <div className={`toast ${toast.error ? 'error' : ''}`} onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

export default App
