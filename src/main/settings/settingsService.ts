import type Database from 'better-sqlite3'
import type { AppSettings, StreamSpeed } from '../../shared/types'
import type { SecretBox } from './secretBox'

const keys = {
  difyBaseUrl: 'difyBaseUrl',
  difyAppApiKey: 'difyAppApiKey',
  difyKnowledgeApiKey: 'difyKnowledgeApiKey',
  deepseekApiKey: 'deepseekApiKey',
  defaultFolderId: 'defaultFolderId',
  activeModelProfileId: 'activeModelProfileId',
  streamSpeed: 'streamSpeed'
} as const

export function createSettingsService(db: Database.Database, secretBox: SecretBox) {
  function getRaw(key: string): string {
    const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined
    return row?.value ?? ''
  }

  function setRaw(key: string, value: string): void {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(key, value)
  }

  async function readSettings(): Promise<AppSettings> {
    return {
      difyBaseUrl: getRaw(keys.difyBaseUrl),
      difyAppApiKey: secretBox.unseal(getRaw(keys.difyAppApiKey)),
      difyKnowledgeApiKey: secretBox.unseal(getRaw(keys.difyKnowledgeApiKey)),
      deepseekApiKey: secretBox.unseal(getRaw(keys.deepseekApiKey)),
      defaultFolderId: getRaw(keys.defaultFolderId) || null,
      activeModelProfileId: getRaw(keys.activeModelProfileId) || null,
      streamSpeed: (getRaw(keys.streamSpeed) || 'normal') as StreamSpeed
    }
  }

  return {
    get: readSettings,
    async save(settings: AppSettings): Promise<AppSettings> {
      setRaw(keys.difyBaseUrl, settings.difyBaseUrl.trim().replace(/\/+$/, ''))
      setRaw(keys.difyAppApiKey, secretBox.seal(settings.difyAppApiKey.trim()))
      setRaw(keys.difyKnowledgeApiKey, secretBox.seal(settings.difyKnowledgeApiKey.trim()))
      setRaw(keys.deepseekApiKey, secretBox.seal(settings.deepseekApiKey.trim()))
      setRaw(keys.defaultFolderId, settings.defaultFolderId ?? '')
      setRaw(keys.activeModelProfileId, settings.activeModelProfileId ?? '')
      setRaw(keys.streamSpeed, settings.streamSpeed)
      return readSettings()
    }
  }
}
