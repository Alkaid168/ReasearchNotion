import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../src/main/db/database'
import { createDatabase } from '../../src/main/db/database'
import { createRepositories } from '../../src/main/db/repositories'

let tempDir = ''
let databases: AppDatabase[] = []

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'rn-db-'))
  databases = []
})

afterEach(() => {
  databases.forEach((db) => db.close())
  rmSync(tempDir, { recursive: true, force: true })
})

describe('repositories', () => {
  it('creates folders and persists Dify dataset ids', () => {
    const db = createDatabase(path.join(tempDir, 'app.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)

    const folder = repos.folders.create({ name: '毕业设计', parentId: null })
    repos.folders.setDifyDatasetId(folder.id, 'dataset-123')

    const folders = repos.folders.list()
    expect(folders).toHaveLength(1)
    expect(folders[0]).toMatchObject({ name: '毕业设计', difyDatasetId: 'dataset-123' })
  })

  it('creates papers and paper cards', () => {
    const db = createDatabase(path.join(tempDir, 'app.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)
    const folder = repos.folders.create({ name: 'RAG', parentId: null })

    const paper = repos.papers.create({
      folderId: folder.id,
      title: 'RAG Survey',
      fileType: 'pdf',
      filePath: path.join(tempDir, 'rag.pdf')
    })
    repos.papers.setIndexStatus(paper.id, 'indexed', 'doc-1')
    repos.paperCards.upsert({
      paperId: paper.id,
      authors: 'Lewis et al.',
      year: '2020',
      oneSentenceSummary: 'A retrieval-augmented generation paper.',
      researchProblem: 'Knowledge-intensive generation',
      methodSummary: 'Retrieve passages before generation.',
      contributions: ['Combines retrieval and generation'],
      keywords: ['RAG', 'retrieval']
    })

    const rows = repos.papers.listByFolder(folder.id)
    expect(rows[0].indexStatus).toBe('indexed')
    expect(rows[0].card?.keywords).toEqual(['RAG', 'retrieval'])
  })
})
