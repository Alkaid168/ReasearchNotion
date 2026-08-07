import { FileText } from 'lucide-react'
import { filterLibraryPapers, paperMeta, type PaperRow } from './paperLibraryUtils'

type LibraryPaperBranchProps = {
  papers: PaperRow[]
  query: string
  loading: boolean
  activePaperId: string | null
  onOpenPaper: (paperId: string) => void
}

export function LibraryPaperBranch({
  papers,
  query,
  loading,
  activePaperId,
  onOpenPaper
}: LibraryPaperBranchProps) {
  const filteredPapers = filterLibraryPapers(papers, query)

  return (
    <div className="library-paper-branch">
      {loading ? <p className="subtle-text compact">正在载入论文...</p> : null}
      {!loading && papers.length === 0 ? <p className="subtle-text compact">当前文件夹还没有论文。</p> : null}
      {!loading && papers.length > 0 && filteredPapers.length === 0 ? (
        <p className="subtle-text compact">没有匹配的论文。</p>
      ) : null}
      {filteredPapers.map((paper) => (
        <button
          key={paper.id}
          className={activePaperId === paper.id ? 'library-paper-row active' : 'library-paper-row'}
          data-paper-row-id={paper.id}
          type="button"
          onClick={() => onOpenPaper(paper.id)}
        >
          <FileText size={15} aria-hidden="true" />
          <span>
            <strong>{paper.title}</strong>
            <small>{paperMeta(paper)}</small>
          </span>
        </button>
      ))}
    </div>
  )
}
