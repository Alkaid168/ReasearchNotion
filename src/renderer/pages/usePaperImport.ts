import { useRef, useState, type DragEvent } from 'react'
import { desktopApi } from '../api/desktopApi'
import { normalizedPaperTitle, supportedPaperFile } from './paperImportUtils'
import type { Paper } from '../../shared/types'

export type ImportQueueStatus = 'queued' | 'importing' | 'imported' | 'skipped' | 'failed'
export type ImportQueueItem = { id: string; fileName: string; status: ImportQueueStatus; detail?: string }

type UsePaperImportOptions = {
  activeFolderId: string | null
  activeFolderPapers: Array<Pick<Paper, 'title'>>
  loadFolderPapers: (folderId: string) => Promise<unknown>
  onNotify?: (message: string, tone?: 'success' | 'error') => void
  onError: (message: string | null) => void
}

function containsFiles(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes('Files')
}

export function usePaperImport({
  activeFolderId,
  activeFolderPapers,
  loadFolderPapers,
  onNotify,
  onError
}: UsePaperImportOptions) {
  const [importing, setImporting] = useState(false)
  const [importQueue, setImportQueue] = useState<ImportQueueItem[]>([])
  const [dropActive, setDropActive] = useState(false)
  const dragDepthRef = useRef(0)

  function updateImportQueueItem(id: string, update: Partial<ImportQueueItem>): void {
    setImportQueue((current) => current.map((item) => (item.id === id ? { ...item, ...update } : item)))
  }

  async function importPaper(): Promise<void> {
    if (!activeFolderId || importing) return

    setImporting(true)
    onError(null)
    try {
      const importedPapers = await desktopApi.papers.import(activeFolderId)
      await loadFolderPapers(activeFolderId)
      if (importedPapers.length === 1) onNotify?.(`已导入「${importedPapers[0].title}」`, 'success')
      else onNotify?.(`已导入 ${importedPapers.length} 篇论文`, 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : '导入论文失败。'
      onError(message)
      onNotify?.(message, 'error')
    } finally {
      setImporting(false)
    }
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
    if (failedCount > 0) onError(`${failedCount} 个文件导入失败。`)
    if (importedCount > 0) {
      onNotify?.(importedCount === 1 ? '已导入 1 篇论文' : `已导入 ${importedCount} 篇论文`, 'success')
    }
  }

  function onPaperDragEnter(event: DragEvent<HTMLElement>): void {
    if (!containsFiles(event)) return
    event.preventDefault()
    dragDepthRef.current += 1
    setDropActive(true)
  }

  function onPaperDragOver(event: DragEvent<HTMLElement>): void {
    if (!containsFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
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
      onError('仅支持 PDF、Markdown（.md / .markdown）文件。')
      return
    }

    setImporting(true)
    onError(null)
    try {
      await importDroppedFiles(activeFolderId, files)
    } finally {
      setImporting(false)
    }
  }

  return {
    importing,
    importQueue,
    dropActive,
    importPaper,
    clearImportQueue: () => setImportQueue([]),
    onPaperDragEnter,
    onPaperDragOver,
    onPaperDragLeave,
    onPaperDrop
  }
}
