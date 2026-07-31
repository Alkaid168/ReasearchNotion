import type { Citation, Paper } from '../../shared/types'

const bodyEvidenceTools = new Set([
  'investigate_paper',
  'get_paper_page_text',
  'get_paper_section',
  'get_paper_text_chunk'
])

type ToolInvocationEvidence = {
  operationId: string
  paperId: string | null
}

export function mapCitationsToLocalPapers(
  citations: Citation[],
  findPaperByDifyDocumentId: (difyDocumentId: string) => Paper | null,
  findPaperByTitle: (title: string) => Paper | null = () => null,
  findPaperById: (paperId: string) => Paper | null = () => null
): Citation[] {
  return citations.map((citation) => {
    if (citation.paperId) {
      const paper = findPaperById(citation.paperId)
      return paper ? { ...citation, paperTitle: paper.title } : citation
    }

    const paper =
      citation.sourceDocumentId ? findPaperByDifyDocumentId(citation.sourceDocumentId) : null
    const fallbackPaper = paper ?? findPaperByCitationTitle(citation.paperTitle, findPaperByTitle)
    return fallbackPaper ? { ...citation, paperId: fallbackPaper.id, paperTitle: fallbackPaper.title } : citation
  })
}

export function mergeCitationsWithToolInvocations(
  citations: Citation[],
  invocations: ToolInvocationEvidence[],
  findPaperById: (paperId: string) => Paper | null
): Citation[] {
  const merged = [...citations]
  const citedPaperIds = new Set(citations.flatMap((citation) => (citation.paperId ? [citation.paperId] : [])))

  for (const invocation of invocations) {
    if (!bodyEvidenceTools.has(invocation.operationId) || !invocation.paperId || citedPaperIds.has(invocation.paperId)) {
      continue
    }
    const paper = findPaperById(invocation.paperId)
    if (!paper) continue
    citedPaperIds.add(paper.id)
    merged.push({
      paperId: paper.id,
      paperTitle: paper.title,
      snippet: '',
      score: null,
      evidenceType: 'tool'
    })
  }

  return merged
}

function findPaperByCitationTitle(
  citationTitle: string,
  findPaperByTitle: (title: string) => Paper | null
): Paper | null {
  const candidates = buildTitleCandidates(citationTitle)
  for (const candidate of candidates) {
    const paper = findPaperByTitle(candidate)
    if (paper) return paper
  }
  return null
}

function buildTitleCandidates(title: string): string[] {
  const trimmed = title.trim().replace(/\s+/g, ' ')
  const withoutExtension = trimmed.replace(/\.(pdf|md|markdown)$/i, '')
  return Array.from(new Set([trimmed, withoutExtension].filter(Boolean)))
}
