import { FileText, Trash2 } from 'lucide-react'
import type { DragEvent } from 'react'
import { filterLibraryPapers, paperMeta, type PaperRow } from './paperLibraryUtils'

type LibraryPaperBranchProps = {
  papers: PaperRow[]
  query: string
  loading: boolean
  activePaperId: string | null
  onOpenPaper: (paperId: string) => void
  onDeletePaper: (paperId: string) => void
  onPaperDragStart: (event: DragEvent<HTMLButtonElement>, paperId: string) => void
  onPaperDragEnd: () => void
}

export function LibraryPaperBranch({
  papers,
  query,
  loading,
  activePaperId,
  onOpenPaper,
  onDeletePaper,
  onPaperDragStart,
  onPaperDragEnd
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
        <div key={paper.id} className="library-paper-line" data-paper-row-id={paper.id}>
          <button
            className={activePaperId === paper.id ? 'library-paper-row active' : 'library-paper-row'}
            type="button"
            draggable
            onClick={() => onOpenPaper(paper.id)}
            onDragStart={(event) => onPaperDragStart(event, paper.id)}
            onDragEnd={onPaperDragEnd}
          >
            <FileText size={15} aria-hidden="true" />
            <span>
              <strong>{paper.title}</strong>
              <small>{paperMeta(paper)}</small>
            </span>
          </button>
          <button
            className="library-paper-delete"
            type="button"
            aria-label="从论文库删除"
            title={`删除论文《${paper.title}》`}
            onClick={() => {
              if (window.confirm(`确定删除论文《${paper.title}》吗？此操作需要你明确确认。`)) {
                onDeletePaper(paper.id)
              }
            }}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
}
