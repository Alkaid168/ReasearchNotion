import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import type { FileType, Paper } from '../../shared/types'
import { copyPaperToStorage } from '../files/storage'
import { validatePaperSource } from '../files/importPaper'
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

type CopyWorkflowInput = {
  paperId: string
  targetFolderId: string
  folderDatasetId?: string | null
  userDataDir: string
  repos: ReturnType<typeof createRepositories>
  dify?: NonNullable<ImportWorkflowInput['dify']>
}

async function fileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

async function findDuplicatePaper(input: {
  folderId: string
  sourcePath: string
  repos: ReturnType<typeof createRepositories>
}): Promise<Paper | null> {
  const sourceStat = await fs.stat(input.sourcePath)
  let sourceHash: string | null = null

  for (const paper of input.repos.papers.listByFolder(input.folderId)) {
    try {
      const storedStat = await fs.stat(paper.filePath)
      if (!storedStat.isFile() || storedStat.size !== sourceStat.size) continue
      sourceHash ??= await fileSha256(input.sourcePath)
      if ((await fileSha256(paper.filePath)) === sourceHash) return paper
    } catch {
      // An unavailable old file must not prevent importing a healthy new paper.
    }
  }
  return null
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
    } catch (cardError) {
      console.error(`[paperCard] 生成失败 paperId=${input.paper.id}`, cardError)
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

async function uploadCopiedPaper(input: {
  paper: Paper
  datasetId: string
  repos: ReturnType<typeof createRepositories>
  dify: NonNullable<ImportWorkflowInput['dify']>
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
    return input.repos.papers.getById(input.paper.id) ?? {
      ...input.paper,
      difyDocumentId: result.documentId,
      indexStatus: 'indexed'
    }
  } catch (error) {
    input.repos.papers.setIndexStatus(input.paper.id, 'failed', null)
    throw error
  }
}

export async function importAndIndexPaper(input: ImportWorkflowInput): Promise<Paper> {
  const extension = path.extname(input.sourcePath)
  const fileType = detectFileType(input.sourcePath)
  await validatePaperSource(input.sourcePath, fileType)
  const duplicate = await findDuplicatePaper({ folderId: input.folderId, sourcePath: input.sourcePath, repos: input.repos })
  if (duplicate) throw new Error(`该文件内容与论文库中的「${duplicate.title}」重复，已跳过导入。`)

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

export async function copyPaperToFolder(input: CopyWorkflowInput): Promise<Paper> {
  const sourcePaper = input.repos.papers.getById(input.paperId)
  if (!sourcePaper) throw new Error('论文不存在。')
  if (sourcePaper.folderId === input.targetFolderId) throw new Error('论文已经在目标文件夹中。')
  if (!input.repos.folders.getById(input.targetFolderId)) throw new Error('目标论文文件夹不存在。')

  await validatePaperSource(sourcePaper.filePath, sourcePaper.fileType)
  const duplicate = await findDuplicatePaper({
    folderId: input.targetFolderId,
    sourcePath: sourcePaper.filePath,
    repos: input.repos
  })
  if (duplicate) throw new Error(`目标文件夹中已有内容相同的论文「${duplicate.title}」，未重复复制。`)

  const extension = path.extname(sourcePaper.filePath) || (sourcePaper.fileType === 'pdf' ? '.pdf' : '.md')
  const copiedPaper = input.repos.papers.create({
    folderId: input.targetFolderId,
    title: sourcePaper.title,
    fileType: sourcePaper.fileType,
    filePath: sourcePaper.filePath
  })

  let storedPath: string | null = null
  try {
    storedPath = await copyPaperToStorage({
      userDataDir: input.userDataDir,
      sourcePath: sourcePaper.filePath,
      paperId: copiedPaper.id,
      extension
    })
    input.repos.papers.updateFilePath(copiedPaper.id, storedPath)

    const sourceCard = input.repos.papers.getCard(sourcePaper.id)
    if (sourceCard) {
      input.repos.paperCards.upsert({
        paperId: copiedPaper.id,
        authors: sourceCard.authors,
        year: sourceCard.year,
        oneSentenceSummary: sourceCard.oneSentenceSummary,
        researchProblem: sourceCard.researchProblem,
        methodSummary: sourceCard.methodSummary,
        contributions: [...sourceCard.contributions],
        keywords: [...sourceCard.keywords],
        readingStatus: sourceCard.readingStatus
      })
    }
  } catch (error) {
    input.repos.papers.delete(copiedPaper.id)
    if (storedPath) await fs.rm(storedPath, { force: true })
    throw error
  }

  const storedPaper = input.repos.papers.getById(copiedPaper.id) ?? { ...copiedPaper, filePath: storedPath }
  if (!input.dify || !input.folderDatasetId) return storedPaper

  try {
    return await uploadCopiedPaper({
      paper: storedPaper,
      datasetId: input.folderDatasetId,
      repos: input.repos,
      dify: input.dify
    })
  } catch {
    return input.repos.papers.getById(copiedPaper.id) ?? { ...storedPaper, indexStatus: 'failed' }
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
