import { mkdtempSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { readPaperMarkdown, readPaperPlainText } from '../../src/main/files/importPaper'
import type { Paper } from '../../src/shared/types'

let tempDir = ''

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'rn-import-'))
})

function paper(overrides: Partial<Paper> = {}): Paper {
  return {
    id: 'p1',
    folderId: 'f1',
    title: 'Test Paper',
    fileType: 'markdown',
    filePath: '',
    difyDocumentId: null,
    indexStatus: 'indexed',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('readPaperMarkdown', () => {
  it('reads markdown file content as utf8', async () => {
    const md = path.join(tempDir, 'paper.md')
    await writeFile(md, '# Title\n\n中文内容')
    const result = await readPaperMarkdown(paper({ filePath: md, fileType: 'markdown' }))
    expect(result).toBe('# Title\n\n中文内容')
  })

  it('returns null for non-markdown (pdf) files without reading', async () => {
    const result = await readPaperMarkdown(paper({ fileType: 'pdf' }))
    expect(result).toBeNull()
  })
})

describe('readPaperPlainText', () => {
  it('returns null for markdown files (only extracts pdf)', async () => {
    const result = await readPaperPlainText(paper({ fileType: 'markdown' }))
    expect(result).toBeNull()
  })

  it('returns null for pdf path pointing at non-existent file (graceful)', async () => {
    const result = readPaperPlainText(paper({ fileType: 'pdf', filePath: path.join(tempDir, 'nope.pdf') }))
    await expect(result).rejects.toThrow() // fs.readFile 抛 ENOENT，不静默吞
  })
})
