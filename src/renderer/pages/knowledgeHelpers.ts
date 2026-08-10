import type { DragEvent } from 'react'
import type { Paper, PaperCard } from '../../shared/types'

/** KnowledgePage 的纯类型 + 纯函数（从 KnowledgePage.tsx 抽出，便于单测与复用）。 */

export type PaperRow = Paper & { card: PaperCard | null }

export type ImportQueueStatus = 'queued' | 'importing' | 'imported' | 'skipped' | 'failed'

export type ImportQueueItem = { id: string; fileName: string; status: ImportQueueStatus; detail?: string }

export function containsFiles(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes('Files')
}

export function supportedPaperFile(file: File): boolean {
  return /\.(pdf|md|markdown)$/i.test(file.name)
}

export function normalizedPaperTitle(value: string): string {
  return value.replace(/\.(pdf|md|markdown)$/i, '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function paperMeta(paper: PaperRow): string {
  const fileTypeLabel = paper.fileType === 'markdown' ? 'Markdown' : 'PDF'
  return [fileTypeLabel, paper.card?.year].filter(Boolean).join(' ? ')
}
