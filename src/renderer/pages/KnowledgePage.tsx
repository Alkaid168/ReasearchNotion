import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type JSX, type PointerEvent } from 'react'
import {
  BookOpenText,
  Check,
  ChevronRight,
  FilePlus2,
  FileText,
  FolderClosed,
  FolderOpen,
  FolderPlus,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Search,
  Trash2,
  X
} from 'lucide-react'
import { desktopApi } from '../api/desktopApi'
import { AiDrawer, createEmptyAiDrawerSession, type AiDrawerSession } from '../components/AiDrawer'
import { PaperReader } from '../components/PaperReader'
import { readWorkspacePreferences, updateWorkspacePreferences, type PaperViewPreference } from '../state/workspacePreferences'
import type { Folder, Paper, PaperOutlineItem, PaperSearchResult } from '../../shared/types'

import {
  type ImportQueueItem,
  type PaperRow,
  containsFiles,
  normalizedPaperTitle,
  paperMeta,
  supportedPaperFile
} from './knowledgeHelpers'

type KnowledgePageProps = {
  requestedPaperId?: string
  requestedFolderId?: string
  requestedPage?: number
  requestNonce?: number
  onNotify?: (message: string, tone?: 'success' | 'error') => void
}

export function KnowledgePage({ requestedPaperId, requestedFolderId, requestedPage, requestNonce, onNotify }: KnowledgePageProps = {}): JSX.Element {
  const [initialPreferences] = useState(readWorkspacePreferences)
  const [folders, setFolders] = useState<Folder[]>([])
  const [activeFolderId, setActiveFolderId] = useState<string | null>(initialPreferences.knowledge.activeFolderId)
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
    () => new Set(initialPreferences.knowledge.expandedFolderIds)
  )
  const [papersByFolderId, setPapersByFolderId] = useState<Record<string, PaperRow[]>>({})
  const [loadingFolderIds, setLoadingFolderIds] = useState<Set<string>>(() => new Set())
  const [activePaper, setActivePaper] = useState<Paper | null>(null)
  const [markdownText, setMarkdownText] = useState<string | null>(null)
  const [plainText, setPlainText] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null)
  const [paperOutline, setPaperOutline] = useState<PaperOutlineItem[]>([])
  const [readerSearchResults, setReaderSearchResults] = useState<PaperSearchResult[]>([])
  const [readerSearching, setReaderSearching] = useState(false)
  const [readerSearchError, setReaderSearchError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(
    initialPreferences.knowledge.activePaperId
      ? (initialPreferences.knowledge.paperViews[initialPreferences.knowledge.activePaperId]?.page ?? 1)
      : 1
  )
  const [paperViews, setPaperViews] = useState<Record<string, PaperViewPreference>>(
    initialPreferences.knowledge.paperViews
  )
  const [focusMode, setFocusMode] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [emphasisContext, setEmphasisContext] = useState<string | null>(null)
  const [drawerSessions, setDrawerSessions] = useState<Record<string, AiDrawerSession>>({})
  const [drawerWidth, setDrawerWidth] = useState(380)
  const [knowledgeSidebarWidth, setKnowledgeSidebarWidth] = useState(initialPreferences.knowledge.sidebarWidth)
  const [knowledgeSidebarCollapsed, setKnowledgeSidebarCollapsed] = useState(initialPreferences.knowledge.sidebarCollapsed)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [folderError, setFolderError] = useState<string | null>(null)
  const [folderSubmitting, setFolderSubmitting] = useState(false)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState('')
  const [deleteConfirmFolderId, setDeleteConfirmFolderId] = useState<string | null>(null)
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importQueue, setImportQueue] = useState<ImportQueueItem[]>([])
  const [dropActive, setDropActive] = useState(false)
  const [deleteConfirmPaperId, setDeleteConfirmPaperId] = useState<string | null>(null)
  const [deletingPaperId, setDeletingPaperId] = useState<string | null>(null)
  const [paperSearchQuery, setPaperSearchQuery] = useState('')
  const activePaperRef = useRef<Paper | null>(null)
  const currentPageRef = useRef(1)
  const drawerOpenRef = useRef(false)
  const dragDepthRef = useRef(0)
  const knowledgeResizeCleanupRef = useRef<(() => void) | null>(null)

  activePaperRef.current = activePaper
  currentPageRef.current = currentPage
  drawerOpenRef.current = drawerOpen

  useEffect(() => {
    if (!activePaper?.id) return

    const frame = window.requestAnimationFrame(() => {
      const activeRow = document.querySelector<HTMLElement>(`[data-paper-row-id="${activePaper.id}"]`)
      if (typeof activeRow?.scrollIntoView === 'function') {
        activeRow.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      }
    })

    return () => window.cancelAnimationFrame(frame)
  }, [activePaper?.id])

  const activeFolder = useMemo(
    () => folders.find((folder) => folder.id === activeFolderId) ?? null,
    [activeFolderId, folders]
  )
  const activeFolderPapers = activeFolderId ? (papersByFolderId[activeFolderId] ?? []) : []

  function filteredPapersFor(folderId: string): PaperRow[] {
    const query = paperSearchQuery.trim().toLowerCase()
    return (papersByFolderId[folderId] ?? []).filter((paper) => {
      const searchableValues = [
        paper.title,
        paper.card?.oneSentenceSummary,
        paper.card?.authors,
        paper.card?.year,
        ...(paper.card?.keywords ?? [])
      ]
      const matchesQuery =
        !query || searchableValues.filter(Boolean).some((value) => String(value).toLowerCase().includes(query))
      return matchesQuery
    })
  }

  async function loadFolderPapers(folderId: string): Promise<PaperRow[]> {
    setLoadingFolderIds((current) => new Set(current).add(folderId))
    try {
      const rows = await desktopApi.papers.list(folderId)
      setPapersByFolderId((current) => ({ ...current, [folderId]: rows }))
      return rows
    } finally {
      setLoadingFolderIds((current) => {
        const next = new Set(current)
        next.delete(folderId)
        return next
      })
    }
  }

  useEffect(() => {
    let alive = true

    void desktopApi.folders.list().then(async (rows) => {
      if (!alive) return
      setFolders(rows)
      const preferredFolderId = initialPreferences.knowledge.activeFolderId
      const nextActiveFolderId = rows.some((folder) => folder.id === preferredFolderId)
        ? preferredFolderId
        : (rows[0]?.id ?? null)
      const validFolderIds = new Set(rows.map((folder) => folder.id))
      const nextExpandedFolderIds = new Set(
        initialPreferences.knowledge.expandedFolderIds.filter((folderId) => validFolderIds.has(folderId))
      )
      if (nextActiveFolderId) nextExpandedFolderIds.add(nextActiveFolderId)
      setActiveFolderId(nextActiveFolderId)
      setExpandedFolderIds(nextExpandedFolderIds)

      const foldersToLoad = [...nextExpandedFolderIds]
      const loadedGroups = await Promise.all(
        foldersToLoad.map(async (folderId) => ({ folderId, papers: await loadFolderPapers(folderId) }))
      )
      if (!alive) return
      const preferredPaperId = initialPreferences.knowledge.activePaperId
      const preferredPaperExists = loadedGroups.some(({ papers }) => papers.some((paper) => paper.id === preferredPaperId))
      if (preferredPaperId && preferredPaperExists) {
        await openPaper(preferredPaperId)
      } else {
        updateWorkspacePreferences({
          knowledge: {
            activeFolderId: nextActiveFolderId,
            activePaperId: null,
            expandedFolderIds: [...nextExpandedFolderIds]
          }
        })
      }
    })

    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'b') return
      event.preventDefault()
      setKnowledgeSidebarCollapsed((current) => {
        const next = !current
        updateWorkspacePreferences({ knowledge: { sidebarCollapsed: next } })
        return next
      })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => () => knowledgeResizeCleanupRef.current?.(), [])

  useEffect(() => {
    if (!requestNonce) return
    if (requestedFolderId) {
      setActiveFolderId(requestedFolderId)
      setExpandedFolderIds((current) => new Set(current).add(requestedFolderId))
      if (!papersByFolderId[requestedFolderId]) void loadFolderPapers(requestedFolderId)
    }
    if (requestedPaperId) void openPaper(requestedPaperId, requestedPage)
  }, [requestNonce])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!event.ctrlKey || event.key.toLowerCase() !== 'i' || !activePaperRef.current) return

      event.preventDefault()
      if (drawerOpenRef.current) {
        drawerOpenRef.current = false
        setDrawerOpen(false)
        return
      }

      const selectedText = window.getSelection()?.toString().trim()
      setEmphasisContext(selectedText || null)
      void desktopApi.reading.updateState({
        activeFolderId: activePaperRef.current.folderId,
        activePaperId: activePaperRef.current.id,
        currentPage: currentPageRef.current,
        selectedText: selectedText || null
      })
      drawerOpenRef.current = true
      setDrawerOpen(true)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const paperId = activePaper?.id
    if (!drawerOpen || !paperId || drawerSessions[paperId]) return

    let alive = true
    void desktopApi.conversations
      .list()
      .then(async (conversations) => {
        const conversation = conversations
          .filter((candidate) => candidate.context.type === 'paper' && candidate.context.paperId === paperId)
          .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0]
        const messages = conversation ? await desktopApi.messages.list(conversation.id) : []
        if (!alive) return
        setDrawerSessions((current) =>
          current[paperId]
            ? current
            : {
                ...current,
                [paperId]: {
                  conversationId: conversation?.id ?? null,
                  messages,
                  draft: ''
                }
              }
        )
      })
      .catch(() => {
        if (!alive) return
        setDrawerSessions((current) => (current[paperId] ? current : { ...current, [paperId]: createEmptyAiDrawerSession() }))
      })

    return () => {
      alive = false
    }
  }, [activePaper?.id, drawerOpen, drawerSessions])

  async function openPaper(paperId: string, targetPage?: number): Promise<void> {
    const result = await desktopApi.papers.read(paperId)
    const savedView = paperViews[paperId]
    const pageToOpen = targetPage && Number.isFinite(targetPage) ? Math.max(1, Math.round(targetPage)) : (savedView?.page ?? 1)
    activePaperRef.current = result.paper
    setActivePaper(result.paper)
    setActiveFolderId(result.paper.folderId)
    setExpandedFolderIds((current) => new Set(current).add(result.paper.folderId))
    setMarkdownText(result.markdownText)
    setPlainText(result.plainText)
    setPreviewUrl(result.previewUrl)
    setPdfData(result.pdfData)
    setPaperOutline([])
    setReaderSearchResults([])
    setReaderSearching(false)
    setReaderSearchError(null)
    setCurrentPage(pageToOpen)
    if (targetPage) {
      setPaperViews((current) => {
        const next = {
          ...current,
          [paperId]: { page: pageToOpen, scale: current[paperId]?.scale ?? 1.12 }
        }
        updateWorkspacePreferences({ knowledge: { paperViews: next } })
        return next
      })
    }
    updateWorkspacePreferences({
      knowledge: {
        activeFolderId: result.paper.folderId,
        activePaperId: result.paper.id,
        expandedFolderIds: [...new Set([...expandedFolderIds, result.paper.folderId])]
      }
    })
    void desktopApi.reading.updateState({
      activeFolderId: result.paper.folderId,
      activePaperId: result.paper.id,
      currentPage: pageToOpen,
      selectedText: null
    })
    drawerOpenRef.current = false
    setDrawerOpen(false)
    setEmphasisContext(null)
    setDeleteConfirmPaperId(null)

    void desktopApi.papers
      .getOutline(result.paper.id)
      .then((outline) => {
        if (activePaperRef.current?.id === result.paper.id) setPaperOutline(outline)
      })
      .catch(() => {
        if (activePaperRef.current?.id === result.paper.id) setPaperOutline([])
      })
  }

  async function searchActivePaper(query: string): Promise<void> {
    const paper = activePaperRef.current
    if (!paper) return

    setReaderSearching(true)
    setReaderSearchError(null)
    try {
      const results = await desktopApi.papers.searchText(paper.id, query)
      if (activePaperRef.current?.id === paper.id) setReaderSearchResults(results)
    } catch (error) {
      if (activePaperRef.current?.id !== paper.id) return
      setReaderSearchResults([])
      setReaderSearchError(error instanceof Error ? error.message : '搜索论文失败。')
    } finally {
      if (activePaperRef.current?.id === paper.id) setReaderSearching(false)
    }
  }

  async function importPaper(): Promise<void> {
    if (!activeFolderId || importing) return

    setImporting(true)
    setImportError(null)
    try {
      const importedPapers = await desktopApi.papers.import(activeFolderId)
      await loadFolderPapers(activeFolderId)
      if (importedPapers.length === 1) onNotify?.(`已导入「${importedPapers[0].title}」`, 'success')
      else onNotify?.(`已导入 ${importedPapers.length} 篇论文`, 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : '导入论文失败。'
      setImportError(message)
      onNotify?.(message, 'error')
    } finally {
      setImporting(false)
    }
  }

  function updateImportQueueItem(id: string, update: Partial<ImportQueueItem>): void {
    setImportQueue((current) => current.map((item) => (item.id === id ? { ...item, ...update } : item)))
  }

  async function importDroppedFiles(folderId: string, files: File[]): Promise<void> {
    const existingTitles = new Set(activeFolderPapers.map((paper) => normalizedPaperTitle(paper.title)))
    const incomingTitles = new Set<string>()
    const items = files.map((file, index) => {
      const title = normalizedPaperTitle(file.name)
      const duplicate = existingTitles.has(title) || incomingTitles.has(title)
      incomingTitles.add(title)
      return {
        id: `import-${Date.now()}-${index}`,
        fileName: file.name,
        status: duplicate ? 'skipped' : 'queued',
        detail: duplicate ? '当前论文库或本次导入中已有同名论文。' : undefined
      } satisfies ImportQueueItem
    })
    setImportQueue(items)

    let importedCount = 0
    let failedCount = 0
    for (const [index, file] of files.entries()) {
      const item = items[index]
      if (item.status === 'skipped') continue
      updateImportQueueItem(item.id, { status: 'importing' })
      try {
        const imported = await desktopApi.papers.importFiles(folderId, [file])
        const importedPaper = imported[0]
        if (!importedPaper) throw new Error('导入没有返回论文记录。')
        existingTitles.add(normalizedPaperTitle(importedPaper.title))
        importedCount += 1
        updateImportQueueItem(item.id, { status: 'imported' })
      } catch (error) {
        failedCount += 1
        updateImportQueueItem(item.id, {
          status: 'failed',
          detail: error instanceof Error ? error.message : '导入失败。'
        })
      }
    }

    await loadFolderPapers(folderId)
    if (failedCount > 0) setImportError(`${failedCount} 个文件导入失败。`)
    if (importedCount > 0) onNotify?.(importedCount === 1 ? '已导入 1 篇论文' : `已导入 ${importedCount} 篇论文`, 'success')
  }

  function onPaperDragEnter(event: DragEvent<HTMLElement>): void {
    if (!containsFiles(event)) return
    event.preventDefault()
    dragDepthRef.current += 1
    setDropActive(true)
  }

  function onPaperDragLeave(event: DragEvent<HTMLElement>): void {
    if (!containsFiles(event)) return
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDropActive(false)
  }

  async function onPaperDrop(event: DragEvent<HTMLElement>): Promise<void> {
    event.preventDefault()
    dragDepthRef.current = 0
    setDropActive(false)
    if (!activeFolderId || importing) return

    const files = Array.from(event.dataTransfer.files)
    if (files.length === 0) return
    if (files.some((file) => !supportedPaperFile(file))) {
      setImportError('仅支持 PDF、Markdown（.md / .markdown）文件。')
      return
    }

    setImporting(true)
    setImportError(null)
    try {
      await importDroppedFiles(activeFolderId, files)
    } finally {
      setImporting(false)
    }
  }

  function clearActivePaper(): void {
    setActivePaper(null)
    setMarkdownText(null)
    setPlainText(null)
    setPreviewUrl(null)
    setPdfData(null)
    setCurrentPage(1)
    void desktopApi.reading.updateState({
      activeFolderId,
      activePaperId: null,
      currentPage: 1,
      selectedText: null
    })
    setDrawerOpen(false)
    setEmphasisContext(null)
    setFocusMode(false)
    updateWorkspacePreferences({ knowledge: { activeFolderId, activePaperId: null } })
  }

  async function deleteActivePaper(): Promise<void> {
    if (!activePaper || deletingPaperId) return

    setDeletingPaperId(activePaper.id)
    setImportError(null)
    try {
      await desktopApi.papers.delete(activePaper.id)
      await loadFolderPapers(activePaper.folderId)
      clearActivePaper()
      setDeleteConfirmPaperId(null)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '删除论文失败。')
    } finally {
      setDeletingPaperId(null)
    }
  }

  async function createFolder(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    const name = folderName.trim()
    if (!name) {
      setFolderError('请输入论文库名称')
      return
    }

    setFolderSubmitting(true)
    setFolderError(null)

    try {
      const folder = await desktopApi.folders.create(name, null)
      setFolders((current) => [...current, folder])
      setActiveFolderId(folder.id)
      setExpandedFolderIds((current) => {
        const next = new Set(current).add(folder.id)
        updateWorkspacePreferences({
          knowledge: { activeFolderId: folder.id, expandedFolderIds: [...next] }
        })
        return next
      })
      setPapersByFolderId((current) => ({ ...current, [folder.id]: [] }))
      setFolderName('')
      setCreatingFolder(false)
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : '创建论文库失败')
    } finally {
      setFolderSubmitting(false)
    }
  }

  async function renameFolder(event: FormEvent<HTMLFormElement>, folderId: string): Promise<void> {
    event.preventDefault()

    const name = editingFolderName.trim()
    if (!name) return

    const folder = await desktopApi.folders.rename(folderId, name)
    setFolders((current) => current.map((row) => (row.id === folder.id ? folder : row)))
    setEditingFolderId(null)
    setEditingFolderName('')
  }

  async function deleteFolder(folderId: string): Promise<void> {
    if (deletingFolderId) return

    setDeletingFolderId(folderId)
    setImportError(null)
    try {
      await desktopApi.folders.delete(folderId)
      setExpandedFolderIds((current) => {
        const next = new Set(current)
        next.delete(folderId)
        return next
      })
      setPapersByFolderId((current) => {
        const next = { ...current }
        delete next[folderId]
        return next
      })
      const remainingFolders = folders.filter((folder) => folder.id !== folderId)
      const nextActiveFolderId = activeFolderId === folderId ? (remainingFolders[0]?.id ?? null) : activeFolderId
      setFolders(remainingFolders)
      if (activeFolderId === folderId) {
        setActiveFolderId(nextActiveFolderId)
        if (nextActiveFolderId) {
          setExpandedFolderIds((current) => new Set(current).add(nextActiveFolderId))
          if (!papersByFolderId[nextActiveFolderId]) void loadFolderPapers(nextActiveFolderId)
        }
      }
      if (activeFolderId === folderId || activePaper?.folderId === folderId) {
        clearActivePaper()
      }
      setDeleteConfirmFolderId(null)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '删除论文库失败。')
    } finally {
      setDeletingFolderId(null)
    }
  }

  function resizeKnowledgeSidebar(event: PointerEvent<HTMLButtonElement>): void {
    if (event.button !== 0) return
    event.preventDefault()
    knowledgeResizeCleanupRef.current?.()
    const onPointerMove = (moveEvent: globalThis.PointerEvent): void => {
      const width = Math.min(360, Math.max(220, Math.round(moveEvent.clientX)))
      setKnowledgeSidebarWidth(width)
      updateWorkspacePreferences({ knowledge: { sidebarWidth: width } })
    }
    const stopResize = (): void => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stopResize)
      window.removeEventListener('pointercancel', stopResize)
      knowledgeResizeCleanupRef.current = null
    }
    knowledgeResizeCleanupRef.current = stopResize
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)
  }

  function toggleFolder(folderId: string): void {
    if (activePaperRef.current?.folderId !== folderId) clearActivePaper()
    setActiveFolderId(folderId)
    setExpandedFolderIds((current) => {
      const next = new Set(current)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
        if (!papersByFolderId[folderId]) void loadFolderPapers(folderId)
      }
      updateWorkspacePreferences({ knowledge: { activeFolderId: folderId, expandedFolderIds: [...next] } })
      return next
    })
  }

  return (
    <div
      className={`knowledge-layout${focusMode ? ' focus-mode' : ''}${knowledgeSidebarCollapsed ? ' sidebar-collapsed' : ''}`}
      style={{ '--knowledge-sidebar-width': `${knowledgeSidebarWidth}px` } as CSSProperties}
    >
      <aside
        className={dropActive ? 'knowledge-list drag-active' : 'knowledge-list'}
        aria-label="论文拖放导入区"
        onDragEnter={onPaperDragEnter}
        onDragOver={(event) => {
          if (!containsFiles(event)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }}
        onDragLeave={onPaperDragLeave}
        onDrop={(event) => void onPaperDrop(event)}
      >
        {dropActive ? (
          <div className="paper-drop-overlay" aria-live="polite">
            <FilePlus2 size={18} aria-hidden="true" />
            <span>松开以导入到「{activeFolder?.name ?? '当前论文库'}」</span>
          </div>
        ) : null}
        <header className="knowledge-sidebar-header">
          <div>
            <h2>我的论文库</h2>
          </div>
          <div className="knowledge-sidebar-actions">
            <button
              type="button"
              aria-label="收起论文库侧栏"
              title="收起论文库侧栏 (Ctrl+B)"
              onClick={() => {
                setKnowledgeSidebarCollapsed(true)
                updateWorkspacePreferences({ knowledge: { sidebarCollapsed: true } })
              }}
            >
              <PanelLeftClose size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="新建论文库"
              onClick={() => {
                setCreatingFolder(true)
                setFolderError(null)
              }}
            >
              <FolderPlus size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={importing ? '正在导入...' : '导入 PDF 或 Markdown'}
              onClick={() => void importPaper()}
              disabled={!activeFolderId || importing}
            >
              <FilePlus2 size={16} aria-hidden="true" />
            </button>
          </div>
        </header>

        {creatingFolder ? (
          <form className="folder-create-form" onSubmit={(event) => void createFolder(event)}>
            <input
              aria-label="论文库名称"
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="论文库名称"
              autoFocus
            />
            <div className="folder-create-actions">
              <button type="submit" disabled={folderSubmitting || !folderName.trim()}>
                创建
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreatingFolder(false)
                  setFolderName('')
                  setFolderError(null)
                }}
              >
                取消
              </button>
            </div>
            {folderError ? <p role="alert">{folderError}</p> : null}
          </form>
        ) : null}

        <div className="library-filter-bar">
          <label className="library-search">
            <Search size={14} aria-hidden="true" />
            <input
              aria-label="搜索论文"
              value={paperSearchQuery}
              onChange={(event) => setPaperSearchQuery(event.target.value)}
              placeholder="搜索论文"
            />
          </label>
        </div>

        <section className="library-tree" aria-label="论文文件夹">
          {folders.length ? null : <p className="subtle-text">暂无论文文件夹。</p>}
          {folders.map((folder) => {
            const isActive = folder.id === activeFolderId
            const isExpanded = expandedFolderIds.has(folder.id)
            const folderPapers = papersByFolderId[folder.id] ?? []
            const filteredPapers = filteredPapersFor(folder.id)
            const isLoadingFolder = loadingFolderIds.has(folder.id)
            return (
              <div className="library-folder-block" key={folder.id}>
                {editingFolderId === folder.id ? (
                  <form className="library-folder-inline-form" onSubmit={(event) => void renameFolder(event, folder.id)}>
                    <input
                      aria-label="论文库名称"
                      value={editingFolderName}
                      onChange={(event) => setEditingFolderName(event.target.value)}
                      autoFocus
                    />
                    <button type="submit" aria-label="保存论文库名称" disabled={!editingFolderName.trim()}>
                      <Check size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label="取消重命名论文库"
                      onClick={() => {
                        setEditingFolderId(null)
                        setEditingFolderName('')
                      }}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </form>
                ) : (
                  <div className={isActive ? 'library-folder-line active' : 'library-folder-line'}>
                    <button
                      className={isActive ? 'library-folder-row active' : 'library-folder-row'}
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => toggleFolder(folder.id)}
                    >
                      <ChevronRight className={isExpanded ? 'folder-chevron open' : 'folder-chevron'} size={14} aria-hidden="true" />
                      {isExpanded ? <FolderOpen size={15} aria-hidden="true" /> : <FolderClosed size={15} aria-hidden="true" />}
                      <span>{folder.name}</span>
                    </button>
                    <button
                      className="library-row-icon-button"
                      type="button"
                      aria-label={`重命名 ${folder.name}`}
                      onClick={() => {
                        setEditingFolderId(folder.id)
                        setEditingFolderName(folder.name)
                        setDeleteConfirmFolderId(null)
                      }}
                    >
                      <Pencil size={13} aria-hidden="true" />
                    </button>
                    <button
                      className="library-row-icon-button danger"
                      type="button"
                      aria-label={`删除 ${folder.name}`}
                      onClick={() => {
                        setDeleteConfirmFolderId(folder.id)
                        setEditingFolderId(null)
                        setEditingFolderName('')
                      }}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  </div>
                )}

                {deleteConfirmFolderId === folder.id ? (
                  <div className="library-folder-confirm-row">
                    <button
                      type="button"
                      className="danger-button compact"
                      onClick={() => void deleteFolder(folder.id)}
                      disabled={deletingFolderId === folder.id}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      {deletingFolderId === folder.id ? '删除中...' : '确认删除论文库'}
                    </button>
                    <button
                      type="button"
                      className="quiet-icon-button compact"
                      aria-label="取消删除论文库"
                      onClick={() => setDeleteConfirmFolderId(null)}
                      disabled={deletingFolderId === folder.id}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                ) : null}

                {isExpanded ? (
                  <div className="library-paper-branch">
                    {isLoadingFolder ? <p className="subtle-text compact">正在载入论文...</p> : null}
                    {!isLoadingFolder && folderPapers.length === 0 ? (
                      <p className="subtle-text compact">当前文件夹还没有论文。</p>
                    ) : null}
                    {!isLoadingFolder && folderPapers.length > 0 && filteredPapers.length === 0 ? (
                      <p className="subtle-text compact">没有匹配的论文。</p>
                    ) : null}
                    {filteredPapers.map((paper) => (
                      <button
                        key={paper.id}
                        className={activePaper?.id === paper.id ? 'library-paper-row active' : 'library-paper-row'}
                        data-paper-row-id={paper.id}
                        type="button"
                        onClick={() => void openPaper(paper.id)}
                      >
                        <FileText size={15} aria-hidden="true" />
                        <span>
                          <strong>{paper.title}</strong>
                          <small>{paperMeta(paper)}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </section>

        <div className="knowledge-sidebar-foot">
          <div className="knowledge-folder-summary">
            <BookOpenText size={15} aria-hidden="true" />
            <span>{activeFolder ? `${activeFolderPapers.length} 篇论文` : '未选择论文库'}</span>
          </div>
          {importError ? (
            <p className="knowledge-import-error" role="alert">
              {importError}
            </p>
          ) : null}
          {importQueue.length ? (
            <section className="import-queue" aria-label="导入队列">
              <button
                className="import-queue-clear"
                type="button"
                aria-label="清除导入记录"
                title="清除导入记录"
                disabled={importing}
                onClick={() => setImportQueue([])}
              >
                <X size={14} aria-hidden="true" />
              </button>
              {importQueue.map((item) => (
                <div key={item.id} className={`import-queue-item ${item.status}`} title={item.detail}>
                  <span>{item.fileName}</span>
                  <small>
                    {item.status === 'queued' ? '等待导入' : null}
                    {item.status === 'importing' ? '正在导入' : null}
                    {item.status === 'imported' ? '已导入' : null}
                    {item.status === 'skipped' ? '已跳过重复文件' : null}
                    {item.status === 'failed' ? '导入失败' : null}
                  </small>
                </div>
              ))}
            </section>
          ) : null}
          {activePaper ? (
            deleteConfirmPaperId === activePaper.id ? (
              <div className="danger-confirm-row">
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => void deleteActivePaper()}
                  disabled={deletingPaperId === activePaper.id}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  {deletingPaperId === activePaper.id ? '删除中...' : '确认删除'}
                </button>
                <button
                  className="quiet-icon-button"
                  type="button"
                  aria-label="取消删除"
                  onClick={() => setDeleteConfirmPaperId(null)}
                  disabled={deletingPaperId === activePaper.id}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <>
                <button
                  className="import-button"
                  type="button"
                  aria-label="重新索引（重建向量）"
                  title="重建向量索引（用于向量检索召回）"
                  onClick={async () => {
                    if (!activePaper) return
                    try {
                      await desktopApi.papers.reindex(activePaper.id)
                      window.alert(`${activePaper.title} 已重新索引，向量检索应已恢复。`)
                    } catch (error) {
                      window.alert('重新索引失败: ' + (error instanceof Error ? error.message : String(error)))
                    }
                  }}
                >
                  重新索引
                </button>
                <button className="import-button danger-ghost" type="button" onClick={() => setDeleteConfirmPaperId(activePaper.id)}>
                  <Trash2 size={16} aria-hidden="true" />
                  删除论文
                </button>
              </>
            )
          ) : null}
          <button className="import-button" type="button" onClick={() => void importPaper()} disabled={!activeFolderId || importing}>
            <FilePlus2 size={16} aria-hidden="true" />
            {importing ? '正在导入...' : '导入 PDF / Markdown'}
          </button>
        </div>
      </aside>

      <button
        className="knowledge-sidebar-resize-handle"
        type="button"
        aria-label="调整论文库侧栏宽度"
        title="拖动调整论文库侧栏宽度"
        onPointerDown={resizeKnowledgeSidebar}
      />

      <main className="reader-panel">
        {!focusMode ? (
          <button
            className="knowledge-sidebar-toggle"
            type="button"
            aria-label={knowledgeSidebarCollapsed ? '展开论文库侧栏' : '收起论文库侧栏'}
            title={knowledgeSidebarCollapsed ? '展开论文库侧栏 (Ctrl+B)' : '收起论文库侧栏 (Ctrl+B)'}
            onClick={() => {
              const next = !knowledgeSidebarCollapsed
              setKnowledgeSidebarCollapsed(next)
              updateWorkspacePreferences({ knowledge: { sidebarCollapsed: next } })
            }}
          >
            {knowledgeSidebarCollapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
          </button>
        ) : null}
        <PaperReader
          paper={activePaper}
          markdownText={markdownText}
          plainText={plainText}
          previewUrl={previewUrl}
          pdfData={pdfData}
          outline={paperOutline}
          searchResults={readerSearchResults}
          searching={readerSearching}
          searchError={readerSearchError}
          onSearch={(query) => void searchActivePaper(query)}
          initialPage={activePaper ? paperViews[activePaper.id]?.page : undefined}
          initialScale={activePaper ? paperViews[activePaper.id]?.scale : undefined}
          focusMode={focusMode}
          onFocusModeChange={setFocusMode}
          onPageChange={(pageNumber) => {
            setCurrentPage(pageNumber)
            if (!activePaperRef.current) return
            void desktopApi.reading.updateState({
              activeFolderId: activePaperRef.current.folderId,
              activePaperId: activePaperRef.current.id,
              currentPage: pageNumber,
              selectedText: emphasisContext
            })
          }}
          onViewStateChange={(view) => {
            if (!activePaperRef.current) return
            const paperId = activePaperRef.current.id
            setPaperViews((current) => {
              const next = { ...current, [paperId]: view }
              updateWorkspacePreferences({ knowledge: { paperViews: next } })
              return next
            })
          }}
        />
        <AiDrawer
          open={drawerOpen}
          paper={activePaper}
          emphasisContext={emphasisContext}
          session={activePaper ? (drawerSessions[activePaper.id] ?? createEmptyAiDrawerSession()) : createEmptyAiDrawerSession()}
          setSession={(update) => {
            if (!activePaperRef.current) return
            const paperId = activePaperRef.current.id
            setDrawerSessions((current) => {
              const previous = current[paperId] ?? createEmptyAiDrawerSession()
              const next = typeof update === 'function' ? update(previous) : update
              return { ...current, [paperId]: next }
            })
          }}
          width={drawerWidth}
          onWidthChange={setDrawerWidth}
          onClearEmphasisContext={() => {
            setEmphasisContext(null)
            if (!activePaperRef.current) return
            void desktopApi.reading.updateState({
              activeFolderId: activePaperRef.current.folderId,
              activePaperId: activePaperRef.current.id,
              currentPage: currentPageRef.current,
              selectedText: null
            })
          }}
          onClose={() => setDrawerOpen(false)}
          onOpenCitation={(citation) => {
            if (!citation.paperId) return
            void openPaper(citation.paperId, citation.pageNumber ?? undefined)
          }}
        />
      </main>
    </div>
  )
}
