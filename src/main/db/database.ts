import Database from 'better-sqlite3'
import { schemaSql } from './schema'

export type AppDatabase = Database.Database

export function createDatabase(dbPath: string): AppDatabase {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(schemaSql)
  ensureConversationFolderColumn(db)
  ensureDifyConversationIdColumn(db)
  ensureTokenUsageColumn(db)
  ensureSortOrderColumn(db, 'conversation_folders', 'created_at ASC')
  ensureSortOrderColumn(db, 'conversations', 'updated_at DESC')
  return db
}

function ensureConversationFolderColumn(db: AppDatabase): void {
  const columns = db.pragma('table_info(conversations)') as Array<{ name: string }>
  if (columns.some((column) => column.name === 'conversation_folder_id')) return
  db.exec(`ALTER TABLE conversations ADD COLUMN conversation_folder_id TEXT REFERENCES conversation_folders(id) ON DELETE SET NULL`)
}

function ensureDifyConversationIdColumn(db: AppDatabase): void {
  const columns = db.pragma('table_info(conversations)') as Array<{ name: string }>
  if (columns.some((column) => column.name === 'dify_conversation_id')) return
  db.exec(`ALTER TABLE conversations ADD COLUMN dify_conversation_id TEXT`)
}

function ensureTokenUsageColumn(db: AppDatabase): void {
  const columns = db.pragma('table_info(messages)') as Array<{ name: string }>
  if (columns.some((column) => column.name === 'token_usage_json')) return
  db.exec(`ALTER TABLE messages ADD COLUMN token_usage_json TEXT`)
}

function ensureSortOrderColumn(db: AppDatabase, tableName: 'conversation_folders' | 'conversations', orderBy: string): void {
  const columns = db.pragma(`table_info(${tableName})`) as Array<{ name: string }>
  if (!columns.some((column) => column.name === 'sort_order')) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`)
  }

  const rows = db.prepare(`SELECT id FROM ${tableName} ORDER BY ${orderBy}`).all() as Array<{ id: string }>
  const update = db.prepare(`UPDATE ${tableName} SET sort_order = ? WHERE id = ?`)
  const applyOrder = db.transaction((ids: Array<{ id: string }>) => {
    ids.forEach((row, index) => update.run(index, row.id))
  })
  applyOrder(rows)
}
