import { describe, expect, it } from 'vitest'
import { mapCitationsToLocalPapers, mergeCitationsWithToolInvocations } from '../../src/main/dify/citations'
import type { Paper } from '../../src/shared/types'

const paper: Paper = {
  id: 'paper-1',
  folderId: 'folder-1',
  title: 'RAG Survey',
  fileType: 'pdf',
  filePath: 'rag.pdf',
  difyDocumentId: 'doc-1',
  indexStatus: 'indexed',
  createdAt: '',
  updatedAt: ''
}

const secondPaper: Paper = {
  ...paper,
  id: 'paper-2',
  title: 'Attention Is All You Need',
  filePath: 'attention.pdf',
  difyDocumentId: 'doc-2'
}

describe('Dify citation mapping', () => {
  it('maps Dify document ids back to local papers', () => {
    const citations = mapCitationsToLocalPapers(
      [
        {
          paperId: null,
          paperTitle: 'rag.pdf',
          snippet: 'retrieval augmented generation',
          score: 0.91,
          sourceDocumentId: 'doc-1'
        }
      ],
      (documentId) => (documentId === 'doc-1' ? paper : null)
    )

    expect(citations[0]).toMatchObject({
      paperId: 'paper-1',
      paperTitle: 'RAG Survey',
      sourceDocumentId: 'doc-1'
    })
  })

  it('keeps external citations when no local paper matches', () => {
    const citations = mapCitationsToLocalPapers(
      [
        {
          paperId: null,
          paperTitle: 'external.pdf',
          snippet: 'outside source',
          score: null,
          sourceDocumentId: 'doc-external'
        }
      ],
      () => null
    )

    expect(citations[0]).toMatchObject({
      paperId: null,
      paperTitle: 'external.pdf'
    })
  })

  it('maps citations by normalized paper title when Dify omits the document id', () => {
    const citations = mapCitationsToLocalPapers(
      [
        {
          paperId: null,
          paperTitle: 'RAG Survey.pdf',
          snippet: 'retrieval augmented generation',
          score: 0.88,
          sourceDocumentId: null
        }
      ],
      () => null,
      (title) => (title === 'RAG Survey.pdf' ? paper : null)
    )

    expect(citations[0]).toMatchObject({
      paperId: 'paper-1',
      paperTitle: 'RAG Survey',
      sourceDocumentId: null
    })
  })

  it('adds papers confirmed by real body-text tool calls without duplicating or promoting outline reads', () => {
    const citations = mergeCitationsWithToolInvocations(
      [
        {
          paperId: paper.id,
          paperTitle: paper.title,
          snippet: 'retrieval augmented generation',
          score: null,
          evidenceType: 'tool'
        }
      ],
      [
        { operationId: 'get_paper_section', paperId: paper.id },
        { operationId: 'get_paper_outline', paperId: secondPaper.id },
        { operationId: 'get_paper_section', paperId: secondPaper.id },
        { operationId: 'get_paper_text_chunk', paperId: secondPaper.id }
      ],
      (paperId) => (paperId === paper.id ? paper : paperId === secondPaper.id ? secondPaper : null)
    )

    expect(citations).toHaveLength(2)
    expect(citations[1]).toEqual({
      paperId: secondPaper.id,
      paperTitle: secondPaper.title,
      snippet: '',
      score: null,
      evidenceType: 'tool'
    })
  })
})
