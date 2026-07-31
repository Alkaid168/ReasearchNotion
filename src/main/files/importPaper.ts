import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { Paper } from '../../shared/types'

type PdfTextItem = {
  str: string
}

const require = createRequire(import.meta.url)
const pdfjsPackagePath = require.resolve('pdfjs-dist/package.json')
const standardFontDataUrl = pathToFileURL(path.join(path.dirname(pdfjsPackagePath), 'standard_fonts')).toString() + '/'

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return typeof item === 'object' && item !== null && 'str' in item && typeof (item as PdfTextItem).str === 'string'
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
