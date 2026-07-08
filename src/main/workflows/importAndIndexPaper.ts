import fs from 'node:fs/promises'
import path from 'node:path'
import type { FileType, Paper } from '../../shared/types'
import { copyPaperToStorage } from '../files/storage'
import type { createRepositories } from '../db/repositories'

type ImportWorkflowInput = {
  folderId: string
  folderDatasetId: string
  sourcePath: string
  userDataDir: string
  repos: ReturnType<typeof createRepositories>
  dify: {
    uploadDocumentByFile(input: { datasetId: string; file: Blob; filename: string }): Promise<{ documentId: string }>
  }
}

function detectFileType(sourcePath: string): FileType {
  const ext = path.extname(sourcePath).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (ext === '.md' || ext === '.markdown') return 'markdown'
  throw new Error('MVP 仅支持 PDF 和 Markdown 文件。')
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

  const storedPath = await copyPaperToStorage({
    userDataDir: input.userDataDir,
    sourcePath: input.sourcePath,
    paperId: paper.id,
    extension
  })
  input.repos.papers.updateFilePath(paper.id, storedPath)

  try {
    const bytes = await fs.readFile(storedPath)
    input.repos.papers.setIndexStatus(paper.id, 'indexing', null)
    const result = await input.dify.uploadDocumentByFile({
      datasetId: input.folderDatasetId,
      file: new Blob([bytes]),
      filename: path.basename(storedPath)
    })
    input.repos.papers.setIndexStatus(paper.id, 'indexed', result.documentId)
    return input.repos.papers.getById(paper.id) ?? {
      ...paper,
      filePath: storedPath,
      difyDocumentId: result.documentId,
      indexStatus: 'indexed'
    }
  } catch (error) {
    input.repos.papers.setIndexStatus(paper.id, 'failed', null)
    throw error
  }
}
