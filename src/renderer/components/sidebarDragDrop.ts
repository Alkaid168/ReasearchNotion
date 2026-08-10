import type { Conversation } from '../../shared/types'

/** Sidebar 拖拽排序的纯类型 + 几何/顺序计算（从 Sidebar.tsx 抽出，便于单测与复用）。 */

export type DropPosition = 'before' | 'after'

export type DropTarget =
  | { type: 'outside' }
  | { type: 'conversation'; id: string; position: DropPosition }
  | { type: 'folder'; id: string; position: DropPosition }
  | null

export type DragSource = { type: 'conversation'; id: string } | { type: 'folder'; id: string }

export type PointerDragState = {
  source: DragSource
  pointerId: number
  startX: number
  startY: number
  active: boolean
  target: DropTarget
}

export type MouseDragState = Omit<PointerDragState, 'pointerId'>

export type ConversationContextMenu = {
  conversationId: string
  x: number
  y: number
} | null

export function insertRelative<T extends { id: string }>(
  rows: T[],
  draggedId: string,
  targetId: string,
  position: DropPosition
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

export function sameConversationGroup(conversation: Conversation, folderId: string | null): boolean {
  return conversation.conversationFolderId === folderId
}

export function insertionPosition(
  element: HTMLElement,
  clientY: number,
  source?: DragSource,
  sourceOrder?: string[]
): DropPosition {
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

export function sourceElement(source: DragSource): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-drop-kind="${source.type}"][data-drop-id="${source.id}"]`)
}

export function geometryDropTargetFromPoint(y: number, source: DragSource, sourceOrder?: string[]): DropTarget {
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
