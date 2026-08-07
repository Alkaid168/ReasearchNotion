import type { Paper, PaperCard } from '../../shared/types'

export type PaperRow = Paper & { card: PaperCard | null }

export function filterLibraryPapers(papers: PaperRow[], queryValue: string): PaperRow[] {
  const query = queryValue.trim().toLowerCase()
  if (!query) return papers

  return papers.filter((paper) => {
    const searchableValues = [
      paper.title,
      paper.card?.oneSentenceSummary,
      paper.card?.authors,
      paper.card?.year,
      ...(paper.card?.keywords ?? [])
    ]
    return searchableValues.filter(Boolean).some((value) => String(value).toLowerCase().includes(query))
  })
}

export function paperMeta(paper: PaperRow): string {
  const fileTypeLabel = paper.fileType === 'markdown' ? 'Markdown' : 'PDF'
  return [fileTypeLabel, paper.card?.year].filter(Boolean).join(' ? ')
}
