import { useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'

interface NotesEditorProps {
  meetingId: number
  initialHtml: string
  onChange: (html: string) => void
}

const TEMPLATES: { name: string; html: string }[] = [
  {
    name: '1:1',
    html: '<h2>Check-in</h2><p></p><h2>Topics</h2><ul><li></li></ul><h2>Action items</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"></li></ul>'
  },
  {
    name: 'Standup',
    html: '<h2>Yesterday</h2><ul><li></li></ul><h2>Today</h2><ul><li></li></ul><h2>Blockers</h2><ul><li></li></ul>'
  },
  {
    name: 'Client call',
    html: '<h2>Goals</h2><ul><li></li></ul><h2>Discussion</h2><p></p><h2>Decisions</h2><ul><li></li></ul><h2>Next steps</h2><ul data-type="taskList"><li data-type="taskItem" data-checked="false"></li></ul>'
  }
]

export function NotesEditor({ meetingId, initialHtml, onChange }: NotesEditorProps): JSX.Element {
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(null)

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({ placeholder: 'Type your notes…' })
      ],
      content: initialHtml || '',
      onUpdate: ({ editor: e }) => {
        if (saveTimer.current) clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => onChange(e.getHTML()), 500)
      }
    },
    [meetingId]
  )

  // Flush the pending save when unmounting / switching meetings.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [meetingId])

  const isEmpty = editor?.isEmpty ?? true

  return (
    <div className="notes-wrap">
      {isEmpty && (
        <div className="template-row">
          {TEMPLATES.map((t) => (
            <button
              key={t.name}
              className="template-pill"
              onClick={() => {
                editor?.commands.setContent(t.html)
                onChange(t.html)
                editor?.commands.focus('start')
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      <EditorContent editor={editor} className="notes-editor" />
    </div>
  )
}
