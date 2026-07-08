import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppDatabase } from '../../src/main/db/database'
import { createDatabase } from '../../src/main/db/database'
import { createRepositories } from '../../src/main/db/repositories'
import { importAndIndexPaper } from '../../src/main/workflows/importAndIndexPaper'

let tempDir = ''
let databases: AppDatabase[] = []

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'rn-import-'))
  databases = []
})

afterEach(() => {
  databases.forEach((db) => db.close())
  rmSync(tempDir, { recursive: true, force: true })
})

describe('import and index paper workflow', () => {
  it('copies markdown into local storage and indexes it in Dify', async () => {
    const sourcePath = path.join(tempDir, 'RAG Survey.md')
    writeFileSync(sourcePath, '# RAG Survey\n\nRetrieval augmented generation.', 'utf8')
    const db = createDatabase(path.join(tempDir, 'app.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)
    const folder = repos.folders.create({ name: '毕业设计', parentId: null })
    const uploadDocumentByFile = vi.fn().mockResolvedValue({ documentId: 'doc-1' })
    const sendChatMessage = vi.fn().mockResolvedValue({
      answer: JSON.stringify({
        authors: 'Lewis et al.',
        year: '2020',
        oneSentenceSummary: 'RAG combines retrieval and generation.',
        researchProblem: 'Knowledge-intensive generation',
        methodSummary: 'Retrieve passages before generation.',
        contributions: ['Introduces RAG'],
        keywords: ['RAG']
      })
    })

    const paper = await importAndIndexPaper({
      folderId: folder.id,
      folderDatasetId: 'dataset-1',
      sourcePath,
      userDataDir: tempDir,
      repos,
      dify: { uploadDocumentByFile, sendChatMessage }
    })

    expect(paper).toMatchObject({
      title: 'RAG Survey',
      fileType: 'markdown',
      difyDocumentId: 'doc-1',
      indexStatus: 'indexed'
    })
    expect(paper.filePath).not.toBe(sourcePath)
    expect(paper.filePath).toContain(`${path.sep}papers${path.sep}`)
    expect(existsSync(paper.filePath)).toBe(true)
    expect(readFileSync(paper.filePath, 'utf8')).toContain('Retrieval augmented generation.')
    expect(repos.papers.getById(paper.id)?.filePath).toBe(paper.filePath)
    expect(repos.papers.getCard(paper.id)?.oneSentenceSummary).toBe('RAG combines retrieval and generation.')
    expect(uploadDocumentByFile).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId: 'dataset-1',
        filename: expect.stringMatching(/\.md$/)
      })
    )
  })

  it('rejects files outside the MVP formats', async () => {
    const sourcePath = path.join(tempDir, 'notes.txt')
    writeFileSync(sourcePath, 'plain text', 'utf8')
    const db = createDatabase(path.join(tempDir, 'app.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)
    const folder = repos.folders.create({ name: '毕业设计', parentId: null })

    await expect(
      importAndIndexPaper({
        folderId: folder.id,
        folderDatasetId: 'dataset-1',
        sourcePath,
        userDataDir: tempDir,
        repos,
        dify: { uploadDocumentByFile: vi.fn(), sendChatMessage: vi.fn() }
      })
    ).rejects.toThrow('MVP 仅支持 PDF 和 Markdown 文件。')
  })

  it('stores a fallback card when card JSON parsing fails', async () => {
    const sourcePath = path.join(tempDir, 'Broken Card.md')
    writeFileSync(sourcePath, '# Broken Card', 'utf8')
    const db = createDatabase(path.join(tempDir, 'fallback.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)
    const folder = repos.folders.create({ name: '创新实训', parentId: null })

    const paper = await importAndIndexPaper({
      folderId: folder.id,
      folderDatasetId: 'dataset-1',
      sourcePath,
      userDataDir: tempDir,
      repos,
      dify: {
        uploadDocumentByFile: vi.fn().mockResolvedValue({ documentId: 'doc-1' }),
        sendChatMessage: vi.fn().mockResolvedValue({ answer: 'not json' })
      }
    })

    expect(repos.papers.getCard(paper.id)?.oneSentenceSummary).toBe('论文已入库，卡片生成失败，可稍后重试。')
  })
})
