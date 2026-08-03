import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureResearchNotionSchema } from '../../scripts/research-notion-local-settings.mjs'
import { buildDemoReadinessReport, checkDifyReadiness, collectLocalLibraryStatus } from '../../scripts/verify-mvp-demo.mjs'

let tempDir = ''
let db

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'rn-mvp-verify-'))
  db = new Database(path.join(tempDir, 'research-notion.sqlite'))
  ensureResearchNotionSchema(db)
})

afterEach(() => {
  db.close()
  vi.restoreAllMocks()
  rmSync(tempDir, { recursive: true, force: true })
})

function seedDemoPaper(filePath) {
  const now = '2026-07-09T00:00:00.000Z'
  db.prepare(
    `INSERT INTO folders (id, name, parent_id, dify_dataset_id, created_at, updated_at)
     VALUES ('folder-1', 'Demo Library', null, 'dataset-1', ?, ?)`
  ).run(now, now)
  db.prepare(
    `INSERT INTO papers (id, folder_id, title, file_type, file_path, dify_document_id, index_status, created_at, updated_at)
     VALUES ('paper-1', 'folder-1', 'Demo PDF', 'pdf', ?, 'doc-1', 'indexed', ?, ?)`
  ).run(filePath, now, now)
  db.prepare(
    `INSERT INTO paper_cards
       (id, paper_id, authors, year, one_sentence_summary, research_problem, method_summary,
        contributions_json, keywords_json, reading_status, updated_at)
     VALUES ('card-1', 'paper-1', 'Demo Author', '2026', 'Summary.', 'Problem.', 'Method.', '[]', '[]', 'unread', ?)`
  ).run(now)
}

describe('MVP demo verification script helpers', () => {
  it('collects a ready local paper library status', () => {
    const pdfPath = path.join(tempDir, 'demo.pdf')
    writeFileSync(pdfPath, 'pdf')
    seedDemoPaper(pdfPath)

    const status = collectLocalLibraryStatus(path.join(tempDir, 'research-notion.sqlite'))

    expect(status).toMatchObject({
      ok: true,
      folderCount: 1,
      paperCount: 1,
      pdfPaperCount: 1,
      indexedPaperCount: 1,
      cardCount: 1,
      missingFiles: []
    })
  })

  it('marks missing local paper files as not ready', () => {
    seedDemoPaper(path.join(tempDir, 'missing.pdf'))

    const status = collectLocalLibraryStatus(path.join(tempDir, 'research-notion.sqlite'))

    expect(status.ok).toBe(false)
    expect(status.missingFiles).toEqual([
      { id: 'paper-1', title: 'Demo PDF', filePath: path.join(tempDir, 'missing.pdf') }
    ])
  })

  it('builds a passing report only when Dify and local library are ready', () => {
    const report = buildDemoReadinessReport({
      config: { source: 'env', encryptedKeys: [] },
      dify: {
        ok: true,
        missingConfig: [],
        appName: 'ResearchNotion Tool Agent',
        appMode: 'agent-chat',
        missingInputs: [],
        retrieverEnabled: true,
        knowledgeApiOk: true,
        error: ''
      },
      local: {
        ok: true,
        folderCount: 1,
        paperCount: 3,
        pdfPaperCount: 3,
        indexedPaperCount: 3,
        cardCount: 3,
        missingFiles: [],
        unindexedPapers: [],
        papersWithoutCards: []
      }
    })

    expect(report.ok).toBe(true)
    expect(report.text).toContain('结果：MVP 演示环境可用。')
  })

  it('accepts an agent-chat Dify app without legacy workflow inputs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'ResearchNotion Tool Agent', mode: 'agent-chat' })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await checkDifyReadiness({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'app-key',
      knowledgeApiKey: 'knowledge-key'
    })

    expect(result).toMatchObject({
      ok: true,
      appName: 'ResearchNotion Tool Agent',
      appMode: 'agent-chat',
      missingInputs: [],
      retrieverEnabled: true,
      knowledgeApiOk: true
    })
  })

  it('labels agent-chat readiness without misleading legacy variable failures', () => {
    const report = buildDemoReadinessReport({
      config: { source: 'env', encryptedKeys: [] },
      dify: {
        ok: true,
        missingConfig: [],
        appName: 'ResearchNotion Tool Agent',
        appMode: 'agent-chat',
        missingInputs: [],
        retrieverEnabled: true,
        knowledgeApiOk: true,
        error: ''
      },
      local: {
        ok: true,
        folderCount: 1,
        paperCount: 3,
        pdfPaperCount: 3,
        indexedPaperCount: 3,
        cardCount: 3,
        missingFiles: [],
        unindexedPapers: [],
        papersWithoutCards: []
      }
    })

    expect(report.ok).toBe(true)
    expect(report.text).toContain('Dify App: ResearchNotion Tool Agent (agent-chat)')
    expect(report.text).toContain('Agent 模式: 已启用')
    expect(report.text).not.toContain('ResearchNotion 变量')
  })
})
