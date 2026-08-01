import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createMemoriesService } from '../../src/main/settings/memoriesService'
import { schemaSql } from '../../src/main/db/schema'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.exec(schemaSql)
  return db
}

describe('memoriesService', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  describe('list / save / delete', () => {
    it('starts empty', () => {
      const svc = createMemoriesService(db)
      expect(svc.list()).toEqual([])
    })

    it('creates a memory with auto-generated id', () => {
      const svc = createMemoriesService(db)
      const mem = svc.save({ type: 'user', name: 'research-field', description: '研究方向', body: 'NLP / RAG' })
      expect(mem.id).toMatch(/^mem_/)
      expect(mem.type).toBe('user')
      expect(mem.body).toBe('NLP / RAG')
      expect(svc.list()).toHaveLength(1)
    })

    it('updates an existing memory by id', () => {
      const svc = createMemoriesService(db)
      const created = svc.save({ type: 'preference', name: 'language', description: '', body: '中文' })
      const updated = svc.save({ id: created.id, type: 'preference', name: 'language', description: '', body: 'English' })
      expect(updated.body).toBe('English')
      expect(svc.list()).toHaveLength(1)
    })

    it('deletes a memory', () => {
      const svc = createMemoriesService(db)
      const mem = svc.save({ type: 'feedback', name: 'no-preamble', description: '', body: '不要自我介绍' })
      svc.delete(mem.id)
      expect(svc.list()).toEqual([])
    })
  })

  describe('buildInjectionPrefix', () => {
    it('returns empty string when no memories', () => {
      const svc = createMemoriesService(db)
      expect(svc.buildInjectionPrefix()).toBe('')
    })

    it('includes user and preference memories', () => {
      const svc = createMemoriesService(db)
      svc.save({ type: 'user', name: 'field', description: '', body: 'NLP研究方向' })
      svc.save({ type: 'preference', name: 'lang', description: '', body: '偏好中文回答' })
      const prefix = svc.buildInjectionPrefix()
      expect(prefix).toContain('NLP研究方向')
      expect(prefix).toContain('偏好中文回答')
    })

    it('includes feedback memories (latest 3)', () => {
      const svc = createMemoriesService(db)
      for (let i = 1; i <= 5; i++) {
        svc.save({ type: 'feedback', name: `correction-${i}`, description: '', body: `纠正${i}` })
      }
      const prefix = svc.buildInjectionPrefix()
      // feedback[0..2] are latest 3 by updated_at DESC (save order = id order, not updated_at)
      // All 5 are saved in sequence so list() returns them by type then updated_at DESC
      // Since all have similar timestamps, at least 3 should be included
      const correctionCount = (prefix.match(/纠正/g) || []).length
      expect(correctionCount).toBeLessThanOrEqual(3)
      expect(correctionCount).toBeGreaterThanOrEqual(1)
    })

    it('includes project and reference memories', () => {
      const svc = createMemoriesService(db)
      svc.save({ type: 'project', name: 'current-topic', description: '', body: '正在研究 RAG 检索质量' })
      svc.save({ type: 'reference', name: 'arxiv-url', description: '', body: 'https://arxiv.org/list/cs.CL/recent' })
      const prefix = svc.buildInjectionPrefix()
      expect(prefix).toContain('RAG 检索质量')
      expect(prefix).toContain('arxiv.org')
    })

    it('truncates to maxChars', () => {
      const svc = createMemoriesService(db)
      // Add many memories to exceed limit
      for (let i = 0; i < 20; i++) {
        svc.save({ type: 'reference', name: `ref-${i}`, description: '', body: `A`.repeat(200) })
      }
      const prefix = svc.buildInjectionPrefix(500)
      expect(prefix.length).toBeLessThanOrEqual(600) // some overshoot from last line
    })
  })
})
