import fs from 'node:fs/promises'
import path from 'node:path'
import type { FileType, Paper } from '../../shared/types'
import { copyPaperToStorage } from '../files/storage'
import type { createRepositories } from '../db/repositories'
import { generatePaperCard } from './generatePaperCard'

type ImportWorkflowInput = {
  folderId: string
  folderDatasetId?: string | null
  sourcePath: string
  userDataDir: string
  repos: ReturnType<typeof createRepositories>
  dify?: {
    uploadDocumentByFile(input: { datasetId: string; file: Blob; filename: string }): Promise<{ documentId: string }>
    sendChatMessage(input: { query: string; user: string; inputs: Record<string, string> }): Promise<{ answer: string }>
  }
}

type ReindexWorkflowInput = {
  paperId: string
  folderDatasetId: string
  repos: ReturnType<typeof createRepositories>
  dify: NonNullable<ImportWorkflowInput['dify']>
}

function detectFileType(sourcePath: string): FileType {
  const ext = path.extname(sourcePath).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (ext === '.md' || ext === '.markdown') return 'markdown'
  throw new Error('当前仅支持 PDF 和 Markdown 文件。')
}

function difyUploadFilename(paper: Paper): string {
  const extension = path.extname(paper.filePath)
  return `${paper.title}${extension}`
}

async function uploadAndGenerateCard(input: {
  paper: Paper
  datasetId: string
  repos: ReturnType<typeof createRepositories>
  dify: NonNullable<ImportWorkflowInput['dify']>
  failedSummary: string
}): Promise<Paper> {
  try {
    const bytes = await fs.readFile(input.paper.filePath)
    input.repos.papers.setIndexStatus(input.paper.id, 'indexing', null)
    const result = await input.dify.uploadDocumentByFile({
      datasetId: input.datasetId,
      file: new Blob([bytes]),
      filename: difyUploadFilename(input.paper)
    })
    input.repos.papers.setIndexStatus(input.paper.id, 'indexed', result.documentId)
    const existingCard = input.repos.papers.getCard(input.paper.id)
    try {
      const card = await generatePaperCard({
        paperId: input.paper.id,
        title: input.paper.title,
        dify: input.dify
      })
      input.repos.paperCards.upsert({
        ...card,
        readingStatus: existingCard?.readingStatus
      })
    } catch {
      input.repos.paperCards.upsert({
        paperId: input.paper.id,
        authors: '',
        year: '',
        oneSentenceSummary: '论文已入库，卡片生成失败，可稍后重试。',
        researchProblem: '',
        methodSummary: '',
        contributions: [],
        keywords: [],
        readingStatus: existingCard?.readingStatus
      })
    }

    return input.repos.papers.getById(input.paper.id) ?? {
      ...input.paper,
      difyDocumentId: result.documentId,
      indexStatus: 'indexed'
    }
  } catch (error) {
    input.repos.papers.setIndexStatus(input.paper.id, 'failed', null)
    const existingCard = input.repos.papers.getCard(input.paper.id)
    input.repos.paperCards.upsert({
      paperId: input.paper.id,
      authors: '',
      year: '',
      oneSentenceSummary: input.failedSummary,
      researchProblem: '',
      methodSummary: '',
      contributions: [],
      keywords: [],
      readingStatus: existingCard?.readingStatus
    })
    throw error
  }
}

export async function importAndIndexPaper(input: ImportWorkflowInput): Promise<Paper> {
  const extension = path.extname(input.sourcePath)
  const fileType = detectFileType(input.sourcePath)
  const paper = input.repos.papers.create({
    folderId: input.folderId,
    title: path.basename(input.sourcePath, extension),
    fileType,
    filePath: input.sourcePath
  })

  let storedPath: string
  try {
    storedPath = await copyPaperToStorage({
      userDataDir: input.userDataDir,
      sourcePath: input.sourcePath,
      paperId: paper.id,
      extension
    })
  } catch (error) {
    input.repos.papers.delete(paper.id)
    throw error
  }
  input.repos.papers.updateFilePath(paper.id, storedPath)

  if (!input.dify || !input.folderDatasetId) {
    input.repos.paperCards.upsert({
      paperId: paper.id,
      authors: '',
      year: '',
      oneSentenceSummary: '论文已本地导入，配置 Dify 后可继续索引和问答。',
      researchProblem: '',
      methodSummary: '',
      contributions: [],
      keywords: []
    })
    return input.repos.papers.getById(paper.id) ?? { ...paper, filePath: storedPath }
  }

  try {
    return await uploadAndGenerateCard({
      paper: input.repos.papers.getById(paper.id) ?? { ...paper, filePath: storedPath },
      datasetId: input.folderDatasetId,
      repos: input.repos,
      dify: input.dify,
      failedSummary: '论文已本地导入，但 Dify 索引失败，可检查配置后重试。'
    })
  } catch {
    return input.repos.papers.getById(paper.id) ?? {
      ...paper,
      filePath: storedPath,
      indexStatus: 'failed'
    }
  }
}

export async function reindexPaper(input: ReindexWorkflowInput): Promise<Paper> {
  const paper = input.repos.papers.getById(input.paperId)
  if (!paper) throw new Error('论文不存在。')

  try {
    return await uploadAndGenerateCard({
      paper,
      datasetId: input.folderDatasetId,
      repos: input.repos,
      dify: input.dify,
      failedSummary: '重新索引失败，可检查 Dify 配置后重试。'
    })
  } catch {
    throw new Error('重新索引失败，请检查 Dify 配置或网络。')
  }
}
