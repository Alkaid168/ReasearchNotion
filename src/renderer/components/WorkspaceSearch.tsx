import { useEffect, useMemo, useState, type JSX } from 'react'
import { FileText, Folder, MessageSquare, Search, X } from 'lucide-react'
import { desktopApi } from '../api/desktopApi'

type SearchItem =
  | { id: string; type: 'conversation'; title: string; detail: string }
  | { id: string; type: 'folder'; title: string; detail: string }
  | { id: string; type: 'paper'; title: string; detail: string; folderId: string }

type WorkspaceSearchProps = {
  open: boolean
  onClose: () => void
  onOpenConversation: (conversationId: string) => void
  onOpenFolder: (folderId: string) => void
  onOpenPaper: (paperId: string, folderId: string) => void
}

const typeLabel = {
  conversation: '对话',
  folder: '论文库',
  paper: '论文'
} as const

function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\-_./\\()[\]{}:;,'"`~!@#$%^&*+=?|<>]+/g, '')
}

export function WorkspaceSearch({
  open,
  onClose,
  onOpenConversation,
  onOpenFolder,
  onOpenPaper
}: WorkspaceSearchProps): JSX.Element | null {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<SearchItem[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (!open) return
    let alive = true
    setQuery('')
    setActiveIndex(0)
    setLoading(true)

    void Promise.all([desktopApi.conversations.list(), desktopApi.folders.list()])
      .then(async ([conversations, folders]) => {
        const paperGroups = await Promise.all(folders.map((folder) => desktopApi.papers.list(folder.id)))
        if (!alive) return
        const folderNames = new Map(folders.map((folder) => [folder.id, folder.name]))
        setItems([
          ...conversations.map<SearchItem>((conversation) => ({
            id: conversation.id,
            type: 'conversation',
            title: conversation.title,
            detail: '历史对话'
          })),
          ...folders.map<SearchItem>((folder) => ({
            id: folder.id,
            type: 'folder',
            title: folder.name,
            detail: '论文库'
          })),
          ...paperGroups.flat().map<SearchItem>((paper) => ({
            id: paper.id,
            type: 'paper',
            title: paper.title,
            detail: folderNames.get(paper.folderId) ?? '论文库',
            folderId: paper.folderId
          }))
        ])
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onWindowKeyDown(event: KeyboardEvent): void {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    window.addEventListener('keydown', onWindowKeyDown)
    return () => window.removeEventListener('keydown', onWindowKeyDown)
  }, [onClose, open])

  const results = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query)
    const filtered = normalizedQuery
      ? items.filter((item) => normalizeSearchText(`${item.title} ${item.detail}`).includes(normalizedQuery))
      : items
    return filtered.slice(0, 30)
  }, [items, query])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  function openItem(item: SearchItem): void {
    if (item.type === 'conversation') onOpenConversation(item.id)
    if (item.type === 'folder') onOpenFolder(item.id)
    if (item.type === 'paper') onOpenPaper(item.id, item.folderId)
    onClose()
  }

  if (!open) return null

  return (
    <div
      className="workspace-search-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="workspace-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="搜索工作区"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
          if (event.key === 'ArrowDown' && results.length) {
            event.preventDefault()
            setActiveIndex((index) => (index + 1) % results.length)
          }
          if (event.key === 'ArrowUp' && results.length) {
            event.preventDefault()
            setActiveIndex((index) => (index - 1 + results.length) % results.length)
          }
          if (event.key === 'Enter' && results[activeIndex]) {
            event.preventDefault()
            openItem(results[activeIndex])
          }
        }}
      >
        <header className="workspace-search-input-row">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="搜索工作区"
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索对话、论文或论文库"
          />
          <button type="button" aria-label="关闭搜索" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="workspace-search-results" aria-label="搜索结果">
          {loading ? <p>正在搜索...</p> : null}
          {!loading && results.length === 0 ? <p>没有匹配的内容</p> : null}
          {!loading
            ? results.map((item, index) => {
                const Icon = item.type === 'conversation' ? MessageSquare : item.type === 'paper' ? FileText : Folder
                return (
                  <button
                    key={`${item.type}:${item.id}`}
                    type="button"
                    aria-label={`打开${typeLabel[item.type]} ${item.title}`}
                    className={index === activeIndex ? 'active' : ''}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => openItem(item)}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <em>{typeLabel[item.type]}</em>
                  </button>
                )
              })
            : null}
        </div>
      </section>
    </div>
  )
}
