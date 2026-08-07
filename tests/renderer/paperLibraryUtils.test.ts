import { describe, expect, it } from 'vitest'
import { filterLibraryPapers, paperMeta, type PaperRow } from '../../src/renderer/pages/paperLibraryUtils'

function paper(overrides: Partial<PaperRow> = {}): PaperRow {
  return {
    id: 'paper-1',
    folderId: 'folder-1',
    title: 'Attention Is All You Need',
    fileType: 'pdf',
    filePath: 'paper.pdf',
    difyDocumentId: null,
    indexStatus: 'local-only',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    card: null,
    ...overrides
  }
}

describe('paper library utilities', () => {
  it('matches a paper by title without case sensitivity', () => {
    const papers = [paper()]
    expect(filterLibraryPapers(papers, 'attention')).toEqual(papers)
    expect(filterLibraryPapers(papers, 'missing')).toEqual([])
  })

  it('keeps the file type visible when card metadata is unavailable', () => {
    expect(paperMeta(paper())).toBe('PDF')
    expect(paperMeta(paper({ fileType: 'markdown' }))).toBe('Markdown')
  })
})
