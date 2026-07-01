import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

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

export interface Meeting {
  id: number
  folder_id: number | null
  title: string
  notes: string
  created_at: number
  duration_sec: number
  status: 'idle' | 'recording' | 'transcribing' | 'ready' | 'error'
  transcript: string | null
  audio_dir: string | null
  channels: string
}

let db: Database.Database

export function initDb(dbPath?: string): void {
  db = new Database(dbPath ?? join(app.getPath('userData'), 'meeterz.db'))
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      duration_sec REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'idle',
      transcript TEXT,
      audio_dir TEXT,
      channels TEXT NOT NULL DEFAULT '[]'
    );
  `)
  // Migration for databases created before the channels column existed.
  try {
    db.exec(`ALTER TABLE meetings ADD COLUMN channels TEXT NOT NULL DEFAULT '[]'`)
  } catch {
    /* column already exists */
  }
}

export const folders = {
  list(): Folder[] {
    return db.prepare('SELECT * FROM folders ORDER BY name COLLATE NOCASE').all() as Folder[]
  },
  create(name: string): Folder {
    const info = db
      .prepare('INSERT INTO folders (name, created_at) VALUES (?, ?)')
      .run(name, Date.now())
    return db.prepare('SELECT * FROM folders WHERE id = ?').get(info.lastInsertRowid) as Folder
  },
  rename(id: number, name: string): void {
    db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, id)
  },
  remove(id: number): void {
    db.prepare('DELETE FROM folders WHERE id = ?').run(id)
  }
}

export const meetings = {
  list(): Meeting[] {
    return db.prepare('SELECT * FROM meetings ORDER BY created_at DESC').all() as Meeting[]
  },
  get(id: number): Meeting | undefined {
    return db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as Meeting | undefined
  },
  create(title: string, folderId: number | null): Meeting {
    const info = db
      .prepare('INSERT INTO meetings (title, folder_id, created_at) VALUES (?, ?, ?)')
      .run(title, folderId, Date.now())
    return this.get(info.lastInsertRowid as number)!
  },
  update(id: number, fields: Partial<Meeting>): void {
    const allowed = [
      'title',
      'notes',
      'folder_id',
      'duration_sec',
      'status',
      'transcript',
      'audio_dir',
      'channels'
    ]
    const keys = Object.keys(fields).filter((k) => allowed.includes(k))
    if (keys.length === 0) return
    const setSql = keys.map((k) => `${k} = ?`).join(', ')
    db.prepare(`UPDATE meetings SET ${setSql} WHERE id = ?`).run(
      ...keys.map((k) => fields[k as keyof Meeting]),
      id
    )
  },
  remove(id: number): void {
    db.prepare('DELETE FROM meetings WHERE id = ?').run(id)
  }
}
