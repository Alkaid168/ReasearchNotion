import { describe, expect, it } from 'vitest'
import { mapCitationsToLocalPapers, mergeCitationsWithToolInvocations } from '../../src/main/dify/citations'
import type { Citation, Paper } from '../../src/shared/types'

function paper(overrides: Partial<Paper> = {}): Paper {
  return {
    id: 'p1',
    folderId: 'f1',
    title: 'Attention Is All You Need',
    fileType: 'pdf',
    filePath: '/p.pdf',
    difyDocumentId: null,
    indexStatus: 'indexed',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

function citation(overrides: Partial<Citation> = {}): Citation {
  return { paperId: null, paperTitle: 'Unknown', snippet: '', score: null, ...overrides }
}

describe('mapCitationsToLocalPapers', () => {
  it('uses paperId to resolve the real title', () => {
    const result = mapCitationsToLocalPapers(
      [citation({ paperId: 'p1', paperTitle: 'Dify fallback title' })],
      () => null,
      () => null,
      (id) => (id === 'p1' ? paper({ title: 'Real Title' }) : null)
    )
    expect(result[0].paperTitle).toBe('Real Title')
  })

  it('falls back to sourceDocumentId when paperId is null', () => {
    const result = mapCitationsToLocalPapers(
      [citation({ sourceDocumentId: 'doc-1', paperTitle: 'rag.pdf' })],
      (docId) => (docId === 'doc-1' ? paper({ id: 'p2', title: 'RAG Paper' }) : null)
    )
    expect(result[0].paperId).toBe('p2')
    expect(result[0].paperTitle).toBe('RAG Paper')
  })

  it('falls back to title match and strips .pdf extension', () => {
    const result = mapCitationsToLocalPapers(
      [citation({ paperTitle: 'RAG Paper.pdf' })],
      () => null,
      (title) => (title === 'RAG Paper' ? paper({ id: 'p3', title: 'RAG Paper' }) : null)
    )
    expect(result[0].paperId).toBe('p3')
  })

  it('returns citation unchanged when nothing matches', () => {
    const c = citation({ paperTitle: 'Mystery Paper' })
    const result = mapCitationsToLocalPapers([c], () => null)
    expect(result[0]).toEqual(c)
  })
})

describe('mergeCitationsWithToolInvocations', () => {
  it('adds body-evidence tool invocations (investigate_paper) not already cited', () => {
    const result = mergeCitationsWithToolInvocations(
      [],
      [{ operationId: 'investigate_paper', paperId: 'p1' }],
      (id) => (id === 'p1' ? paper({ title: 'Paper 1' }) : null)
    )
    expect(result).toHaveLength(1)
    expect(result[0].paperId).toBe('p1')
    expect(result[0].evidenceType).toBe('tool')
    expect(result[0].paperTitle).toBe('Paper 1')
  })

  it('skips non-body-evidence tools (e.g. get_current_context)', () => {
    const result = mergeCitationsWithToolInvocations(
      [],
      [{ operationId: 'get_current_context', paperId: 'p1' }],
      () => paper()
    )
    expect(result).toHaveLength(0)
  })

  it('does not duplicate a paper that is already cited', () => {
    const result = mergeCitationsWithToolInvocations(
      [citation({ paperId: 'p1', paperTitle: 'Existing' })],
      [{ operationId: 'get_paper_section', paperId: 'p1' }],
      (id) => (id === 'p1' ? paper({ title: 'Existing' }) : null)
    )
    expect(result).toHaveLength(1)
  })

  it('skips invocations without a paperId', () => {
    const result = mergeCitationsWithToolInvocations(
      [],
      [{ operationId: 'investigate_paper', paperId: null }],
      () => paper()
    )
    expect(result).toHaveLength(0)
  })
})
