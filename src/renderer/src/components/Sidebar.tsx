import { useState } from 'react'
import type { JSX } from 'react'
import type { Folder } from '../types'
import { IconFolder, IconPlus, IconTray, IconWave, IconTrash } from './Icons'

interface SidebarProps {
  folders: Folder[]
  selectedFolderId: number | 'all'
  meetingCounts: Map<number | 'all', number>
  onSelectFolder: (id: number | 'all') => void
  onCreateFolder: (name: string) => void
  onDeleteFolder: (id: number) => void
  onNewMeeting: () => void
  recording: boolean
}

export function Sidebar({
  folders,
  selectedFolderId,
  meetingCounts,
  onSelectFolder,
  onCreateFolder,
  onDeleteFolder,
  onNewMeeting,
  recording
}: SidebarProps): JSX.Element {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const commitDraft = (): void => {
    const name = draft.trim()
    if (name) onCreateFolder(name)
    setDraft('')
    setAdding(false)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-drag" />
      <button className="new-meeting-btn" onClick={onNewMeeting} disabled={recording}>
        <IconWave size={15} />
        New Meeting
      </button>

      <nav className="sidebar-nav">
        <button
          className={`nav-row ${selectedFolderId === 'all' ? 'selected' : ''}`}
          onClick={() => onSelectFolder('all')}
        >
          <IconTray size={15} />
          <span>All Meetings</span>
          <span className="nav-count">{meetingCounts.get('all') ?? 0}</span>
        </button>
      </nav>

      <div className="sidebar-section">
        <div className="section-header">
          <span>Folders</span>
          <button className="icon-btn" title="New folder" onClick={() => setAdding(true)}>
            <IconPlus size={13} />
          </button>
        </div>
        {folders.map((f) => (
          <div key={f.id} className={`nav-row-wrap ${selectedFolderId === f.id ? 'selected' : ''}`}>
            <button className="nav-row" onClick={() => onSelectFolder(f.id)}>
              <IconFolder size={15} />
              <span className="nav-label">{f.name}</span>
              <span className="nav-count">{meetingCounts.get(f.id) ?? 0}</span>
            </button>
            <button
              className="icon-btn row-action"
              title={`Delete folder “${f.name}”`}
              onClick={() => onDeleteFolder(f.id)}
            >
              <IconTrash size={13} />
            </button>
          </div>
        ))}
        {adding && (
          <input
            className="folder-input"
            autoFocus
            placeholder="Folder name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitDraft()
              if (e.key === 'Escape') {
                setDraft('')
                setAdding(false)
              }
            }}
          />
        )}
      </div>
    </aside>
  )
}
