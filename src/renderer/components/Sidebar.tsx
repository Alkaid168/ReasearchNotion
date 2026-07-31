import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type FormEvent,
  type JSX,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from 'react'
import {
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  GripVertical,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X
} from 'lucide-react'
import { desktopApi } from '../api/desktopApi'
import researchNotionMark from '../assets/research-notion-mark.svg'
import { readWorkspacePreferences, updateWorkspacePreferences } from '../state/workspacePreferences'
import type { Conversation, ConversationFolder } from '../../shared/types'

type SidebarProps = {
  selectedConversationId?: string | null
  selectedConversationFolderId?: string | null
  refreshKey?: number
  difyStatusLabel?: string
  difyStatusTone?: 'neutral' | 'ready' | 'error'
  onSelectConversation?: (conversationId: string) => void
  onSelectConversationFolder?: (folderId: string | null) => void
  onNewConversation?: () => void
  onOpenSearch?: () => void
}

type InsertPosition = 'before' | 'after'

type DropTarget =
  | { type: 'outside' }
  | { type: 'conversation'; id: string; position: InsertPosition }
  | { type: 'folder'; id: string; position: InsertPosition }
  | null

type DragSource = { type: 'conversation'; id: string } | { type: 'folder'; id: string }

type PointerDragState = {
  source: DragSource
  pointerId: number
  startX: number
  startY: number
  active: boolean
  target: DropTarget
}

type MouseDragState = Omit<PointerDragState, 'pointerId'>

type ConversationContextMenu = {
  conversationId: string
  x: number
  y: number
} | null

function insertRelative<T extends { id: string }>(
  rows: T[],
  draggedId: string,
  targetId: string,
  position: InsertPosition
): T[] {
  if (draggedId === targetId) return rows
  const dragged = rows.find((row) => row.id === draggedId)
  if (!dragged) return rows

  const withoutDragged = rows.filter((row) => row.id !== draggedId)
  const targetIndex = withoutDragged.findIndex((row) => row.id === targetId)
  if (targetIndex === -1) return rows

  const insertionIndex = position === 'before' ? targetIndex : targetIndex + 1
  return [...withoutDragged.slice(0, insertionIndex), dragged, ...withoutDragged.slice(insertionIndex)]
}

function sameConversationGroup(conversation: Conversation, folderId: string | null): boolean {
  return conversation.conversationFolderId === folderId
}

function insertionPosition(
  element: HTMLElement,
  clientY: number,
  source?: DragSource,
  sourceOrder?: string[]
): InsertPosition {
  const kind = element.dataset.dropKind
  const id = element.dataset.dropId
  const group = element.dataset.dropGroup
  if (source && sourceOrder && kind === source.type && id !== source.id && group !== undefined) {
    const sourceIndex = sourceOrder.indexOf(source.id)
    const targetIndex = sourceOrder.indexOf(id ?? '')
    if (sourceIndex !== -1 && targetIndex !== -1) {
      return sourceIndex > targetIndex ? 'before' : 'after'
    }
  }

  const rect = element.getBoundingClientRect()
  const middle = rect.top + rect.height / 2
  return clientY < middle ? 'before' : 'after'
}

function sourceElement(source: DragSource): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-drop-kind="${source.type}"][data-drop-id="${source.id}"]`)
}

function geometryDropTargetFromPoint(y: number, source: DragSource, sourceOrder?: string[]): DropTarget {
  const sourceRow = sourceElement(source)
  const group = sourceRow?.dataset.dropGroup
  if (!group) return null

  const rows = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-drop-kind="${source.type}"][data-drop-group="${group}"]`)
  ).filter((row) => row.dataset.dropId && row.dataset.dropId !== source.id)

  let closest: { row: HTMLElement; distance: number } | null = null
  for (const row of rows) {
    const rect = row.getBoundingClientRect()
    const distance = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
    if (!closest || distance < closest.distance) closest = { row, distance }
  }

  if (!closest) return null

  const id = closest.row.dataset.dropId
  if (!id) return null
  const position = insertionPosition(closest.row, y, source, sourceOrder)
  return source.type === 'conversation' ? { type: 'conversation', id, position } : { type: 'folder', id, position }
}

export function Sidebar({
  selectedConversationId = null,
  selectedConversationFolderId = null,
  refreshKey = 0,
  difyStatusLabel = 'Dify 未配置',
  difyStatusTone = 'neutral',
  onSelectConversation,
  onSelectConversationFolder,
  onNewConversation,
  onOpenSearch
}: SidebarProps): JSX.Element {
  const [initialExpandedFolderIds] = useState(() => readWorkspacePreferences().expandedConversationFolderIds)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationFolders, setConversationFolders] = useState<ConversationFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [folderError, setFolderError] = useState<string | null>(null)
  const [folderSubmitting, setFolderSubmitting] = useState(false)
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null)
  const [editingConversationTitle, setEditingConversationTitle] = useState('')
  const [deleteConfirmConversationId, setDeleteConfirmConversationId] = useState<string | null>(null)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState('')
  const [expandedConversationFolderIds, setExpandedConversationFolderIds] = useState<Set<string>>(
    () => new Set(initialExpandedFolderIds ?? [])
  )
  const [contextMenu, setContextMenu] = useState<ConversationContextMenu>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const conversationsRef = useRef<Conversation[]>([])
  const conversationFoldersRef = useRef<ConversationFolder[]>([])
  const previewedOrderRef = useRef<{
    source: DragSource
    kind: 'conversation' | 'folder'
    ids: string[]
  } | null>(null)
  const pointerDragRef = useRef<PointerDragState | null>(null)
  const mouseDragRef = useRef<MouseDragState | null>(null)
  const nativeDragSourceRef = useRef<DragSource | null>(null)
  const dragOrderRef = useRef<string[] | null>(null)
  const suppressClickRef = useRef(false)
  const sidebarNavRef = useRef<HTMLElement | null>(null)

  function saveExpandedFolders(next: Set<string>): void {
    updateWorkspacePreferences({ expandedConversationFolderIds: [...next] })
  }

  function expandConversationFolder(folderId: string): void {
    setExpandedConversationFolderIds((current) => {
      const next = new Set(current).add(folderId)
      saveExpandedFolders(next)
      return next
    })
  }

  useEffect(() => {
    let alive = true
    setLoading(true)
    void desktopApi.conversations
      .list()
      .then((rows) => {
        if (alive) {
          conversationsRef.current = rows
          setConversations(rows)
          const selectedConversationFolder = rows.find(
            (conversation) => conversation.id === selectedConversationId
          )?.conversationFolderId
          if (selectedConversationFolder) {
            expandConversationFolder(selectedConversationFolder)
          }
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [refreshKey])

  useEffect(() => {
    let alive = true
    void desktopApi.conversationFolders.list().then((rows) => {
      if (alive) {
        conversationFoldersRef.current = rows
        setConversationFolders(rows)
        setExpandedConversationFolderIds((current) => {
          const validFolderIds = new Set(rows.map((folder) => folder.id))
          const next = new Set([...current].filter((folderId) => validFolderIds.has(folderId)))
          if (initialExpandedFolderIds === null) {
            rows.forEach((folder) => {
              if (conversationsRef.current.some((conversation) => conversation.conversationFolderId === folder.id)) {
                next.add(folder.id)
              }
            })
          }
          saveExpandedFolders(next)
          return next
        })
      }
    })
    return () => {
      alive = false
    }
  }, [])

  const looseConversations = conversations.filter((conversation) => sameConversationGroup(conversation, null))

  function conversationsInFolder(folderId: string): Conversation[] {
    return conversations.filter((conversation) => sameConversationGroup(conversation, folderId))
  }

  async function createConversationFolder(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const name = folderName.trim()
    if (!name) {
      setFolderError('请输入文件夹名称')
      return
    }

    setFolderSubmitting(true)
    setFolderError(null)

    try {
      const folder = await desktopApi.conversationFolders.create(name)
      setConversationFolders((current) => [...current, folder])
      expandConversationFolder(folder.id)
      setFolderName('')
      setCreatingFolder(false)
      onSelectConversationFolder?.(folder.id)
    } catch (error) {
      setFolderError(error instanceof Error ? error.message : '创建文件夹失败')
    } finally {
      setFolderSubmitting(false)
    }
  }

  async function moveConversation(conversationId: string, conversationFolderId: string | null): Promise<Conversation> {
    const conversation = await desktopApi.conversations.moveToFolder(conversationId, conversationFolderId)
    if (conversationFolderId) expandConversationFolder(conversationFolderId)
    setConversations((current) => {
      const next = current.map((row) => (row.id === conversation.id ? conversation : row))
      conversationsRef.current = next
      return next
    })
    return conversation
  }

  function toggleConversationFolder(folderId: string): void {
    setExpandedConversationFolderIds((current) => {
      const next = new Set(current)
      if (folderId === selectedConversationFolderId && next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      saveExpandedFolders(next)
      return next
    })
    onSelectConversationFolder?.(folderId)
  }

  async function renameConversation(event: FormEvent<HTMLFormElement>, conversationId: string): Promise<void> {
    event.preventDefault()
    const title = editingConversationTitle.trim()
    if (!title) return

    const conversation = await desktopApi.conversations.rename(conversationId, title)
    setConversations((current) => {
      const next = current.map((row) => (row.id === conversation.id ? conversation : row))
      conversationsRef.current = next
      return next
    })
    setEditingConversationId(null)
    setEditingConversationTitle('')
  }

  async function deleteConversation(conversationId: string): Promise<void> {
    const deleted = await desktopApi.conversations.delete(conversationId)
    setConversations((current) => {
      const next = current.filter((row) => row.id !== deleted.id)
      conversationsRef.current = next
      return next
    })
    setDeleteConfirmConversationId(null)
    if (deleted.id === selectedConversationId) onNewConversation?.()
  }

  async function renameConversationFolder(event: FormEvent<HTMLFormElement>, folderId: string): Promise<void> {
    event.preventDefault()
    const name = editingFolderName.trim()
    if (!name) return

    const folder = await desktopApi.conversationFolders.rename(folderId, name)
    setConversationFolders((current) => {
      const next = current.map((row) => (row.id === folder.id ? folder : row))
      conversationFoldersRef.current = next
      return next
    })
    setEditingFolderId(null)
    setEditingFolderName('')
  }

  async function reorderConversationsInGroup(
    draggedId: string,
    targetId: string,
    position: InsertPosition
  ): Promise<void> {
    if (draggedId === targetId) return

    const currentConversations = conversationsRef.current
    const targetConversation = currentConversations.find((conversation) => conversation.id === targetId)
    const draggedConversation = currentConversations.find((conversation) => conversation.id === draggedId)
    if (!targetConversation || !draggedConversation) return

    const targetFolderId = targetConversation.conversationFolderId
    let nextConversations = currentConversations
    if (draggedConversation.conversationFolderId !== targetFolderId) {
      const moved = await moveConversation(draggedId, targetFolderId)
      nextConversations = conversationsRef.current.map((conversation) => (conversation.id === moved.id ? moved : conversation))
    }

    const group = insertRelative(
      nextConversations.filter((conversation) => sameConversationGroup(conversation, targetFolderId)),
      draggedId,
      targetId,
      position
    )
    const groupIds = group.map((conversation) => conversation.id)
    setConversations((current) => {
      const byId = new Map(group.map((conversation) => [conversation.id, conversation]))
      const next = current
        .filter((conversation) => !groupIds.includes(conversation.id))
        .concat(groupIds.map((conversationId) => byId.get(conversationId)).filter(Boolean) as Conversation[])
      conversationsRef.current = next
      return next
    })
    await desktopApi.conversations.reorder(groupIds)
  }

  async function reorderConversationFolders(
    draggedId: string,
    targetId: string,
    position: InsertPosition
  ): Promise<void> {
    if (draggedId === targetId) return
    const ordered = insertRelative(conversationFoldersRef.current, draggedId, targetId, position)
    conversationFoldersRef.current = ordered
    setConversationFolders(ordered)
    await desktopApi.conversationFolders.reorder(ordered.map((folder) => folder.id))
  }

  function previewConversationOrder(target: Extract<DropTarget, { type: 'conversation' }>): void {
    setConversations((current) => {
      const dragged = current.find((conversation) => conversation.id === pointerDragRef.current?.source.id || conversation.id === mouseDragRef.current?.source.id)
      const targetConversation = current.find((conversation) => conversation.id === target.id)
      if (!dragged || !targetConversation) return current
      if (dragged.conversationFolderId !== targetConversation.conversationFolderId) return current

      const group = current.filter((conversation) => sameConversationGroup(conversation, targetConversation.conversationFolderId))
      const orderedGroup = insertRelative(group, dragged.id, target.id, target.position)
      const orderedIds = orderedGroup.map((conversation) => conversation.id)
      if (group.every((conversation, index) => conversation.id === orderedIds[index])) return current

      const byId = new Map(current.map((conversation) => [conversation.id, conversation]))
      let groupIndex = 0
      const next = current.map((conversation) => {
        if (!sameConversationGroup(conversation, targetConversation.conversationFolderId)) return conversation
        const nextId = orderedIds[groupIndex++]
        return byId.get(nextId) ?? conversation
      })
      conversationsRef.current = next
      previewedOrderRef.current = {
        source: { type: 'conversation', id: dragged.id },
        kind: 'conversation',
        ids: orderedIds
      }
      return next
    })
  }

  function previewFolderOrder(target: Extract<DropTarget, { type: 'folder' }>): void {
    const source = pointerDragRef.current?.source ?? mouseDragRef.current?.source
    if (!source || source.type !== 'folder') return

    setConversationFolders((current) => {
      const ordered = insertRelative(current, source.id, target.id, target.position)
      if (current.every((folder, index) => folder.id === ordered[index]?.id)) return current
      conversationFoldersRef.current = ordered
      previewedOrderRef.current = {
        source,
        kind: 'folder',
        ids: ordered.map((folder) => folder.id)
      }
      return ordered
    })
  }

  function previewDropTarget(source: DragSource, target: DropTarget): void {
    if (!target) return
    if (source.type === 'conversation' && target.type === 'conversation') previewConversationOrder(target)
    if (source.type === 'folder' && target.type === 'folder') previewFolderOrder(target)
  }

  function clearDragState(): void {
    setDropTarget(null)
    dragOrderRef.current = null
  }

  function captureDragOrder(source: DragSource): void {
    const sourceRow = sourceElement(source)
    const group = sourceRow?.dataset.dropGroup
    if (!group) {
      dragOrderRef.current = null
      return
    }

    dragOrderRef.current = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-drop-kind="${source.type}"][data-drop-group="${group}"]`)
    )
      .map((row) => row.dataset.dropId)
      .filter((rowId): rowId is string => Boolean(rowId))
  }

  function commitPreviewedOrder(source: DragSource): boolean {
    const preview = previewedOrderRef.current
    previewedOrderRef.current = null

    if (!preview || preview.source.type !== source.type || preview.source.id !== source.id) return false
    if (preview.kind === 'conversation' && source.type === 'conversation') {
      void desktopApi.conversations.reorder(preview.ids)
      return true
    }
    if (preview.kind === 'folder' && source.type === 'folder') {
      void desktopApi.conversationFolders.reorder(preview.ids)
      return true
    }
    return false
  }

  function validDropTarget(source: DragSource, target: DropTarget): DropTarget {
    if (!target) return null
    if (source.type === 'conversation') {
      if (target.type === 'conversation' && target.id === source.id) return null
      if (target.type === 'folder') return { type: 'folder', id: target.id, position: target.position }
      return target
    }
    if (target.type === 'folder' && target.id !== source.id) return target
    return null
  }

  function dropTargetFromPoint(x: number, y: number, source: DragSource): DropTarget {
    const sourceOrder = dragOrderRef.current ?? undefined
    const element = document.elementFromPoint(x, y)
    if (!(element instanceof HTMLElement)) return geometryDropTargetFromPoint(y, source, sourceOrder)

    const dropElement = element.closest<HTMLElement>('[data-drop-kind]')
    if (!dropElement) return geometryDropTargetFromPoint(y, source, sourceOrder)

    const kind = dropElement.dataset.dropKind
    const id = dropElement.dataset.dropId ?? ''
    const position = insertionPosition(dropElement, y, source, sourceOrder)
    const target: DropTarget =
      kind === 'outside'
        ? { type: 'outside' }
        : kind === 'conversation' && id
          ? { type: 'conversation', id, position }
          : kind === 'folder' && id
            ? { type: 'folder', id, position }
            : null

    return validDropTarget(source, target) ?? geometryDropTargetFromPoint(y, source, sourceOrder)
  }

  function performDropTarget(source: DragSource, target: DropTarget): void {
    if (!target) return
    if (source.type === 'conversation' && target.type === 'outside') void moveConversation(source.id, null)
    if (source.type === 'conversation' && target.type === 'conversation') {
      void reorderConversationsInGroup(source.id, target.id, target.position)
    }
    if (source.type === 'conversation' && target.type === 'folder') void moveConversation(source.id, target.id)
    if (source.type === 'folder' && target.type === 'folder') {
      void reorderConversationFolders(source.id, target.id, target.position)
    }
  }

  function dragSourceToken(source: DragSource): string {
    return `${source.type}:${source.id}`
  }

  function dragSourceFromToken(token: string): DragSource | null {
    const [type, id] = token.split(':')
    if (!id) return null
    if (type === 'conversation') return { type, id }
    if (type === 'folder') return { type, id }
    return null
  }

  function startNativeDrag(event: ReactDragEvent<HTMLElement>, source: DragSource): void {
    previewedOrderRef.current = null
    captureDragOrder(source)
    nativeDragSourceRef.current = source
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-research-notion-drag-source', dragSourceToken(source))
    event.dataTransfer.setData('text/plain', dragSourceToken(source))
  }

  function nativeDragSource(event: ReactDragEvent<HTMLElement>): DragSource | null {
    return (
      nativeDragSourceRef.current ??
      dragSourceFromToken(event.dataTransfer.getData('application/x-research-notion-drag-source')) ??
      dragSourceFromToken(event.dataTransfer.getData('text/plain'))
    )
  }

  function nativeDropTarget(event: ReactDragEvent<HTMLElement>, target: DropTarget): DropTarget {
    const source = nativeDragSource(event)
    const currentTarget = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
    const sourceOrder = dragOrderRef.current ?? undefined
    const pointedTarget =
      source && target && target.type !== 'outside' && currentTarget
        ? validDropTarget(source, { ...target, position: insertionPosition(currentTarget, event.clientY, source, sourceOrder) })
        : source
          ? validDropTarget(source, target)
          : null

    return pointedTarget ?? (source ? geometryDropTargetFromPoint(event.clientY, source, sourceOrder) : null)
  }

  function updateNativeDropTarget(event: ReactDragEvent<HTMLElement>, target: DropTarget): void {
    const nextTarget = nativeDropTarget(event, target)
    if (!nextTarget) return

    event.preventDefault()
    autoScrollConversationTree(event.clientY)
    event.dataTransfer.dropEffect = 'move'
    setDropTarget(nextTarget)
  }

  function finishNativeDrop(event: ReactDragEvent<HTMLElement>, target: DropTarget): void {
    const source = nativeDragSource(event)
    const nextTarget = nativeDropTarget(event, target)
    if (!source || !nextTarget) return

    event.preventDefault()
    setDropTarget(null)
    nativeDragSourceRef.current = null
    suppressClickRef.current = true
    window.setTimeout(() => {
      suppressClickRef.current = false
    }, 120)
    if (!commitPreviewedOrder(source)) performDropTarget(source, nextTarget)
  }

  function finishNativeDrag(): void {
    nativeDragSourceRef.current = null
    clearDragState()
  }

  function startPointerDrag(event: ReactPointerEvent<HTMLElement>, source: DragSource): void {
    if (event.button !== 0) return
    previewedOrderRef.current = null
    captureDragOrder(source)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Some test environments do not implement pointer capture.
    }
    pointerDragRef.current = {
      source,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      target: null
    }
  }

  function startMouseDrag(event: ReactMouseEvent<HTMLElement>, source: DragSource): void {
    if (event.button !== 0) return
    if (pointerDragRef.current) return
    previewedOrderRef.current = null
    captureDragOrder(source)
    mouseDragRef.current = {
      source,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      target: null
    }
  }

  function updateDragTarget(drag: MouseDragState, x: number, y: number): void {
    const distance = Math.hypot(x - drag.startX, y - drag.startY)
    if (!drag.active && distance < 4) return

    drag.active = true
    autoScrollConversationTree(y)
    const target = dropTargetFromPoint(x, y, drag.source)
    drag.target = target
    setDropTarget(target)
    previewDropTarget(drag.source, target)
  }

  function autoScrollConversationTree(clientY: number): void {
    const nav = sidebarNavRef.current
    if (!nav || typeof nav.scrollBy !== 'function') return
    const rect = nav.getBoundingClientRect()
    if (clientY <= rect.top + 32) nav.scrollBy({ top: -28, behavior: 'auto' })
    else if (clientY >= rect.bottom - 32) nav.scrollBy({ top: 28, behavior: 'auto' })
  }

  function finishDrag(drag: MouseDragState | null): void {
    clearDragState()

    if (!drag?.active) return
    suppressClickRef.current = true
    window.setTimeout(() => {
      suppressClickRef.current = false
    }, 120)

    if (!commitPreviewedOrder(drag.source)) performDropTarget(drag.source, drag.target)
  }

  useEffect(() => {
    function handlePointerMove(event: PointerEvent): void {
      const drag = pointerDragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return

      event.preventDefault()
      updateDragTarget(drag, event.clientX, event.clientY)
    }

    function handlePointerUp(event: PointerEvent): void {
      const drag = pointerDragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return

      pointerDragRef.current = null
      finishDrag(drag)
    }

    function handleMouseMove(event: MouseEvent): void {
      if (pointerDragRef.current) return
      const drag = mouseDragRef.current
      if (!drag) return

      event.preventDefault()
      updateDragTarget(drag, event.clientX, event.clientY)
    }

    function handleMouseUp(): void {
      if (pointerDragRef.current) return
      const drag = mouseDragRef.current
      if (!drag) return

      mouseDragRef.current = null
      finishDrag(drag)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  })

  useEffect(() => {
    if (!contextMenu) return
    function closeMenu(): void {
      setContextMenu(null)
    }
    function closeMenuWithEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') closeMenu()
    }
    window.addEventListener('click', closeMenu)
    window.addEventListener('keydown', closeMenuWithEscape)
    return () => {
      window.removeEventListener('click', closeMenu)
      window.removeEventListener('keydown', closeMenuWithEscape)
    }
  }, [contextMenu])

  function guardedClick(action: () => void): (event: ReactMouseEvent<HTMLElement>) => void {
    return (event) => {
      if (suppressClickRef.current) {
        event.preventDefault()
        return
      }
      action()
    }
  }

  function guardedRowClick(action: () => void): (event: ReactMouseEvent<HTMLElement>) => void {
    return (event) => {
      const target = event.target
      if (target instanceof HTMLElement && target.closest('button, input, textarea, select, a, form')) return
      guardedClick(action)(event)
    }
  }

  function selectConversation(conversation: Conversation): void {
    onSelectConversationFolder?.(conversation.conversationFolderId ?? null)
    onSelectConversation?.(conversation.id)
  }

  function insertionClass(kind: 'conversation' | 'folder', id: string): string {
    if (dropTarget?.type !== kind || dropTarget.id !== id) return ''
    return ` drop-${dropTarget.position}`
  }

  function renderConversation(conversation: Conversation, nested = false): JSX.Element {
    const isDropTarget = dropTarget?.type === 'conversation' && dropTarget.id === conversation.id
    if (editingConversationId === conversation.id) {
      return (
      <form
        key={conversation.id}
        className={nested ? 'sidebar-inline-form nested' : 'sidebar-inline-form conversation-inline-form'}
        onSubmit={(event) => void renameConversation(event, conversation.id)}
      >
        <input
          aria-label="对话标题"
          value={editingConversationTitle}
          onChange={(event) => setEditingConversationTitle(event.target.value)}
          autoFocus
        />
        <button type="submit" aria-label="保存对话标题" disabled={!editingConversationTitle.trim()}>
          <Check size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="取消重命名对话"
          onClick={() => {
            setEditingConversationId(null)
            setEditingConversationTitle('')
          }}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </form>
      )
    }

    return (
      <div
        key={conversation.id}
        className={`conversation-row${isDropTarget ? ' drop-target' : ''}${insertionClass('conversation', conversation.id)}${nested ? ' nested' : ''}`}
        data-testid={`conversation-row-${conversation.id}`}
        data-drop-kind="conversation"
        data-drop-id={conversation.id}
        data-drop-group={conversation.conversationFolderId ?? 'root'}
        draggable={false}
        onDragStart={(event) => startNativeDrag(event, { type: 'conversation', id: conversation.id })}
        onDragEnter={(event) =>
          updateNativeDropTarget(event, { type: 'conversation', id: conversation.id, position: 'after' })
        }
        onDragOver={(event) =>
          updateNativeDropTarget(event, { type: 'conversation', id: conversation.id, position: 'after' })
        }
        onDrop={(event) => finishNativeDrop(event, { type: 'conversation', id: conversation.id, position: 'after' })}
        onDragEnd={finishNativeDrag}
        onClick={guardedRowClick(() => selectConversation(conversation))}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setContextMenu({ conversationId: conversation.id, x: event.clientX, y: event.clientY })
        }}
      >
        <button
          type="button"
          className="drag-grip-button"
          aria-label={`拖动 ${conversation.title}`}
          onPointerDown={(event) => startPointerDrag(event, { type: 'conversation', id: conversation.id })}
          onMouseDown={(event) => startMouseDrag(event, { type: 'conversation', id: conversation.id })}
        >
          <GripVertical className="drag-grip" size={13} aria-hidden="true" />
        </button>
        <button
          className={conversation.id === selectedConversationId ? 'sidebar-item active' : 'sidebar-item'}
          type="button"
          onClick={guardedClick(() => selectConversation(conversation))}
        >
          <MessageSquare size={15} aria-hidden="true" />
          <span>{conversation.title}</span>
        </button>
        <button
          type="button"
          className="row-icon-button"
          aria-label={`重命名 ${conversation.title}`}
          onClick={() => {
            setEditingConversationId(conversation.id)
            setEditingConversationTitle(conversation.title)
            setDeleteConfirmConversationId(null)
          }}
        >
          <Pencil size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="row-icon-button danger"
          aria-label={`删除 ${conversation.title}`}
          onClick={() => {
            setDeleteConfirmConversationId(conversation.id)
            setEditingConversationId(null)
            setEditingConversationTitle('')
          }}
        >
          <Trash2 size={13} aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <aside className="sidebar">
      <div className="workspace-title">
        <div className="workspace-mark" aria-hidden="true">
          <img src={researchNotionMark} alt="" />
        </div>
        <span>科研工作空间</span>
      </div>

      <button className="new-chat-button top" type="button" onClick={onNewConversation}>
        <Plus size={15} aria-hidden="true" />
        新对话
      </button>

      <button className="sidebar-command" type="button" onClick={onOpenSearch}>
        <Search size={15} aria-hidden="true" />
        搜索论文和对话
      </button>

      <nav ref={sidebarNavRef} className="sidebar-nav" aria-label="历史对话">
        <button
          className={dropTarget?.type === 'outside' ? 'sidebar-section-drop active' : 'sidebar-section-drop'}
          type="button"
          aria-label="拖到所有文件夹外"
          data-drop-kind="outside"
          onDragEnter={(event) => updateNativeDropTarget(event, { type: 'outside' })}
          onDragOver={(event) => updateNativeDropTarget(event, { type: 'outside' })}
          onDrop={(event) => finishNativeDrop(event, { type: 'outside' })}
          onClick={() => onSelectConversationFolder?.(null)}
        >
          最近
        </button>

        {loading ? <p className="sidebar-empty">正在加载...</p> : null}
        {!loading && conversations.length === 0 ? <p className="sidebar-empty">暂无历史对话</p> : null}
        {looseConversations.map((conversation) => renderConversation(conversation))}

        <div className="sidebar-section-heading">
          <span>文件夹</span>
          <button
            type="button"
            aria-label="新建对话文件夹"
            onClick={() => {
              setCreatingFolder(true)
              setFolderError(null)
            }}
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        </div>

        {creatingFolder ? (
          <form className="sidebar-folder-form" onSubmit={(event) => void createConversationFolder(event)}>
            <input
              aria-label="对话文件夹名称"
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="文件夹名称"
              autoFocus
            />
            <div className="sidebar-folder-actions">
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

        {conversationFolders.map((folder) => {
          const isDropTarget = dropTarget?.type === 'folder' && dropTarget.id === folder.id
          const nestedConversations = conversationsInFolder(folder.id)
          const isExpanded = expandedConversationFolderIds.has(folder.id)
          return (
            <div className="conversation-folder-block" key={folder.id}>
              {editingFolderId === folder.id ? (
                <form
                  className="sidebar-inline-form"
                  onSubmit={(event) => void renameConversationFolder(event, folder.id)}
                >
                  <input
                    aria-label="对话文件夹标题"
                    value={editingFolderName}
                    onChange={(event) => setEditingFolderName(event.target.value)}
                    autoFocus
                  />
                  <button type="submit" aria-label="保存文件夹标题" disabled={!editingFolderName.trim()}>
                    <Check size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="取消重命名文件夹"
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
                  className={`sidebar-folder-row${isDropTarget ? ' drop-target' : ''}${insertionClass('folder', folder.id)}`}
                  data-testid={`conversation-folder-row-${folder.id}`}
                  data-drop-kind="folder"
                  data-drop-id={folder.id}
                  data-drop-group="folders"
                  draggable={false}
                  onDragStart={(event) => startNativeDrag(event, { type: 'folder', id: folder.id })}
                  onDragEnter={(event) =>
                    updateNativeDropTarget(event, { type: 'folder', id: folder.id, position: 'after' })
                  }
                  onDragOver={(event) =>
                    updateNativeDropTarget(event, { type: 'folder', id: folder.id, position: 'after' })
                  }
                  onDrop={(event) => finishNativeDrop(event, { type: 'folder', id: folder.id, position: 'after' })}
                  onDragEnd={finishNativeDrag}
                >
                  <button
                    type="button"
                    className="drag-grip-button"
                    aria-label={`拖动 ${folder.name}`}
                    onPointerDown={(event) => startPointerDrag(event, { type: 'folder', id: folder.id })}
                    onMouseDown={(event) => startMouseDrag(event, { type: 'folder', id: folder.id })}
                  >
                    <GripVertical className="drag-grip" size={13} aria-hidden="true" />
                  </button>
                  <button
                    className={folder.id === selectedConversationFolderId ? 'sidebar-item active' : 'sidebar-item'}
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={guardedClick(() => toggleConversationFolder(folder.id))}
                  >
                    <ChevronRight className={isExpanded ? 'folder-chevron open' : 'folder-chevron'} size={14} aria-hidden="true" />
                    {isExpanded ? <FolderOpen size={15} aria-hidden="true" /> : <Folder size={15} aria-hidden="true" />}
                    <span>{folder.name}</span>
                  </button>
                  <button
                    type="button"
                    className="row-icon-button"
                    aria-label={`重命名 ${folder.name}`}
                    onClick={() => {
                      setEditingFolderId(folder.id)
                      setEditingFolderName(folder.name)
                    }}
                  >
                    <Pencil size={13} aria-hidden="true" />
                  </button>
                </div>
              )}
              {isExpanded ? nestedConversations.map((conversation) => renderConversation(conversation, true)) : null}
            </div>
          )
        })}
      </nav>

      {contextMenu ? (() => {
        const conversation = conversations.find((row) => row.id === contextMenu.conversationId)
        if (!conversation) return null
        return (
          <div
            className="sidebar-context-menu"
            role="menu"
            aria-label="对话操作"
            style={{
              left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 206)),
              top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 260))
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setEditingConversationId(conversation.id)
                setEditingConversationTitle(conversation.title)
                setContextMenu(null)
              }}
            >
              <Pencil size={14} aria-hidden="true" />
              重命名对话
            </button>
            {conversation.conversationFolderId ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setContextMenu(null)
                  void moveConversation(conversation.id, null)
                }}
              >
                <MessageSquare size={14} aria-hidden="true" />
                移出文件夹
              </button>
            ) : null}
            {conversationFolders
              .filter((folder) => folder.id !== conversation.conversationFolderId)
              .map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setContextMenu(null)
                    void moveConversation(conversation.id, folder.id)
                  }}
                >
                  <Folder size={14} aria-hidden="true" />
                  移至 {folder.name}
                </button>
              ))}
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                setDeleteConfirmConversationId(conversation.id)
                setContextMenu(null)
              }}
            >
              <Trash2 size={14} aria-hidden="true" />
              删除对话
            </button>
          </div>
        )
      })() : null}

      {deleteConfirmConversationId ? (() => {
        const conversation = conversations.find((row) => row.id === deleteConfirmConversationId)
        if (!conversation) return null
        return (
          <div
            className="sidebar-delete-confirm"
            data-testid={`conversation-delete-confirm-${conversation.id}`}
            role="alertdialog"
            aria-label={`确认删除对话 ${conversation.title}`}
          >
            <span title={conversation.title}>删除“{conversation.title}”？</span>
            <button type="button" onClick={() => void deleteConversation(conversation.id)}>
              确认删除
            </button>
            <button type="button" aria-label="取消删除对话" onClick={() => setDeleteConfirmConversationId(null)}>
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        )
      })() : null}

      <div className="sidebar-footer">
        <button className={`sidebar-command compact ${difyStatusTone}`} type="button">
          <Sparkles size={15} aria-hidden="true" />
          {difyStatusLabel}
        </button>
      </div>
    </aside>
  )
}
