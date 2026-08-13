import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { FileType, Paper } from '../../shared/types'

type PdfTextItem = {
  str: string
}

const require = createRequire(import.meta.url)
const pdfjsPackagePath = require.resolve('pdfjs-dist/package.json')
const standardFontDataUrl = pathToFileURL(path.join(path.dirname(pdfjsPackagePath), 'standard_fonts')).toString() + '/'

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return typeof item === 'object' && item !== null && 'str' in item && typeof (item as PdfTextItem).str === 'string'
}

function readableFileError(error: unknown, fallback: string): Error {
  if (!(error instanceof Error)) return new Error(fallback)
  if ('code' in error && error.code === 'ENOENT') return new Error('找不到所选文件，请确认文件没有被移动或删除。')
  if ('code' in error && (error.code === 'EACCES' || error.code === 'EPERM')) {
    return new Error('无法读取所选文件，请关闭占用该文件的程序或检查文件权限。')
  }
  return new Error(fallback)
}

export async function validatePaperSource(sourcePath: string, fileType: FileType): Promise<void> {
  let stat
  try {
    stat = await fs.stat(sourcePath)
  } catch (error) {
    throw readableFileError(error, '无法读取所选文件。')
  }

  if (!stat.isFile()) throw new Error('所选内容不是文件，无法导入。')
  if (stat.size === 0) throw new Error(fileType === 'pdf' ? 'PDF 文件为空，无法导入。' : 'Markdown 文件为空，无法导入。')

  if (fileType === 'markdown') {
    try {
      const content = await fs.readFile(sourcePath, 'utf8')
      if (content.includes('\u0000')) throw new Error('该文件不是有效的 Markdown 文本。')
      if (!content.trim()) throw new Error('Markdown 文件没有可读取的内容。')
      return
    } catch (error) {
      if (error instanceof Error && (error.message.includes('Markdown') || error.message.includes('文本'))) throw error
      throw readableFileError(error, 'Markdown 文件无法读取。')
    }
  }

  let bytes: Buffer
  try {
    bytes = await fs.readFile(sourcePath)
  } catch (error) {
    throw readableFileError(error, 'PDF 文件无法读取。')
  }
  if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('该文件不是有效的 PDF，可能只是扩展名被改成了 .pdf。')
  }

  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useWorkerFetch: false,
    standardFontDataUrl,
    useSystemFonts: true
  })
  try {
    const pdf = await loadingTask.promise
    try {
      if (pdf.numPages < 1) throw new Error('PDF 文件没有可读取的页面。')
    } finally {
      await pdf.destroy()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/password/i.test(message)) throw new Error('该 PDF 受密码保护，请先解除密码后再导入。')
    if (message.includes('没有可读取的页面')) throw error
    throw new Error('PDF 文件已损坏或格式不完整，无法导入。')
  }
}

export async function readPaperMarkdown(paper: Paper): Promise<string | null> {
  if (paper.fileType !== 'markdown') return null
  return fs.readFile(paper.filePath, 'utf8')
}

export async function readPaperPlainText(paper: Paper): Promise<string | null> {
  if (paper.fileType !== 'pdf') return null

  const bytes = await fs.readFile(paper.filePath)
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useWorkerFetch: false,
    standardFontDataUrl,
    useSystemFonts: true
  })
  const pdf = await loadingTask.promise
  const pages: string[] = []

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item) => (isPdfTextItem(item) ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (pageText) pages.push(pageText)
    }
  } finally {
    await pdf.destroy()
  }

  return pages.join('\n\n')
}
