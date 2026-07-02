import { useState } from 'react'
import type { JSX } from 'react'
import type { Folder } from '../types'
import { IconFolder, IconGear, IconImport, IconPlus, IconTray, IconTrash, IconWave } from './Icons'

interface SidebarProps {
  folders: Folder[]
  selectedFolderId: number | 'all' | 'trash'
  meetingCounts: Map<number | 'all' | 'trash', number>
  onSelectFolder: (id: number | 'all' | 'trash') => void
  onCreateFolder: (name: string) => void
  onRenameFolder: (id: number, name: string) => void
  onDeleteFolder: (id: number) => void
  onDropMeeting: (meetingId: number, folderId: number | null) => void
  onNewMeeting: () => void
  onImport: () => void
  onOpenSettings: () => void
  recording: boolean
}

export function Sidebar({
  folders,
  selectedFolderId,
  meetingCounts,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onDropMeeting,
  onNewMeeting,
  onImport,
  onOpenSettings,
  recording
}: SidebarProps): JSX.Element {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [dropTarget, setDropTarget] = useState<number | 'all' | null>(null)

  const commitDraft = (): void => {
    const name = draft.trim()
    if (name) onCreateFolder(name)
    setDraft('')
    setAdding(false)
  }

  const commitRename = (): void => {
    const name = renameDraft.trim()
    if (renamingId !== null && name) onRenameFolder(renamingId, name)
    setRenamingId(null)
  }

  const dragProps = (target: number | 'all'): Record<string, unknown> => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      setDropTarget(target)
    },
    onDragLeave: () => setDropTarget(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setDropTarget(null)
      const id = Number(e.dataTransfer.getData('meeterz/meeting-id'))
      if (id) onDropMeeting(id, target === 'all' ? null : target)
    }
  })

  return (
    <aside className="sidebar">
      <button className="new-meeting-btn" onClick={onNewMeeting} disabled={recording}>
        <IconWave size={15} />
        New Meeting
      </button>

      <nav className="sidebar-nav">
        <button
          className={`nav-row ${selectedFolderId === 'all' ? 'selected' : ''} ${dropTarget === 'all' ? 'drop-target' : ''}`}
          onClick={() => onSelectFolder('all')}
          {...dragProps('all')}
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
        {folders.map((f) =>
          renamingId === f.id ? (
            <input
              key={f.id}
              className="folder-input"
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setRenamingId(null)
              }}
            />
          ) : (
            <div
              key={f.id}
              className={`nav-row-wrap ${selectedFolderId === f.id ? 'selected' : ''} ${dropTarget === f.id ? 'drop-target' : ''}`}
            >
              <button
                className="nav-row"
                onClick={() => onSelectFolder(f.id)}
                onDoubleClick={() => {
                  setRenamingId(f.id)
                  setRenameDraft(f.name)
                }}
                title="Double-click to rename"
                {...dragProps(f.id)}
              >
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
          )
        )}
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

      <div className="sidebar-footer">
        {(meetingCounts.get('trash') ?? 0) > 0 && (
          <button
            className={`nav-row ${selectedFolderId === 'trash' ? 'selected' : ''}`}
            onClick={() => onSelectFolder('trash')}
          >
            <IconTrash size={15} />
            <span>Recently Deleted</span>
            <span className="nav-count">{meetingCounts.get('trash')}</span>
          </button>
        )}
        <button className="nav-row" onClick={onImport} title="Import a Teams .vtt transcript">
          <IconImport size={15} />
          <span>Import transcript…</span>
        </button>
        <button className="nav-row" onClick={onOpenSettings}>
          <IconGear size={15} />
          <span>Settings</span>
        </button>
      </div>
    </aside>
  )
}
