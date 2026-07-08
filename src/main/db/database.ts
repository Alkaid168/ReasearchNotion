import Database from 'better-sqlite3'
import { schemaSql } from './schema'

export type AppDatabase = Database.Database

export function createDatabase(dbPath: string): AppDatabase {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(schemaSql)
  return db
}
