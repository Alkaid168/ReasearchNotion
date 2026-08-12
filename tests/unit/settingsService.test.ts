import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../src/main/db/database'
import { createDatabase } from '../../src/main/db/database'
import { createSettingsService } from '../../src/main/settings/settingsService'

let tempDir = ''
let databases: AppDatabase[] = []

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'rn-settings-'))
  databases = []
})

afterEach(() => {
  databases.forEach((db) => db.close())
  rmSync(tempDir, { recursive: true, force: true })
})

describe('settings service', () => {
  it('returns empty settings by default and persists Dify settings', async () => {
    const db = createDatabase(path.join(tempDir, 'settings.sqlite'))
    databases.push(db)
    const service = createSettingsService(db, {
      seal: (value) => `sealed:${value}`,
      unseal: (value) => value.replace(/^sealed:/, '')
    })

    await expect(service.get()).resolves.toEqual({
      difyBaseUrl: '',
      difyAppApiKey: '',
      difyKnowledgeApiKey: '',
    deepseekApiKey: '',
      defaultFolderId: null,
      activeModelProfileId: null
    })

    await service.save({
      difyBaseUrl: 'http://localhost:8080',
      difyAppApiKey: 'app-key',
      difyKnowledgeApiKey: 'knowledge-key',
    deepseekApiKey: '',
      defaultFolderId: 'folder-1',
      activeModelProfileId: null
    })

    await expect(service.get()).resolves.toEqual({
      difyBaseUrl: 'http://localhost:8080',
      difyAppApiKey: 'app-key',
      difyKnowledgeApiKey: 'knowledge-key',
    deepseekApiKey: '',
      defaultFolderId: 'folder-1',
      activeModelProfileId: null
    })
  })
})
