import fs from 'node:fs/promises'
import type { Paper } from '../../shared/types'

export async function readPaperMarkdown(paper: Paper): Promise<string | null> {
  if (paper.fileType !== 'markdown') return null
  return fs.readFile(paper.filePath, 'utf8')
}
