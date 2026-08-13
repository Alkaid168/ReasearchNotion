import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { Paper } from '../../shared/types'

type PdfTextItem = {
  str: string
  hasEOL?: boolean
  transform?: number[]
}

export type PaperTextPage = {
  pageNumber: number
  text: string
}

export type PaperSection = {
  heading: string
  text: string
  pageNumber: number
}

export type PaperOutlineItem = {
  level: number
  heading: string
  pageNumber: number
  preview: string
}

export type PaperTextChunk = {
  chunkIndex: number
  totalChunks: number
  documentPageCount: number
  pageStart: number
  pageEnd: number
  nextChunkIndex: number | null
  text: string
}

export type PaperSearchResult = {
  pageNumber: number
  snippet: string
  score: number
}

const require = createRequire(import.meta.url)
const pdfjsPackagePath = require.resolve('pdfjs-dist/package.json')
const standardFontDataUrl = pathToFileURL(path.join(path.dirname(pdfjsPackagePath), 'standard_fonts')).toString() + '/'
const pageCache = new Map<string, { signature: string; pages: Promise<PaperTextPage[]> }>()
const maxCachedPapers = 12

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return typeof item === 'object' && item !== null && 'str' in item && typeof (item as PdfTextItem).str === 'string'
}

/** Replace lone UTF-16 surrogates with U+FFFD. PDF extraction of math symbols
 *  (U+1D400–U+1D7FF mathematical bold/italic, encoded as surrogate pairs in JS)
 *  can yield broken pairs; Dify's Python backend then refuses to encode UTF-8
 *  ("'utf-8' codec can't encode character '\ud835' ... surrogates not allowed").
 *  Valid pairs (e.g. 𝑥 = 𝑥) are preserved. */
export function cleanSurrogates(text: string): string {
  return text.replace(
    /[\u{D800}-\u{DBFF}](?![\u{DC00}-\u{DFFF}])|(?<![\u{D800}-\u{DBFF}])[\u{DC00}-\u{DFFF}]/gu,
    '�'
  )
}

function normalizeText(text: string): string {
  return cleanSurrogates(text).replace(/\s+/g, ' ').trim()
}

type PositionedItem = {
  str: string
  x: number
  y: number
  hasEOL: boolean
}

function extractPositionedItems(items: unknown[]): PositionedItem[] {
  return items
    .filter(isPdfTextItem)
    .map((item) => ({
      str: item.str,
      x: Array.isArray(item.transform) && typeof item.transform[4] === 'number' ? item.transform[4] : 0,
      y: Array.isArray(item.transform) && typeof item.transform[5] === 'number' ? item.transform[5] : 0,
      hasEOL: Boolean(item.hasEOL)
    }))
}

/** Sort items by Y (top to bottom) and group into lines (same Y within 2pt tolerance). */
export function itemsToLines(items: PositionedItem[]): string {
  if (items.length === 0) return ''
  const sorted = [...items].sort((a, b) => b.y - a.y)
  const lines: string[] = []
  let currentLine: string[] = []
  let previousY: number | null = null

  for (const item of sorted) {
    if (previousY !== null && Math.abs(item.y - previousY) > 2 && currentLine.length > 0) {
      const line = normalizeText(currentLine.join(' '))
      if (line) lines.push(line)
      currentLine = []
    }
    if (item.str.trim()) currentLine.push(item.str)
    if (item.hasEOL) {
      const line = normalizeText(currentLine.join(' '))
      if (line) lines.push(line)
      currentLine = []
    }
    previousY = item.y
  }
  const line = normalizeText(currentLine.join(' '))
  if (line) lines.push(line)

  return lines.join('\n')
}

/**
 * Convert PDF text items to page text. Detects double-column layouts (common in
 * academic papers: IEEE/ACM/Springer) and reads the left column fully before
 * the right column, instead of interleaving same-Y items from both columns.
 *
 * T8 stage 1: double-column sort. OCR (stage 2) and table extraction (stage 3)
 * are future work.
 */
export function pdfItemsToText(items: unknown[], pageWidth?: number): string {
  const positioned = extractPositionedItems(items)
  if (positioned.length === 0) return ''

  const width = pageWidth ?? positioned.reduce((max, item) => Math.max(max, item.x), 0)
  const mid = width / 2
  const leftItems = positioned.filter((item) => item.x < mid)
  const rightItems = positioned.filter((item) => item.x >= mid)

  // Single-column guard: if one side has <15% of items, treat as single column
  const threshold = positioned.length * 0.15
  if (leftItems.length < threshold || rightItems.length < threshold) {
    return itemsToLines(positioned)
  }

  // Double-column: left column first, then right
  return `${itemsToLines(leftItems)}\n${itemsToLines(rightItems)}`
}

function cacheKey(paper: Paper): string {
  return `${paper.fileType}:${paper.filePath}`
}

function cacheSignature(size: number, modifiedAt: number): string {
  return `${size}:${modifiedAt}`
}

function rememberPages(key: string, entry: { signature: string; pages: Promise<PaperTextPage[]> }): void {
  pageCache.delete(key)
  pageCache.set(key, entry)
  while (pageCache.size > maxCachedPapers) {
    const oldestKey = pageCache.keys().next().value
    if (!oldestKey) return
    pageCache.delete(oldestKey)
  }
}

async function readPaperPagesUncached(paper: Paper): Promise<PaperTextPage[]> {
  if (paper.fileType === 'markdown') {
    const text = cleanSurrogates(await fs.readFile(paper.filePath, 'utf8'))
    return [{ pageNumber: 1, text }]
  }

  const bytes = await fs.readFile(paper.filePath)
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useWorkerFetch: false,
    standardFontDataUrl,
    useSystemFonts: true
  })
  const pdf = await loadingTask.promise
  const pages: PaperTextPage[] = []

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const textContent = await page.getTextContent()
      const text = pdfItemsToText(textContent.items, viewport.width)
      pages.push({ pageNumber, text })
    }
  } finally {
    await pdf.destroy()
  }

  return pages
}

export async function readPaperPages(paper: Paper): Promise<PaperTextPage[]> {
  const fileStats = await fs.stat(paper.filePath)
  const key = cacheKey(paper)
  const signature = cacheSignature(fileStats.size, fileStats.mtimeMs)
  const cached = pageCache.get(key)

  if (cached?.signature === signature) {
    rememberPages(key, cached)
    return cached.pages
  }

  const pages = readPaperPagesUncached(paper)
  const entry = { signature, pages }
  rememberPages(key, entry)
  try {
    return await pages
  } catch (error) {
    if (pageCache.get(key) === entry) pageCache.delete(key)
    throw error
  }
}

function sectionPattern(section: string): RegExp {
  const escaped = section.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^(#{1,6})\\s*(${escaped}(?:\\s+|[.:：、-]|$)[^\\n]*)`, 'im')
}

function plainSectionAliases(section: string): string[] {
  const normalized = section.trim().toLowerCase()
  const aliases: Array<[string[], string[]]> = [
    [['摘要', 'abstract'], ['abstract']],
    [['引言', '介绍', 'introduction'], ['introduction']],
    [['相关工作', 'related work'], ['related work', 'background']],
    [['方法', 'method', 'methods', 'methodology', 'approach'], ['method', 'methods', 'methodology', 'approach', 'model']],
    [['实验', 'experiments', 'experiment'], ['experiment', 'experiments', 'evaluation']],
    [['结果', 'results', 'result'], ['result', 'results']],
    [['讨论', 'discussion'], ['discussion']],
    [['局限', '不足', 'limitations', 'limitation'], ['limitation', 'limitations']],
    [['结论', 'conclusion', 'conclusions'], ['conclusion', 'conclusions']]
  ]
  const matched = aliases.find(([keys]) => keys.some((key) => normalized.includes(key)))
  return matched ? matched[1] : [normalized]
}

function plainHeadingPattern(heading: string): RegExp {
  const escaped = heading.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\ /g, '\\s+')
  return new RegExp(`(?:^|\\s)((?:\\d+(?:\\.\\d+)*\\s+)?${escaped})(?=\\s|[.:：-])`, 'i')
}

function allPlainHeadingPattern(): RegExp {
  const headings = [
    'introduction',
    'related\\s+work',
    'background',
    'method',
    'methods',
    'methodology',
    'approach',
    'model',
    'experiment',
    'experiments',
    'evaluation',
    'result',
    'results',
    'discussion',
    'limitation',
    'limitations',
    'conclusion',
    'conclusions'
  ]
  return new RegExp(`\\s((?:\\d+(?:\\.\\d+)*\\s+)(?:${headings.join('|')})|abstract)(?=\\s|[.:：-])`, 'gi')
}

function extractPlainSection(pages: PaperTextPage[], section: string): PaperSection | null {
  const fullText = normalizeText(pages.map((page) => page.text).join(' '))
  const aliases = plainSectionAliases(section)
  const match = aliases
    .flatMap((alias) =>
      Array.from(fullText.matchAll(new RegExp(plainHeadingPattern(alias), 'gi')))
        .filter((found) => found.index !== undefined)
        .map((found) => ({
          found,
          index: found.index ?? 0,
          numbered: /^\d/.test(found[1] ?? '')
        }))
    )
    .sort((a, b) => Number(b.numbered) - Number(a.numbered) || a.index - b.index)[0]

  if (!match) return null

  const start = match.index + (match.found[0].length - match.found[1].length)
  const afterHeading = fullText.slice(start + match.found[1].length)
  const nextHeadings = Array.from(afterHeading.matchAll(allPlainHeadingPattern())).filter((candidate) => {
    const index = candidate.index ?? -1
    return index > 20
  })
  const end = nextHeadings[0]?.index === undefined ? fullText.length : start + match.found[1].length + nextHeadings[0].index
  const text = fullText.slice(start, end).trim()
  const sourcePage = pages.find((page) => page.text.includes(match.found[1]) || normalizeText(page.text).includes(match.found[1])) ?? pages[0]

  return {
    heading: match.found[1].trim(),
    text,
    pageNumber: sourcePage?.pageNumber ?? 1
  }
}

export function extractSection(pages: PaperTextPage[], section: string): PaperSection | null {
  const fullText = pages.map((page) => page.text).join('\n\n')
  const match = fullText.match(sectionPattern(section))
  if (!match || match.index === undefined) return extractPlainSection(pages, section)

  const level = match[1].length
  const start = match.index
  const afterHeading = fullText.slice(start + match[0].length)
  const nextHeading = afterHeading.match(new RegExp(`\\n#{1,${level}}\\s+`, 'm'))
  const text = nextHeading?.index === undefined ? fullText.slice(start) : fullText.slice(start, start + match[0].length + nextHeading.index)
  const page = pages.find((candidate) => candidate.text.includes(match[0])) ?? pages[0]

  return {
    heading: match[2].trim(),
    text: text.trim(),
    pageNumber: page?.pageNumber ?? 1
  }
}

function previewText(text: string): string {
  return normalizeText(text).slice(0, 220)
}

function plainOutlinePattern(): RegExp {
  const headings = [
    'related\\s+work',
    'pre-training\\s+BERT',
    'fine-tuning\\s+BERT',
    'introduction',
    'background',
    'methodology',
    'methods',
    'method',
    'approach',
    'architecture',
    'model',
    'BERT',
    'experiments',
    'experiment',
    'evaluation',
    'results',
    'discussion',
    'limitations',
    'limitation',
    'conclusions',
    'conclusion',
    'references',
    'appendix'
  ]
  return new RegExp(`(?:^|\\s)(Abstract|(?:\\d+(?:\\.\\d+)*\\s+(?:${headings.join('|')})))(?=\\s|[.:])`, 'gi')
}

function plainHeadingLevel(heading: string): number {
  const number = heading.match(/^(\d+(?:\.\d+)*)\s+/)
  if (!number) return 1
  return number[1].split('.').length
}

function extractPlainOutline(pages: PaperTextPage[]): PaperOutlineItem[] {
  const matches = pages.flatMap((page) => {
    const text = normalizeText(page.text)
    return Array.from(text.matchAll(plainOutlinePattern()))
      .filter((match) => match.index !== undefined)
      .map((match) => {
        const heading = match[1].replace(/\s+/g, ' ').trim()
        const start = (match.index ?? 0) + match[0].length - match[1].length
        return { heading, start, pageNumber: page.pageNumber, pageText: text }
      })
  })

  const seen = new Set<string>()
  return matches
    .filter((match) => {
      const key = `${match.pageNumber}:${match.heading.toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((match, index, all): PaperOutlineItem => {
      const next = all.find((candidate, candidateIndex) => candidateIndex > index && candidate.pageNumber === match.pageNumber)
      const bodyStart = match.start + match.heading.length
      const bodyEnd = next?.start ?? match.pageText.length
      return {
        level: plainHeadingLevel(match.heading),
        heading: match.heading,
        pageNumber: match.pageNumber,
        preview: previewText(match.pageText.slice(bodyStart, bodyEnd))
      }
    })
}

function extractLineBasedOutline(pages: PaperTextPage[]): PaperOutlineItem[] {
  const headingPattern = /^(\d+(?:\.\d+){0,4})[.)]?\s+(.{2,120})$/
  const sentenceEnding = /[.!?。！？:]$/
  function plausibleNumberedHeading(numbering: string, body: string): boolean {
    const topLevel = Number(numbering.split('.')[0])
    const normalizedBody = body.trim()

    if (!Number.isFinite(topLevel) || topLevel > 99) return false
    if (!/[A-Za-z\u4e00-\u9fff]/.test(normalizedBody)) return false
    return !/^(?:[\d.,%/\-]+\s*)+$/.test(normalizedBody)
  }

  const items = pages.flatMap((page) => {
    const lines = page.text.split(/\r?\n/).map((line) => normalizeText(line))
    return lines.flatMap((line, index) => {
      const match = line.match(headingPattern)
      if (
        !match ||
        sentenceEnding.test(line) ||
        match[2].split(/\s+/).length > 16 ||
        !plausibleNumberedHeading(match[1], match[2])
      ) {
        return []
      }
      return [
        {
          level: match[1].split('.').length,
          heading: `${match[1]} ${match[2]}`,
          pageNumber: page.pageNumber,
          preview: previewText(lines.slice(index + 1, index + 4).join(' '))
        }
      ]
    })
  })

  return items
}

export function extractOutline(pages: PaperTextPage[]): PaperOutlineItem[] {
  const outline = pages.flatMap((page) => {
    const lines = page.text.split(/\r?\n/)
    return lines
      .map((line, index): PaperOutlineItem | null => {
        const markdownHeading = line.match(/^(#{1,6})\s+(.+?)\s*$/)
        if (!markdownHeading) return null
        const followingText = lines.slice(index + 1, index + 4).join(' ')
        return {
          level: markdownHeading[1].length,
          heading: markdownHeading[2].trim(),
          pageNumber: page.pageNumber,
          preview: previewText(followingText)
        }
      })
      .filter((item): item is PaperOutlineItem => Boolean(item))
  })

  if (outline.length > 0) return outline

  const lineBasedOutline = extractLineBasedOutline(pages)
  if (lineBasedOutline.length > 0) return lineBasedOutline

  const plainOutline = extractPlainOutline(pages)
  if (plainOutline.length > 0) return plainOutline

  return pages.map((page) => ({
    level: 1,
    heading: `Page ${page.pageNumber}`,
    pageNumber: page.pageNumber,
    preview: previewText(page.text)
  }))
}

function boundedMaxChars(maxChars: number | undefined): number {
  if (!Number.isFinite(maxChars)) return 4000
  return Math.min(8000, Math.max(100, Math.floor(maxChars ?? 4000)))
}

export function chunkPaperText(
  pages: PaperTextPage[],
  options: { chunkIndex?: number; maxChars?: number } = {}
): PaperTextChunk {
  const maxChars = boundedMaxChars(options.maxChars)
  const requestedIndex = Math.max(1, Math.floor(options.chunkIndex ?? 1))
  const chunks: Array<{ text: string; pageStart: number; pageEnd: number }> = []

  let currentText = ''
  let pageStart = pages[0]?.pageNumber ?? 1
  let pageEnd = pageStart

  const pushCurrent = () => {
    if (!currentText.trim()) return
    chunks.push({
      text: currentText.trim().slice(0, maxChars),
      pageStart,
      pageEnd
    })
    currentText = ''
  }

  pages.forEach((page) => {
    const pageText = `Page ${page.pageNumber}\n${page.text}`.trim()
    if (!currentText) {
      pageStart = page.pageNumber
      pageEnd = page.pageNumber
    }

    if (currentText && currentText.length + pageText.length + 2 > maxChars) {
      pushCurrent()
      pageStart = page.pageNumber
    }

    if (pageText.length > maxChars) {
      for (let offset = 0; offset < pageText.length; offset += maxChars) {
        chunks.push({
          text: pageText.slice(offset, offset + maxChars).trim(),
          pageStart: page.pageNumber,
          pageEnd: page.pageNumber
        })
      }
      currentText = ''
      pageEnd = page.pageNumber
      return
    }

    currentText = currentText ? `${currentText}\n\n${pageText}` : pageText
    pageEnd = page.pageNumber
  })

  pushCurrent()

  const safeChunks = chunks.length
    ? chunks
    : [
        {
          text: '',
          pageStart: 1,
          pageEnd: 1
        }
      ]
  const chunkIndex = Math.min(requestedIndex, safeChunks.length)
  const chunk = safeChunks[chunkIndex - 1]

  return {
    chunkIndex,
    totalChunks: safeChunks.length,
    documentPageCount: pages.length,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    nextChunkIndex: chunkIndex < safeChunks.length ? chunkIndex + 1 : null,
    text: chunk.text
  }
}

function queryTerms(query: string): string[] {
  const normalizedQuery = query.toLowerCase()
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'are', 'what', 'which', 'how'])
  const terms = new Set(
    normalizedQuery
      .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
      .map((term) => term.trim())
      .filter((term) => term.length >= 2 && !stopWords.has(term))
  )

  const englishVariants: Record<string, string[]> = {
    architectural: ['architecture'],
    computational: ['computation', 'compute'],
    limitations: ['limitation'],
    methods: ['method'],
    experiments: ['experiment'],
    results: ['result'],
    costs: ['cost']
  }
  Array.from(terms).forEach((term) => englishVariants[term]?.forEach((variant) => terms.add(variant)))

  const bilingualTerms: Array<[string, string[]]> = [
    ['创新', ['contribution', 'novelty', 'innovation']],
    ['贡献', ['contribution', 'contributions']],
    ['方法', ['method', 'methods', 'approach']],
    ['模型', ['model', 'architecture']],
    ['架构', ['architecture', 'model']],
    ['实验', ['experiment', 'experiments']],
    ['结果', ['result', 'results']],
    ['指标', ['metric', 'metrics', 'score']],
    ['数据集', ['dataset', 'datasets', 'corpus']],
    ['局限', ['limitation', 'limitations']],
    ['不足', ['limitation', 'limitations']],
    ['结论', ['conclusion', 'conclusions']],
    ['注意力', ['attention']],
    ['检索', ['retrieval', 'retrieve']],
    ['生成', ['generation', 'generate']],
    ['预训练', ['pre-training', 'pretraining', 'pre-train']],
    ['微调', ['fine-tuning', 'finetuning', 'fine-tune']],
    ['下游', ['downstream']],
    ['任务', ['task', 'tasks']],
    ['摘要', ['abstract', 'summary']],
    ['相关工作', ['related', 'work']]
  ]

  bilingualTerms.forEach(([chinese, expansions]) => {
    if (!normalizedQuery.includes(chinese)) return
    expansions.forEach((term) => terms.add(term))
  })

  return Array.from(terms)
}

function snippetAround(text: string, index: number): string {
  const start = Math.max(0, index - 100)
  const end = Math.min(text.length, index + 240)
  return normalizeText(text.slice(start, end))
}

type PassageMatch = {
  index: number
  matchedTerms: number
  occurrences: number
}

function allIndexes(text: string, term: string): number[] {
  const indexes: number[] = []
  let fromIndex = 0
  while (fromIndex < text.length) {
    const index = text.indexOf(term, fromIndex)
    if (index < 0) break
    indexes.push(index)
    fromIndex = index + Math.max(1, term.length)
  }
  return indexes
}

function bestPassageMatch(text: string, terms: string[]): PassageMatch | null {
  const lower = text.toLowerCase()
  const candidates = new Set<number>()
  terms.forEach((term) => allIndexes(lower, term.toLowerCase()).forEach((index) => candidates.add(index)))

  let best: PassageMatch | null = null
  for (const index of candidates) {
    const start = Math.max(0, index - 180)
    const end = Math.min(lower.length, index + 380)
    const window = lower.slice(start, end)
    const termOccurrences = terms.map((term) => allIndexes(window, term.toLowerCase()).length)
    const candidate: PassageMatch = {
      index,
      matchedTerms: termOccurrences.filter((count) => count > 0).length,
      occurrences: termOccurrences.reduce((total, count) => total + count, 0)
    }
    if (
      !best ||
      candidate.matchedTerms > best.matchedTerms ||
      (candidate.matchedTerms === best.matchedTerms && candidate.occurrences > best.occurrences)
    ) {
      best = candidate
    }
  }
  return best
}

export function searchPages(pages: PaperTextPage[], query: string, limit = 5): PaperSearchResult[] {
  const terms = queryTerms(query)
  if (terms.length === 0) return []

  return pages
    .map((page) => {
      const match = bestPassageMatch(page.text, terms)
      const score = match ? match.matchedTerms / terms.length : 0
      return {
        pageNumber: page.pageNumber,
        score,
        snippet: match ? snippetAround(page.text, match.index) : ''
      }
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export type PaperEvidence = {
  pageNumber: number
  score: number
  text: string
  source: 'search' | 'fallback'
}

function evidenceExcerpt(text: string, terms: string[], maxChars = 2200): string {
  const match = bestPassageMatch(text, terms)
  const start = Math.max(0, (match?.index ?? 0) - 350)
  return normalizeText(text.slice(start, start + maxChars))
}

export function collectPaperEvidence(
  pages: PaperTextPage[],
  query: string,
  limit = 4,
  options: { fallback?: boolean } = {}
): { evidence: PaperEvidence[]; fallbackUsed: boolean } {
  const safeLimit = Math.min(8, Math.max(1, Math.floor(limit)))
  const results = searchPages(pages, query, safeLimit)
  const terms = queryTerms(query)

  if (results.length > 0) {
    return {
      fallbackUsed: false,
      evidence: results.map((result) => {
        const page = pages.find((candidate) => candidate.pageNumber === result.pageNumber)
        return {
          pageNumber: result.pageNumber,
          score: result.score,
          text: evidenceExcerpt(page?.text ?? result.snippet, terms),
          source: 'search' as const
        }
      })
    }
  }

  if (options.fallback === false) {
    return { fallbackUsed: false, evidence: [] }
  }

  return {
    fallbackUsed: true,
    evidence: pages.slice(0, Math.min(2, safeLimit)).map((page) => ({
      pageNumber: page.pageNumber,
      score: 0,
      text: evidenceExcerpt(page.text, [], 2800),
      source: 'fallback' as const
    }))
  }
}
