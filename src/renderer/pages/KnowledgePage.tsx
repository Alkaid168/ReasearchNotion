import { useEffect, useState, type JSX } from 'react'
import { Bot, FilePlus2, FileText, FolderClosed, PanelRightOpen } from 'lucide-react'
import { desktopApi } from '../api/desktopApi'
import { AiDrawer } from '../components/AiDrawer'
import { PaperReader } from '../components/PaperReader'
import type { Folder, Paper, PaperCard } from '../../shared/types'

type PaperRow = Paper & { card: PaperCard | null }

export function KnowledgePage(): JSX.Element {
  const [folders, setFolders] = useState<Folder[]>([])
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [papers, setPapers] = useState<PaperRow[]>([])
  const [activePaper, setActivePaper] = useState<Paper | null>(null)
  const [markdownText, setMarkdownText] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    let alive = true

    void desktopApi.folders.list().then((rows) => {
      if (!alive) return
      setFolders(rows)
      setActiveFolderId(rows[0]?.id ?? null)
    })

    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!activeFolderId) {
      setPapers([])
      return
    }

    let alive = true
    void desktopApi.papers.list(activeFolderId).then((rows) => {
      if (alive) setPapers(rows)
    })

    return () => {
      alive = false
    }
  }, [activeFolderId])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.ctrlKey && event.key.toLowerCase() === 'j') {
        event.preventDefault()
        setDrawerOpen((open) => !open)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  async function openPaper(paperId: string): Promise<void> {
    const result = await desktopApi.papers.read(paperId)
    setActivePaper(result.paper)
    setMarkdownText(result.markdownText)
  }

  async function importPaper(): Promise<void> {
    if (!activeFolderId) return
    await desktopApi.papers.import(activeFolderId)
    const rows = await desktopApi.papers.list(activeFolderId)
    setPapers(rows)
  }

  return (
    <div className="knowledge-layout">
      <aside className="knowledge-list">
        <header className="knowledge-sidebar-header">
          <h2>我的论文库</h2>
          <button type="button" aria-label="导入 PDF 或 Markdown" onClick={() => void importPaper()}>
            <FilePlus2 size={16} aria-hidden="true" />
          </button>
        </header>

        <section className="folder-list" aria-label="论文文件夹">
          {folders.length ? null : <p className="subtle-text">暂无论文文件夹。</p>}
          {folders.map((folder) => (
            <button
              key={folder.id}
              className={folder.id === activeFolderId ? 'folder-row active' : 'folder-row'}
              type="button"
              onClick={() => setActiveFolderId(folder.id)}
            >
              <FolderClosed size={15} aria-hidden="true" />
              <span>{folder.name}</span>
            </button>
          ))}
        </section>

        <section className="paper-list" aria-label="论文">
          <div className="knowledge-section-title">论文</div>
          {papers.length ? null : <p className="subtle-text">当前文件夹还没有论文。</p>}
          {papers.map((paper) => (
            <button key={paper.id} className="paper-row" type="button" onClick={() => void openPaper(paper.id)}>
              <FileText size={16} aria-hidden="true" />
              <span>
                <strong>{paper.title}</strong>
                <small>
                  {paper.fileType.toUpperCase()} · {paper.indexStatus}
                  {paper.card?.year ? ` · ${paper.card.year}` : ''}
                </small>
              </span>
            </button>
          ))}
        </section>

        <button className="import-button" type="button" onClick={() => void importPaper()} disabled={!activeFolderId}>
          <FilePlus2 size={16} aria-hidden="true" />
          导入 PDF / Markdown
        </button>
      </aside>

      <main className="reader-panel">
        <header className="reader-header">
          <div>
            <span>{activePaper?.title ?? '知识库'}</span>
            <small>{activePaper ? `${activePaper.fileType.toUpperCase()} · ${activePaper.indexStatus}` : '阅读器优先布局'}</small>
          </div>
          <button type="button" aria-label="打开 AI 问答栏" onClick={() => setDrawerOpen(true)}>
            <Bot size={16} aria-hidden="true" />
            <PanelRightOpen size={16} aria-hidden="true" />
          </button>
        </header>

        <PaperReader paper={activePaper} markdownText={markdownText} />
        <AiDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      </main>
    </div>
  )
}
