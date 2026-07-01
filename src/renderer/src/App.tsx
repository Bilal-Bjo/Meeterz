import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'
import type { Folder, Meeting } from './types'
import { MeetingCapture, type CaptureSources } from './lib/capture'
import { defaultMeetingTitle } from './lib/format'
import { Sidebar } from './components/Sidebar'
import { MeetingList } from './components/MeetingList'
import { MeetingDetail } from './components/MeetingDetail'
import { RecordingHUD } from './components/RecordingHUD'
import { IconWave } from './components/Icons'

interface RecordingState {
  meetingId: number
  startedAt: number
  sources: CaptureSources
}

function App(): JSX.Element {
  const [foldersList, setFoldersList] = useState<Folder[]>([])
  const [meetingsList, setMeetingsList] = useState<Meeting[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<number | 'all'>('all')
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null)
  const [recording, setRecording] = useState<RecordingState | null>(null)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const captureRef = useRef(new MeetingCapture())

  const refresh = useCallback(async () => {
    const [f, m] = await Promise.all([window.api.folders.list(), window.api.meetings.list()])
    setFoldersList(f)
    setMeetingsList(m)
  }, [])

  useEffect(() => {
    refresh()
    return window.api.onMeetingUpdated((updated) => {
      setMeetingsList((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
    })
  }, [refresh])

  const visibleMeetings = useMemo(
    () =>
      selectedFolderId === 'all'
        ? meetingsList
        : meetingsList.filter((m) => m.folder_id === selectedFolderId),
    [meetingsList, selectedFolderId]
  )

  const selectedMeeting = meetingsList.find((m) => m.id === selectedMeetingId) ?? null

  const meetingCounts = useMemo(() => {
    const counts = new Map<number | 'all', number>()
    counts.set('all', meetingsList.length)
    for (const m of meetingsList) {
      if (m.folder_id != null) counts.set(m.folder_id, (counts.get(m.folder_id) ?? 0) + 1)
    }
    return counts
  }, [meetingsList])

  const newMeeting = async (): Promise<void> => {
    const folderId = selectedFolderId === 'all' ? null : selectedFolderId
    const meeting = await window.api.meetings.create(defaultMeetingTitle(), folderId)
    await refresh()
    setSelectedMeetingId(meeting.id)
  }

  const updateMeeting = async (id: number, fields: Partial<Meeting>): Promise<void> => {
    const updated = await window.api.meetings.update(id, fields)
    setMeetingsList((prev) => prev.map((m) => (m.id === id ? updated : m)))
  }

  const deleteMeeting = async (id: number): Promise<void> => {
    await window.api.meetings.remove(id)
    if (selectedMeetingId === id) setSelectedMeetingId(null)
    await refresh()
  }

  const startRecording = async (meetingId: number, sources: CaptureSources): Promise<void> => {
    setCaptureError(null)
    try {
      await window.api.recording.start(meetingId)
      await captureRef.current.start(sources)
      setRecording({ meetingId, startedAt: Date.now(), sources })
      await refresh()
    } catch (err) {
      await captureRef.current.stop().catch(() => {})
      await window.api.recording.stop().catch(() => {})
      await refresh()
      setCaptureError(err instanceof Error ? err.message : String(err))
    }
  }

  const stopRecording = async (): Promise<void> => {
    await captureRef.current.stop()
    await window.api.recording.stop()
    setRecording(null)
    await refresh()
  }

  return (
    <div className="app">
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
        onDeleteFolder={async (id) => {
          await window.api.folders.remove(id)
          if (selectedFolderId === id) setSelectedFolderId('all')
          refresh()
        }}
        onNewMeeting={newMeeting}
        recording={recording !== null}
      />

      <MeetingList
        meetings={visibleMeetings}
        selectedId={selectedMeetingId}
        onSelect={setSelectedMeetingId}
      />

      {selectedMeeting ? (
        <MeetingDetail
          key={selectedMeeting.id}
          meeting={selectedMeeting}
          folders={foldersList}
          recordingActive={recording !== null}
          onUpdate={(fields) => updateMeeting(selectedMeeting.id, fields)}
          onDelete={() => deleteMeeting(selectedMeeting.id)}
          onStartRecording={(sources) => startRecording(selectedMeeting.id, sources)}
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
          startedAt={recording.startedAt}
          sources={recording.sources}
          onStop={stopRecording}
        />
      )}

      {captureError && (
        <div className="error-toast" onClick={() => setCaptureError(null)}>
          <strong>Couldn’t start recording.</strong> {captureError}
        </div>
      )}
    </div>
  )
}

export default App
