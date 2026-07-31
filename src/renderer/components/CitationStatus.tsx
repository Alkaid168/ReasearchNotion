import type { JSX } from 'react'
import type { Citation } from '../../shared/types'

type CitationStatusProps = {
  messageId: string
  citations: Citation[]
  onOpenCitation?: (citation: Citation) => void
}

function citationLabel(citation: Citation): string {
  return citation.pageNumber ? `${citation.paperTitle}，第 ${citation.pageNumber} 页` : citation.paperTitle
}

export function CitationStatus({ messageId, citations, onOpenCitation }: CitationStatusProps): JSX.Element {
  if (!citations.length) {
    return (
      <footer className="citation-status no-citations" aria-label="引用状态">
        <strong>通用分析</strong>
      </footer>
    )
  }

  return (
    <footer className="citation-status has-citations" aria-label="引用来源">
      {citations.map((citation, index) => {
        const key = `${messageId}-${citation.paperId ?? citation.paperTitle}-${citation.pageNumber ?? ''}-${index}`
        const label = citationLabel(citation)
        const title = citation.snippet || label
        const content = (
          <>
            <span>{citation.paperTitle}</span>
            {citation.pageNumber ? <small>第 {citation.pageNumber} 页</small> : null}
          </>
        )
        return citation.paperId && onOpenCitation ? (
          <button key={key} type="button" title={title} aria-label={label} onClick={() => onOpenCitation(citation)}>
            {content}
          </button>
        ) : (
          <span key={key} title={title}>
            {content}
          </span>
        )
      })}
    </footer>
  )
}
