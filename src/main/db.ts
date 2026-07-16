import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

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
  speaker?: string // diarized label ("Speaker 1") or imported name ("Jan Peeters")
  lang?: string // detected language code for the window this segment came from
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
  error_msg: string | null
  audio_format: 'wav' | 'm4a'
  origin: 'recording' | 'import'
  deleted_at: number | null
}

export interface SearchHit {
  id: number
  snippet: string
}

let db: Database.Database

function migrate(): void {
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
      channels TEXT NOT NULL DEFAULT '[]',
      error_msg TEXT,
      audio_format TEXT NOT NULL DEFAULT 'wav',
      origin TEXT NOT NULL DEFAULT 'recording'
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS meetings_fts USING fts5(
      title, notes, transcript
    );
  `)
  // Earlier builds created meetings_fts as contentless (content=''), which
  // cannot be updated — rebuild it as a regular FTS table.
  const ftsSql = (
    db.prepare("SELECT sql FROM sqlite_master WHERE name = 'meetings_fts'").get() as
      { sql: string } | undefined
  )?.sql
  if (ftsSql?.includes("content=''")) {
    db.exec('DROP TABLE meetings_fts;')
    db.exec('CREATE VIRTUAL TABLE meetings_fts USING fts5(title, notes, transcript);')
  }
  for (const col of [
    `channels TEXT NOT NULL DEFAULT '[]'`,
    `error_msg TEXT`,
    `audio_format TEXT NOT NULL DEFAULT 'wav'`,
    `origin TEXT NOT NULL DEFAULT 'recording'`,
    `deleted_at INTEGER`
  ]) {
    try {
      db.exec(`ALTER TABLE meetings ADD COLUMN ${col}`)
    } catch {
      /* column already exists */
    }
  }
}

function transcriptPlain(transcript: string | null): string {
  if (!transcript) return ''
  try {
    return (JSON.parse(transcript) as TranscriptSegment[]).map((s) => s.text).join(' ')
  } catch {
    return ''
  }
}

function notesPlain(notes: string): string {
  // Notes are Tiptap HTML; strip tags for indexing.
  return notes
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function reindex(id: number): void {
  const m = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as Meeting | undefined
  db.prepare('DELETE FROM meetings_fts WHERE rowid = ?').run(id)
  if (m) {
    db.prepare(
      'INSERT INTO meetings_fts (rowid, title, notes, transcript) VALUES (?, ?, ?, ?)'
    ).run(id, m.title, notesPlain(m.notes), transcriptPlain(m.transcript))
  }
}

export function initDb(dbPath?: string): void {
  db = new Database(dbPath ?? join(app.getPath('userData'), 'meeterz.db'))
  db.pragma('journal_mode = WAL')
  migrate()
  // Index any meetings the FTS table doesn't know about yet.
  const missing = db
    .prepare('SELECT id FROM meetings WHERE id NOT IN (SELECT rowid FROM meetings_fts)')
    .all() as { id: number }[]
  for (const { id } of missing) reindex(id)
}

export const settings = {
  get(key: string, fallback: string): string {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      { value: string } | undefined
    return row?.value ?? fallback
  },
  set(key: string, value: string): void {
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(key, value)
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
  get(id: number): Folder | undefined {
    return db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as Folder | undefined
  },
  restore(folder: Folder, meetingIds: number[]): void {
    const restoreFolder = db.transaction(() => {
      db.prepare('INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)').run(
        folder.id,
        folder.name,
        folder.created_at
      )
      const move = db.prepare('UPDATE meetings SET folder_id = ? WHERE id = ?')
      for (const meetingId of meetingIds) move.run(folder.id, meetingId)
    })
    restoreFolder()
  },
  remove(id: number): void {
    db.prepare('DELETE FROM folders WHERE id = ?').run(id)
  }
}

export const meetings = {
  idsInFolder(folderId: number): number[] {
    return (
      db.prepare('SELECT id FROM meetings WHERE folder_id = ?').all(folderId) as { id: number }[]
    ).map(({ id }) => id)
  },
  list(): Meeting[] {
    return db
      .prepare('SELECT * FROM meetings WHERE deleted_at IS NULL ORDER BY created_at DESC')
      .all() as Meeting[]
  },
  listDeleted(): Meeting[] {
    return db
      .prepare('SELECT * FROM meetings WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
      .all() as Meeting[]
  },
  softDelete(id: number): void {
    db.prepare('UPDATE meetings SET deleted_at = ? WHERE id = ?').run(Date.now(), id)
  },
  restore(id: number): void {
    db.prepare('UPDATE meetings SET deleted_at = NULL WHERE id = ?').run(id)
  },
  expired(maxAgeMs: number): Meeting[] {
    return db
      .prepare('SELECT * FROM meetings WHERE deleted_at IS NOT NULL AND deleted_at < ?')
      .all(Date.now() - maxAgeMs) as Meeting[]
  },
  get(id: number): Meeting | undefined {
    return db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as Meeting | undefined
  },
  create(
    title: string,
    folderId: number | null,
    origin: 'recording' | 'import' = 'recording'
  ): Meeting {
    const info = db
      .prepare('INSERT INTO meetings (title, folder_id, created_at, origin) VALUES (?, ?, ?, ?)')
      .run(title, folderId, Date.now(), origin)
    const id = info.lastInsertRowid as number
    reindex(id)
    return this.get(id)!
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
      'channels',
      'error_msg',
      'audio_format'
    ]
    const keys = Object.keys(fields).filter((k) => allowed.includes(k))
    if (keys.length === 0) return
    const setSql = keys.map((k) => `${k} = ?`).join(', ')
    db.prepare(`UPDATE meetings SET ${setSql} WHERE id = ?`).run(
      ...keys.map((k) => fields[k as keyof Meeting]),
      id
    )
    if (keys.some((k) => ['title', 'notes', 'transcript'].includes(k))) reindex(id)
  },
  remove(id: number): void {
    db.prepare('DELETE FROM meetings WHERE id = ?').run(id)
    db.prepare('DELETE FROM meetings_fts WHERE rowid = ?').run(id)
  },
  stuckRecordings(): Meeting[] {
    return db.prepare("SELECT * FROM meetings WHERE status = 'recording'").all() as Meeting[]
  },
  search(query: string): SearchHit[] {
    const q = query
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => `"${t}"*`)
      .join(' ')
    if (!q) return []
    return db
      .prepare(
        `SELECT rowid AS id,
                snippet(meetings_fts, -1, '', '', ' … ', 12) AS snippet
         FROM meetings_fts WHERE meetings_fts MATCH ? ORDER BY rank LIMIT 50`
      )
      .all(q) as SearchHit[]
  }
}
