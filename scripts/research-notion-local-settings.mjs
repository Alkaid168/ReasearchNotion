import fs from 'node:fs'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'

export function appDataDir() {
  if (process.env.APPDATA) return process.env.APPDATA
  return path.join(os.homedir(), 'AppData', 'Roaming')
}

export function defaultUserDataDir() {
  return path.join(appDataDir(), 'research-notion')
}

export function databasePathCandidates() {
  const candidates = []
  if (process.env.RESEARCH_NOTION_DB_PATH) {
    candidates.push(path.resolve(process.env.RESEARCH_NOTION_DB_PATH))
  }
  if (process.env.RESEARCH_NOTION_USER_DATA_DIR) {
    candidates.push(path.join(path.resolve(process.env.RESEARCH_NOTION_USER_DATA_DIR), 'research-notion.sqlite'))
  }
  candidates.push(path.join(appDataDir(), 'research-notion', 'research-notion.sqlite'))
  candidates.push(path.join(appDataDir(), 'ResearchNotion', 'research-notion.sqlite'))
  return Array.from(new Set(candidates))
}

export function preferredDatabasePath() {
  return databasePathCandidates()[0]
}

export function preferredUserDataDir() {
  return path.dirname(preferredDatabasePath())
}

export function ensureResearchNotionSchema(db) {
  db.exec(`
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  dify_dataset_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(parent_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  title TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK(file_type IN ('pdf', 'markdown')),
  file_path TEXT NOT NULL,
  dify_document_id TEXT,
  index_status TEXT NOT NULL CHECK(index_status IN ('local-only', 'indexing', 'indexed', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS paper_cards (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL UNIQUE,
  authors TEXT NOT NULL,
  year TEXT NOT NULL,
  one_sentence_summary TEXT NOT NULL,
  research_problem TEXT NOT NULL,
  method_summary TEXT NOT NULL,
  contributions_json TEXT NOT NULL,
  keywords_json TEXT NOT NULL,
  reading_status TEXT NOT NULL CHECK(reading_status IN ('unread', 'reading', 'finished')),
  updated_at TEXT NOT NULL,
  FOREIGN KEY(paper_id) REFERENCES papers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversation_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  folder_id TEXT,
  conversation_folder_id TEXT,
  context_json TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE SET NULL,
  FOREIGN KEY(conversation_folder_id) REFERENCES conversation_folders(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  citations_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`)
}

export function sealPlain(value) {
  return value ? `plain:${Buffer.from(value, 'utf8').toString('base64')}` : ''
}

export function unsealScriptReadable(value) {
  if (!value) return { value: '', encrypted: false }
  if (value.startsWith('plain:')) {
    return { value: Buffer.from(value.slice(6), 'base64').toString('utf8'), encrypted: false }
  }
  if (value.startsWith('safe:')) {
    return { value: '', encrypted: true }
  }
  return { value, encrypted: false }
}

export function readLocalSettings() {
  const attemptedPaths = databasePathCandidates()
  for (const dbPath of attemptedPaths) {
    if (!fs.existsSync(dbPath)) continue
    try {
      const db = new Database(dbPath, { readonly: true, fileMustExist: true })
      try {
        const rows = db.prepare(`SELECT key, value FROM settings`).all()
        const raw = Object.fromEntries(rows.map((row) => [row.key, row.value]))
        const appKey = unsealScriptReadable(raw.difyAppApiKey)
        const knowledgeKey = unsealScriptReadable(raw.difyKnowledgeApiKey)
        return {
          dbPath,
          attemptedPaths,
          encryptedKeys: [
            appKey.encrypted ? 'Dify App API Key' : null,
            knowledgeKey.encrypted ? 'Dify Knowledge API Key' : null
          ].filter(Boolean),
          settings: {
            baseUrl: raw.difyBaseUrl || '',
            appApiKey: appKey.value,
            knowledgeApiKey: knowledgeKey.value
          }
        }
      } finally {
        db.close()
      }
    } catch {
      continue
    }
  }

  return {
    dbPath: null,
    attemptedPaths,
    encryptedKeys: [],
    settings: { baseUrl: '', appApiKey: '', knowledgeApiKey: '' }
  }
}

export function writeLocalSettings({ baseUrl, appToken, datasetToken = '', datasetName = '', datasetId = '' }) {
  const dbPath = preferredDatabasePath()
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  try {
    ensureResearchNotionSchema(db)
    const setting = db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    setting.run('difyBaseUrl', baseUrl)
    setting.run('difyAppApiKey', sealPlain(appToken))
    setting.run('difyKnowledgeApiKey', sealPlain(datasetToken))

    if (!datasetId || !datasetName) return dbPath

    const folderId =
      db
        .prepare(`SELECT id FROM folders WHERE dify_dataset_id = ? OR name = ? LIMIT 1`)
        .get(datasetId, datasetName)?.id || `folder_${cryptoRandomId()}`
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO folders (id, name, parent_id, dify_dataset_id, created_at, updated_at)
       VALUES (?, ?, null, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, dify_dataset_id = excluded.dify_dataset_id, updated_at = excluded.updated_at`
    ).run(folderId, datasetName, datasetId, now, now)
  } finally {
    db.close()
  }
  return dbPath
}

function cryptoRandomId() {
  return crypto.randomUUID()
}
