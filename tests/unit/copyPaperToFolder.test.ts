import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { createRepositories } from '../../src/main/db/repositories'
import { copyPaperToFolder } from '../../src/main/workflows/importAndIndexPaper'
import type { Folder, Paper, PaperCard } from '../../src/shared/types'

let tempDir = ''

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'rn-copy-'))
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

function createFakeRepos(input: {
  sourcePaper: Paper
  sourceCard?: PaperCard | null
  targetFolder: Folder
  targetPapers?: Paper[]
}) {
  const papers = new Map<string, Paper>([
    [input.sourcePaper.id, input.sourcePaper],
    ...(input.targetPapers ?? []).map((paper) => [paper.id, paper] as const)
  ])
  const cards = new Map<string, PaperCard>()
  if (input.sourceCard) cards.set(input.sourcePaper.id, input.sourceCard)

  const repos = {
    folders: {
      getById: (folderId: string) => (folderId === input.targetFolder.id ? input.targetFolder : null)
    },
    papers: {
      getById: (paperId: string) => papers.get(paperId) ?? null,
      getCard: (paperId: string) => cards.get(paperId) ?? null,
      listByFolder: (folderId: string) =>
        [...papers.values()]
          .filter((paper) => paper.folderId === folderId)
          .map((paper) => ({ ...paper, card: cards.get(paper.id) ?? null })),
      create: (paperInput: Pick<Paper, 'folderId' | 'title' | 'fileType' | 'filePath'>) => {
        const paper: Paper = {
          ...paperInput,
          id: 'paper-copy',
          difyDocumentId: null,
          indexStatus: 'local-only',
          createdAt: '2026-08-08T00:00:00.000Z',
          updatedAt: '2026-08-08T00:00:00.000Z'
        }
        papers.set(paper.id, paper)
        return paper
      },
      updateFilePath: (paperId: string, filePath: string) => {
        const paper = papers.get(paperId)
        if (paper) papers.set(paperId, { ...paper, filePath })
      },
      setIndexStatus: (paperId: string, indexStatus: Paper['indexStatus'], difyDocumentId: string | null) => {
        const paper = papers.get(paperId)
        if (paper) papers.set(paperId, { ...paper, indexStatus, difyDocumentId })
      },
      delete: (paperId: string) => {
        const paper = papers.get(paperId)
        if (!paper) throw new Error('论文不存在。')
        papers.delete(paperId)
        cards.delete(paperId)
        return paper
      }
    },
    paperCards: {
      upsert: (cardInput: Omit<PaperCard, 'id' | 'updatedAt'>) => {
        const card: PaperCard = {
          ...cardInput,
          id: `card-${cardInput.paperId}`,
          updatedAt: '2026-08-08T00:00:00.000Z'
        }
        cards.set(card.paperId, card)
        return card
      }
    }
  } as unknown as ReturnType<typeof createRepositories>

  return { repos, papers, cards }
}

function paperFixture(filePath: string): Paper {
  return {
    id: 'paper-source',
    folderId: 'folder-source',
    title: 'Reusable Paper',
    fileType: 'markdown',
    filePath,
    difyDocumentId: 'doc-source',
    indexStatus: 'indexed',
    createdAt: '2026-08-08T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z'
  }
}

const targetFolder: Folder = {
  id: 'folder-target',
  name: '目标论文库',
  parentId: null,
  difyDatasetId: 'dataset-target',
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z'
}

describe('copy paper to folder workflow', () => {
  it('creates an independent stored file and reuses the existing paper card', async () => {
    const sourcePath = path.join(tempDir, 'source.md')
    writeFileSync(sourcePath, '# Reusable\n\nIndependent copy.', 'utf8')
    const sourcePaper = paperFixture(sourcePath)
    const sourceCard: PaperCard = {
      id: 'card-source',
      paperId: sourcePaper.id,
      authors: 'Research Team',
      year: '2026',
      oneSentenceSummary: 'Existing summary.',
      researchProblem: 'Avoid repeated analysis.',
      methodSummary: 'Reuse known metadata.',
      contributions: ['Fast copy'],
      keywords: ['copy'],
      readingStatus: 'reading',
      updatedAt: '2026-08-08T00:00:00.000Z'
    }
    const { repos, papers, cards } = createFakeRepos({ sourcePaper, sourceCard, targetFolder })

    const copied = await copyPaperToFolder({
      paperId: sourcePaper.id,
      targetFolderId: targetFolder.id,
      userDataDir: tempDir,
      repos
    })

    expect(copied).toMatchObject({ id: 'paper-copy', folderId: targetFolder.id, title: sourcePaper.title })
    expect(copied.filePath).not.toBe(sourcePaper.filePath)
    expect(readFileSync(copied.filePath, 'utf8')).toBe(readFileSync(sourcePaper.filePath, 'utf8'))
    expect(cards.get(copied.id)).toMatchObject({
      paperId: copied.id,
      oneSentenceSummary: sourceCard.oneSentenceSummary,
      readingStatus: sourceCard.readingStatus
    })

    rmSync(copied.filePath)
    papers.delete(copied.id)
    expect(existsSync(sourcePaper.filePath)).toBe(true)
    expect(papers.get(sourcePaper.id)).toEqual(sourcePaper)
  })

  it('rejects identical content already present in the target folder', async () => {
    const sourcePath = path.join(tempDir, 'source.md')
    const existingPath = path.join(tempDir, 'existing.md')
    writeFileSync(sourcePath, '# Same paper', 'utf8')
    writeFileSync(existingPath, '# Same paper', 'utf8')
    const sourcePaper = paperFixture(sourcePath)
    const existingPaper = { ...paperFixture(existingPath), id: 'paper-existing', folderId: targetFolder.id, title: 'Existing' }
    const { repos, papers } = createFakeRepos({ sourcePaper, targetFolder, targetPapers: [existingPaper] })

    await expect(
      copyPaperToFolder({
        paperId: sourcePaper.id,
        targetFolderId: targetFolder.id,
        userDataDir: tempDir,
        repos
      })
    ).rejects.toThrow('目标文件夹中已有内容相同的论文「Existing」，未重复复制。')

    expect(papers.size).toBe(2)
    expect(papers.get(sourcePaper.id)).toEqual(sourcePaper)
  })

  it('uploads a new target document without regenerating copied paper information', async () => {
    const sourcePath = path.join(tempDir, 'source.md')
    writeFileSync(sourcePath, '# Indexed copy', 'utf8')
    const sourcePaper = paperFixture(sourcePath)
    const { repos } = createFakeRepos({ sourcePaper, targetFolder })
    const uploadDocumentByFile = vi.fn().mockResolvedValue({ documentId: 'doc-copy' })
    const sendChatMessage = vi.fn()

    const copied = await copyPaperToFolder({
      paperId: sourcePaper.id,
      targetFolderId: targetFolder.id,
      folderDatasetId: targetFolder.difyDatasetId,
      userDataDir: tempDir,
      repos,
      dify: { uploadDocumentByFile, sendChatMessage }
    })

    expect(copied).toMatchObject({ difyDocumentId: 'doc-copy', indexStatus: 'indexed' })
    expect(uploadDocumentByFile).toHaveBeenCalledWith(expect.objectContaining({ datasetId: 'dataset-target' }))
    expect(sendChatMessage).not.toHaveBeenCalled()
  })
})
