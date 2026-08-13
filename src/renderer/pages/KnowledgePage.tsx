import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type JSX,
  type PointerEvent
} from 'react'
import {
  BookOpenText,
  Check,
  ChevronRight,
  FilePlus2,
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
import { LibraryPaperBranch } from './LibraryPaperBranch'
import type { PaperRow } from './paperLibraryUtils'
import { usePaperImport } from './usePaperImport'
import type { Folder, ModelProfile, Paper, PaperOutlineItem, PaperSearchResult } from '../../shared/types'

type KnowledgePageProps = {
  requestedPaperId?: string
  requestedFolderId?: string
  requestedPage?: number
  requestNonce?: number
  onNotify?: (message: string, tone?: 'success' | 'error') => void
  modelProfiles?: ModelProfile[]
  activeModelProfile?: ModelProfile | null
  onActivateModel?: (id: string) => void | Promise<void>
}

export function KnowledgePage({ requestedPaperId, requestedFolderId, requestedPage, requestNonce, onNotify, modelProfiles, activeModelProfile, onActivateModel }: KnowledgePageProps = {}): JSX.Element {
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
  const [importError, setImportError] = useState<string | null>(null)
  const [deleteConfirmPaperId, setDeleteConfirmPaperId] = useState<string | null>(null)
  const [deletingPaperId, setDeletingPaperId] = useState<string | null>(null)
  const [draggedPaperId, setDraggedPaperId] = useState<string | null>(null)
  const [paperDropTargetFolderId, setPaperDropTargetFolderId] = useState<string | null>(null)
  const [copyingTargetFolderId, setCopyingTargetFolderId] = useState<string | null>(null)
  const [paperSearchQuery, setPaperSearchQuery] = useState('')
  const activePaperRef = useRef<Paper | null>(null)
  const currentPageRef = useRef(1)
  const drawerOpenRef = useRef(false)
  const knowledgeResizeCleanupRef = useRef<(() => void) | null>(null)
  const outlinePaperIdRef = useRef<string | null>(null)
  const outlineRequestRef = useRef<Promise<void> | null>(null)

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
  const {
    importing,
    importQueue,
    dropActive,
    importPaper,
    clearImportQueue,
    onPaperDragEnter,
    onPaperDragOver,
    onPaperDragLeave,
    onPaperDrop
  } = usePaperImport({
    activeFolderId,
    loadFolderPapers,
    onNotify,
    onError: setImportError
  })

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
    outlinePaperIdRef.current = null
    outlineRequestRef.current = null
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

  }

  function loadActivePaperOutline(): void {
    const paperId = activePaperRef.current?.id
    if (!paperId || outlinePaperIdRef.current === paperId || outlineRequestRef.current) return

    outlineRequestRef.current = desktopApi.papers
      .getOutline(paperId)
      .then((outline) => {
        if (activePaperRef.current?.id !== paperId) return
        outlinePaperIdRef.current = paperId
        setPaperOutline(outline)
      })
      .catch(() => {
        if (activePaperRef.current?.id === paperId) setPaperOutline([])
      })
      .finally(() => {
        outlineRequestRef.current = null
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

  async function deletePaperFromLibrary(paperId: string): Promise<void> {
    if (deletingPaperId) return
    const paper = Object.values(papersByFolderId)
      .flat()
      .find((candidate) => candidate.id === paperId)
    if (!paper) return

    setDeletingPaperId(paperId)
    setImportError(null)
    try {
      await desktopApi.papers.delete(paperId)
      await loadFolderPapers(paper.folderId)
      if (activePaperRef.current?.id === paperId) clearActivePaper()
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '删除论文失败。')
    } finally {
      setDeletingPaperId(null)
    }
  }

  function loadedPaper(paperId: string): PaperRow | null {
    return Object.values(papersByFolderId)
      .flat()
      .find((candidate) => candidate.id === paperId) ?? null
  }

  function startPaperCopyDrag(event: DragEvent<HTMLButtonElement>, paperId: string): void {
    if (copyingTargetFolderId) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('application/x-research-notion-paper', paperId)
    setDraggedPaperId(paperId)
    setPaperDropTargetFolderId(null)
  }

  function finishPaperCopyDrag(): void {
    setDraggedPaperId(null)
    setPaperDropTargetFolderId(null)
  }

  function paperIdFromDrag(event: DragEvent<HTMLElement>): string | null {
    return draggedPaperId || event.dataTransfer.getData('application/x-research-notion-paper') || null
  }

  function markPaperCopyTarget(event: DragEvent<HTMLElement>, targetFolderId: string): void {
    const paperId = paperIdFromDrag(event)
    const sourcePaper = paperId ? loadedPaper(paperId) : null
    if (!sourcePaper || sourcePaper.folderId === targetFolderId || copyingTargetFolderId) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setPaperDropTargetFolderId(targetFolderId)
  }

  function leavePaperCopyTarget(event: DragEvent<HTMLElement>, targetFolderId: string): void {
    const nextTarget = event.relatedTarget
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return
    setPaperDropTargetFolderId((current) => (current === targetFolderId ? null : current))
  }

  async function copyPaperFromDrop(event: DragEvent<HTMLElement>, targetFolderId: string): Promise<void> {
    const paperId = paperIdFromDrag(event)
    const sourcePaper = paperId ? loadedPaper(paperId) : null
    if (!sourcePaper || sourcePaper.folderId === targetFolderId || copyingTargetFolderId) return

    event.preventDefault()
    event.stopPropagation()
    setDraggedPaperId(null)
    setPaperDropTargetFolderId(null)
    setCopyingTargetFolderId(targetFolderId)
    setImportError(null)
    setExpandedFolderIds((current) => {
      const next = new Set(current).add(targetFolderId)
      updateWorkspacePreferences({ knowledge: { expandedFolderIds: [...next] } })
      return next
    })

    try {
      const copiedPaper = await desktopApi.papers.copyToFolder(sourcePaper.id, targetFolderId)
      await loadFolderPapers(targetFolderId)
      const targetFolder = folders.find((folder) => folder.id === targetFolderId)
      onNotify?.(`已将《${copiedPaper.title}》复制到「${targetFolder?.name ?? '目标文件夹'}」。`, 'success')
    } catch (error) {
      setImportError(error instanceof Error ? error.message : '复制论文失败。')
    } finally {
      setCopyingTargetFolderId(null)
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
        onDragOver={onPaperDragOver}
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
            const isLoadingFolder = loadingFolderIds.has(folder.id)
            const isPaperDropTarget = paperDropTargetFolderId === folder.id
            const isCopyingHere = copyingTargetFolderId === folder.id
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
                  <div
                    className={`library-folder-line${isActive ? ' active' : ''}${isPaperDropTarget ? ' copy-drop-target' : ''}${isCopyingHere ? ' copying' : ''}`}
                    onDragEnter={(event) => markPaperCopyTarget(event, folder.id)}
                    onDragOver={(event) => markPaperCopyTarget(event, folder.id)}
                    onDragLeave={(event) => leavePaperCopyTarget(event, folder.id)}
                    onDrop={(event) => void copyPaperFromDrop(event, folder.id)}
                  >
                    <button
                      className={isActive ? 'library-folder-row active' : 'library-folder-row'}
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => toggleFolder(folder.id)}
                    >
                      <ChevronRight className={isExpanded ? 'folder-chevron open' : 'folder-chevron'} size={14} aria-hidden="true" />
                      {isExpanded ? <FolderOpen size={15} aria-hidden="true" /> : <FolderClosed size={15} aria-hidden="true" />}
                      <span>{folder.name}</span>
                      {isCopyingHere ? <small className="library-folder-copying">复制中</small> : null}
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
                  <LibraryPaperBranch
                    papers={folderPapers}
                    query={paperSearchQuery}
                    loading={isLoadingFolder}
                    activePaperId={activePaper?.id ?? null}
                    onOpenPaper={(paperId) => void openPaper(paperId)}
                    onDeletePaper={(paperId) => void deletePaperFromLibrary(paperId)}
                    onPaperDragStart={startPaperCopyDrag}
                    onPaperDragEnd={finishPaperCopyDrag}
                  />
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
                onClick={clearImportQueue}
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
                  {item.detail && (item.status === 'failed' || item.status === 'skipped') ? (
                    <span className="import-queue-detail">{item.detail}</span>
                  ) : null}
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
          onOutlineRequest={loadActivePaperOutline}
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
          modelProfiles={modelProfiles}
          activeModelProfile={activeModelProfile ?? null}
          onActivateModel={onActivateModel}
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
