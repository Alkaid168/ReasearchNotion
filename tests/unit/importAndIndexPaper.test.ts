import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppDatabase } from '../../src/main/db/database'
import { createDatabase } from '../../src/main/db/database'
import { createRepositories } from '../../src/main/db/repositories'
import { importAndIndexPaper, reindexPaper } from '../../src/main/workflows/importAndIndexPaper'

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
        filename: 'RAG Survey.md'
      })
    )
  })

  it('imports markdown locally when Dify is not configured', async () => {
    const sourcePath = path.join(tempDir, 'Local Only.md')
    writeFileSync(sourcePath, '# Local Only\n\nRead before indexing.', 'utf8')
    const db = createDatabase(path.join(tempDir, 'local.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)
    const folder = repos.folders.create({ name: '本地论文库', parentId: null })

    const paper = await importAndIndexPaper({
      folderId: folder.id,
      sourcePath,
      userDataDir: tempDir,
      repos
    })

    expect(paper).toMatchObject({
      title: 'Local Only',
      fileType: 'markdown',
      difyDocumentId: null,
      indexStatus: 'local-only'
    })
    expect(paper.filePath).not.toBe(sourcePath)
    expect(existsSync(paper.filePath)).toBe(true)
    expect(readFileSync(paper.filePath, 'utf8')).toContain('Read before indexing.')
    expect(repos.papers.getCard(paper.id)?.oneSentenceSummary).toBe('论文已本地导入，配置 Dify 后可继续索引和问答。')
  })

  it('keeps a local paper when Dify indexing fails', async () => {
    const sourcePath = path.join(tempDir, 'Index Failed.md')
    writeFileSync(sourcePath, '# Index Failed', 'utf8')
    const db = createDatabase(path.join(tempDir, 'failed.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)
    const folder = repos.folders.create({ name: '失败索引库', parentId: null })

    const paper = await importAndIndexPaper({
      folderId: folder.id,
      folderDatasetId: 'dataset-1',
      sourcePath,
      userDataDir: tempDir,
      repos,
      dify: {
        uploadDocumentByFile: vi.fn().mockRejectedValue(new Error('Dify offline')),
        sendChatMessage: vi.fn()
      }
    })

    expect(paper).toMatchObject({
      title: 'Index Failed',
      difyDocumentId: null,
      indexStatus: 'failed'
    })
    expect(existsSync(paper.filePath)).toBe(true)
    expect(repos.papers.getCard(paper.id)?.oneSentenceSummary).toBe('论文已本地导入，但 Dify 索引失败，可检查配置后重试。')
  })

  it('rejects files outside supported paper formats', async () => {
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
    ).rejects.toThrow('当前仅支持 PDF 和 Markdown 文件。')
  })

  it('rolls back the local paper record when the source file cannot be copied', async () => {
    const db = createDatabase(path.join(tempDir, 'copy-failed.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)
    const folder = repos.folders.create({ name: 'Copy Failure', parentId: null })

    await expect(
      importAndIndexPaper({
        folderId: folder.id,
        sourcePath: path.join(tempDir, 'missing-paper.md'),
        userDataDir: tempDir,
        repos
      })
    ).rejects.toThrow()

    expect(repos.papers.listByFolder(folder.id)).toEqual([])
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

  it('reindexes a local paper without importing it again', async () => {
    const sourcePath = path.join(tempDir, 'Needs Reindex.md')
    writeFileSync(sourcePath, '# Needs Reindex\n\nLocal first.', 'utf8')
    const db = createDatabase(path.join(tempDir, 'reindex.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)
    const folder = repos.folders.create({ name: '本地论文库', parentId: null })
    const paper = await importAndIndexPaper({
      folderId: folder.id,
      sourcePath,
      userDataDir: tempDir,
      repos
    })
    repos.paperCards.updateReadingStatus(paper.id, 'reading')
    const uploadDocumentByFile = vi.fn().mockResolvedValue({ documentId: 'doc-reindexed' })
    const sendChatMessage = vi.fn().mockResolvedValue({
      answer: JSON.stringify({
        authors: 'Local Team',
        year: '2026',
        oneSentenceSummary: 'Reindexed from the local file.',
        researchProblem: 'Local-first research libraries',
        methodSummary: 'Upload the stored paper file.',
        contributions: ['Adds retry indexing'],
        keywords: ['local-first']
      })
    })

    const reindexed = await reindexPaper({
      paperId: paper.id,
      folderDatasetId: 'dataset-1',
      repos,
      dify: { uploadDocumentByFile, sendChatMessage }
    })

    expect(reindexed).toMatchObject({
      id: paper.id,
      filePath: paper.filePath,
      difyDocumentId: 'doc-reindexed',
      indexStatus: 'indexed'
    })
    expect(uploadDocumentByFile).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId: 'dataset-1',
        filename: 'Needs Reindex.md'
      })
    )
    expect(repos.papers.getCard(paper.id)).toMatchObject({
      oneSentenceSummary: 'Reindexed from the local file.',
      readingStatus: 'reading'
    })
  })

  it('marks a paper failed when reindexing fails', async () => {
    const sourcePath = path.join(tempDir, 'Still Failed.md')
    writeFileSync(sourcePath, '# Still Failed', 'utf8')
    const db = createDatabase(path.join(tempDir, 'reindex-failed.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)
    const folder = repos.folders.create({ name: '失败索引库', parentId: null })
    const paper = await importAndIndexPaper({
      folderId: folder.id,
      sourcePath,
      userDataDir: tempDir,
      repos
    })

    await expect(
      reindexPaper({
        paperId: paper.id,
        folderDatasetId: 'dataset-1',
        repos,
        dify: {
          uploadDocumentByFile: vi.fn().mockRejectedValue(new Error('Dify offline')),
          sendChatMessage: vi.fn()
        }
      })
    ).rejects.toThrow('重新索引失败，请检查 Dify 配置或网络。')

    expect(repos.papers.getById(paper.id)?.indexStatus).toBe('failed')
    expect(repos.papers.getCard(paper.id)?.oneSentenceSummary).toBe('重新索引失败，可检查 Dify 配置后重试。')
  })
})
