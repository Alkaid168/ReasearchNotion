import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ensureResearchNotionSchema,
  readLocalSettings,
  sealPlain,
  writeLocalSettings
} from '../../scripts/research-notion-local-settings.mjs'

let tempDir = ''
let originalDbPath
let originalUserDataDir

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'rn-script-settings-'))
  originalDbPath = process.env.RESEARCH_NOTION_DB_PATH
  originalUserDataDir = process.env.RESEARCH_NOTION_USER_DATA_DIR
  process.env.RESEARCH_NOTION_DB_PATH = path.join(tempDir, 'research-notion.sqlite')
  delete process.env.RESEARCH_NOTION_USER_DATA_DIR
})

afterEach(() => {
  if (originalDbPath === undefined) {
    delete process.env.RESEARCH_NOTION_DB_PATH
  } else {
    process.env.RESEARCH_NOTION_DB_PATH = originalDbPath
  }
  if (originalUserDataDir === undefined) {
    delete process.env.RESEARCH_NOTION_USER_DATA_DIR
  } else {
    process.env.RESEARCH_NOTION_USER_DATA_DIR = originalUserDataDir
  }
  rmSync(tempDir, { recursive: true, force: true })
})

describe('research-notion local settings script helper', () => {
  it('writes and reads script-readable Dify settings', () => {
    const dbPath = writeLocalSettings({
      baseUrl: 'http://localhost:8080',
      appToken: 'app-demo',
      datasetToken: 'dataset-demo',
      datasetName: 'ResearchNotion Demo Library',
      datasetId: 'dataset-1'
    })

    const result = readLocalSettings()

    expect(result.dbPath).toBe(dbPath)
    expect(result.encryptedKeys).toEqual([])
    expect(result.settings).toEqual({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'app-demo',
      knowledgeApiKey: 'dataset-demo'
    })
  })

  it('reports safeStorage encrypted keys as unreadable for plain Node scripts', () => {
    const db = new Database(process.env.RESEARCH_NOTION_DB_PATH)
    try {
      ensureResearchNotionSchema(db)
      const setting = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`)
      setting.run('difyBaseUrl', 'http://localhost:8080')
      setting.run('difyAppApiKey', 'safe:encrypted-app-key')
      setting.run('difyKnowledgeApiKey', sealPlain('dataset-demo'))
    } finally {
      db.close()
    }

    const result = readLocalSettings()

    expect(result.settings).toEqual({
      baseUrl: 'http://localhost:8080',
      appApiKey: '',
      knowledgeApiKey: 'dataset-demo'
    })
    expect(result.encryptedKeys).toEqual(['Dify App API Key'])
  })
})
