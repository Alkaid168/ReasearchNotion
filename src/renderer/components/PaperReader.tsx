import { useEffect, useRef, useState, type FormEvent, type JSX, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, ListTree, Maximize2, PanelLeftClose, PanelLeftOpen, Search, Sparkles, X, ZoomIn, ZoomOut } from 'lucide-react'
import { AcademicMarkdown } from './AcademicMarkdown'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import type { Paper, PaperOutlineItem, PaperSearchResult } from '../../shared/types'

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

type PaperReaderProps = {
  paper: Paper | null
  markdownText: string | null
  plainText: string | null
  previewUrl: string | null
  pdfData: Uint8Array | null
  onPageChange?: (pageNumber: number) => void
  initialPage?: number
  initialScale?: number
  onViewStateChange?: (view: { page: number; scale: number }) => void
  focusMode?: boolean
  onFocusModeChange?: (focusMode: boolean) => void
  onAskAi?: () => void
  outline?: PaperOutlineItem[]
  searchResults?: PaperSearchResult[]
  searching?: boolean
  searchError?: string | null
  onSearch?: (query: string) => void
  onOutlineRequest?: () => void
}

type ReaderNavigationMode = 'search' | 'outline' | null

type ReaderNavigationPanelProps = {
  mode: ReaderNavigationMode
  query: string
  results: PaperSearchResult[]
  outline: PaperOutlineItem[]
  searching: boolean
  searchError: string | null
  searchSubmitted: boolean
  onQueryChange: (query: string) => void
  onSearch: () => void
  onClose: () => void
  onResultSelect: (result: PaperSearchResult) => void
  onOutlineSelect: (item: PaperOutlineItem) => void
}

function ReaderNavigationPanel({
  mode,
  query,
  results,
  outline,
  searching,
  searchError,
  searchSubmitted,
  onQueryChange,
  onSearch,
  onClose,
  onResultSelect,
  onOutlineSelect
}: ReaderNavigationPanelProps): JSX.Element | null {
  if (!mode) return null

  if (mode === 'outline') {
    return (
      <section className="reader-navigation-panel reader-outline-panel" aria-label="论文目录">
        <header>
          <strong>论文目录</strong>
          <button type="button" aria-label="关闭论文目录" title="关闭论文目录" onClick={onClose}>
            <X size={15} aria-hidden="true" />
          </button>
        </header>
        <div className="reader-outline-list">
          {outline.length ? (
            outline.map((item, index) => (
              <button
                key={`${item.pageNumber}-${item.heading}-${index}`}
                type="button"
                className="reader-outline-item"
                style={{ paddingLeft: `${10 + Math.min(4, Math.max(0, item.level - 1)) * 12}px` }}
                onClick={() => onOutlineSelect(item)}
              >
                <span>{item.heading}</span>
                <small>第 {item.pageNumber} 页</small>
              </button>
            ))
          ) : (
            <p>当前论文没有可用目录。</p>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="reader-navigation-panel reader-search-panel" aria-label="论文全文搜索">
      <header>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            onSearch()
          }}
        >
          <Search size={15} aria-hidden="true" />
          <input
            role="searchbox"
            aria-label="搜索论文内容"
            value={query}
            placeholder="搜索论文"
            autoFocus
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </form>
        <button type="button" aria-label="关闭论文搜索" title="关闭论文搜索" onClick={onClose}>
          <X size={15} aria-hidden="true" />
        </button>
      </header>
      <div className="reader-search-results" aria-live="polite">
        {searching ? <p>正在搜索...</p> : null}
        {!searching && searchError ? <p>{searchError}</p> : null}
        {!searching && !searchError && searchSubmitted && results.length === 0 ? <p>没有找到匹配内容。</p> : null}
        {!searching && !searchError
          ? results.map((result, index) => (
              <button
                key={`${result.pageNumber}-${result.snippet}-${index}`}
                type="button"
                className="reader-search-result"
                aria-label={`第 ${result.pageNumber} 页：${result.snippet}`}
                onClick={() => onResultSelect(result)}
              >
                <small>第 {result.pageNumber} 页</small>
                <span>{result.snippet}</span>
              </button>
            ))
          : null}
      </div>
    </section>
  )
}

type PdfDocumentSource = {
  data?: Uint8Array
  url?: string
  standardFontDataUrl: string
  useSystemFonts: boolean
}

function PdfCanvasViewer({
  title,
  previewUrl,
  pdfData,
  plainText,
  onPageChange,
  initialPage = 1,
  initialScale,
  onViewStateChange,
  focusMode,
  onFocusModeChange,
  onAskAi,
  navigationControls,
  navigationPanel
}: {
  title: string
  previewUrl: string | null
  pdfData: Uint8Array | null
  plainText: string | null
  onPageChange?: (pageNumber: number) => void
  initialPage?: number
  initialScale?: number
  onViewStateChange?: (view: { page: number; scale: number }) => void
  focusMode?: boolean
  onFocusModeChange?: (focusMode: boolean) => void
  onAskAi?: () => void
  navigationControls?: ReactNode
  navigationPanel?: ReactNode
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const documentRef = useRef<PDFDocumentProxy | null>(null)
  const pdfjsRef = useRef<PdfJsModule | null>(null)
  const onPageChangeRef = useRef(onPageChange)
  const onViewStateChangeRef = useRef(onViewStateChange)
  const restoredPage = Math.max(1, Math.round(initialPage))
  const restoredScale = initialScale ? Math.min(2.2, Math.max(0.72, initialScale)) : 1.12
  const [pageNumber, setPageNumber] = useState(restoredPage)
  const [pageField, setPageField] = useState(String(restoredPage))
  const [pageCount, setPageCount] = useState(0)
  const [scale, setScale] = useState(restoredScale)
  const [fitMode, setFitMode] = useState(initialScale === undefined)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const textFallback = plainText
    ?.split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  onPageChangeRef.current = onPageChange
  onViewStateChangeRef.current = onViewStateChange

  function clampScale(value: number): number {
    return Math.min(2.2, Math.max(0.72, Number(value.toFixed(2))))
  }

  function goToPage(value: number): void {
    if (!pageCount) return
    const nextPage = Math.min(pageCount, Math.max(1, value))
    setPageNumber(nextPage)
    setPageField(String(nextPage))
  }

  function submitPageJump(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const requestedPage = Number.parseInt(pageField, 10)
    if (Number.isNaN(requestedPage)) {
      setPageField(String(pageNumber))
      return
    }
    goToPage(requestedPage)
  }

  async function fitToWidth(): Promise<void> {
    const pdf = documentRef.current
    const scroll = scrollRef.current
    if (!pdf || !scroll || status !== 'ready') return
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 1 })
    const availableWidth = Math.max(320, scroll.clientWidth - 44)
    setScale(clampScale(availableWidth / viewport.width))
  }

  function requestFitToWidth(): void {
    setFitMode(true)
    void fitToWidth()
  }

  function changeScale(delta: number): void {
    setFitMode(false)
    setScale((value) => clampScale(value + delta))
  }

  useEffect(() => {
    let alive = true
    let loadingTask: ReturnType<PdfJsModule['getDocument']> | null = null
    setStatus('loading')
    setPageNumber(restoredPage)
    setPageField(String(restoredPage))
    setPageCount(0)
    setScale(restoredScale)
    setFitMode(initialScale === undefined)
    documentRef.current = null
    pdfjsRef.current = null

    void import('pdfjs-dist/legacy/build/pdf.mjs').then(async (pdfjs) => {
      if (!alive) return
      pdfjsRef.current = pdfjs
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString()
      const isDev = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
      const standardFontDataUrl = isDev
        ? new URL('pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf', import.meta.url)
            .toString()
            .replace('LiberationSans-Regular.ttf', '')
        : new URL('./standard_fonts/', window.location.href).toString()
      const source: Omit<PdfDocumentSource, 'standardFontDataUrl' | 'useSystemFonts'> = pdfData
        ? { data: new Uint8Array(pdfData) }
        : { url: previewUrl ?? '' }
      loadingTask = pdfjs.getDocument({
        ...source,
        standardFontDataUrl,
        useSystemFonts: true
      } satisfies PdfDocumentSource)
      const pdf = await loadingTask.promise
      if (!alive) {
        loadingTask.destroy()
        return
      }
      documentRef.current = pdf
      setPageCount(pdf.numPages)
      setPageNumber(Math.min(pdf.numPages, restoredPage))
      setStatus('ready')
    }).catch(() => {
      if (alive) setStatus('error')
    })

    return () => {
      alive = false
      const loadedDocument = documentRef.current
      documentRef.current = null
      if (loadedDocument && typeof loadedDocument.destroy === 'function') void loadedDocument.destroy()
      else if (loadingTask && typeof loadingTask.destroy === 'function') void loadingTask.destroy()
    }
  }, [pdfData, initialScale, previewUrl, restoredPage, restoredScale])

  useEffect(() => {
    setPageField(String(pageNumber))
    onPageChangeRef.current?.(pageNumber)
  }, [pageNumber])

  useEffect(() => {
    if (status !== 'ready') return
    onViewStateChangeRef.current?.({ page: pageNumber, scale })
  }, [pageNumber, scale, status])

  useEffect(() => {
    if (status !== 'ready' || !fitMode) return
    void fitToWidth()

    const scroll = scrollRef.current
    if (!scroll || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => void fitToWidth())
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [fitMode, pageNumber, status])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (status !== 'ready' || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.matches('input, textarea, select, button') || target.isContentEditable)
      ) {
        return
      }
      event.preventDefault()
      goToPage(pageNumber + (event.key === 'ArrowRight' ? 1 : -1))
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pageCount, pageNumber, status])

  useEffect(() => {
    let cancelled = false
    let renderTask: RenderTask | null = null
    const canvas = canvasRef.current
    const textLayer = textLayerRef.current
    const pdf = documentRef.current
    const pdfjs = pdfjsRef.current
    if (!canvas || !textLayer || !pdf || !pdfjs || status !== 'ready') return

    void pdf.getPage(pageNumber).then((page) => {
      if (cancelled) return
      const viewport = page.getViewport({ scale })
      const outputScale = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * outputScale)
      canvas.height = Math.floor(viewport.height * outputScale)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      const context = canvas.getContext('2d')
      if (!context) {
        setStatus('error')
        return
      }
      context.setTransform(outputScale, 0, 0, outputScale, 0, 0)
      renderTask = page.render({ canvasContext: context, viewport })
      return renderTask.promise.then(async () => {
        if (cancelled) return
        textLayer.replaceChildren()
        textLayer.style.width = `${viewport.width}px`
        textLayer.style.height = `${viewport.height}px`
        // pdfjs sizes each text-layer span's font-size by var(--scale-factor).
        // Without it, spans default to factor 1 while the canvas is rendered at
        // `scale`, so the selection rects don't line up with the glyphs and
        // dragging to select jumps lines or snaps to the whole page.
        textLayer.style.setProperty('--scale-factor', String(scale))
        const textContent = await page.getTextContent()
        if (cancelled) return
        await new pdfjs.TextLayer({
          textContentSource: textContent,
          container: textLayer,
          viewport
        }).render()
      })
    }).catch((error) => {
      if (!cancelled && error instanceof Error && error.name !== 'RenderingCancelledException') setStatus('error')
    })

    return () => {
      cancelled = true
      renderTask?.cancel?.()
    }
  }, [pageNumber, scale, status])

  return (
    <section className="pdf-canvas-viewer" aria-label={`${title} PDF 阅读器`}>
      <div
        className="reader-progress-bar"
        aria-hidden="true"
        style={{ width: `${pageCount ? Math.min(100, (pageNumber / pageCount) * 100) : 0}%` }}
      />
      <div className="pdf-toolbar">
        <div className="pdf-page-controls">
          <button type="button" aria-label="上一页" disabled={pageNumber <= 1} onClick={() => setPageNumber((page) => Math.max(1, page - 1))}>
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <form className="pdf-page-jump" onSubmit={submitPageJump}>
            <input
              aria-label="跳转页码"
              inputMode="numeric"
              value={pageField}
              disabled={!pageCount}
              onBlur={() => {
                const requestedPage = Number.parseInt(pageField, 10)
                if (Number.isNaN(requestedPage)) setPageField(String(pageNumber))
                else goToPage(requestedPage)
              }}
              onChange={(event) => setPageField(event.target.value.replace(/[^\d]/g, ''))}
            />
            <span>/ {pageCount || '-'}</span>
          </form>
          <button
            type="button"
            aria-label="下一页"
            disabled={!pageCount || pageNumber >= pageCount}
            onClick={() => setPageNumber((page) => Math.min(pageCount, page + 1))}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="pdf-zoom-controls">
          <button type="button" aria-label="适合宽度" disabled={status !== 'ready'} onClick={requestFitToWidth}>
            <Maximize2 size={15} aria-hidden="true" />
          </button>
          <button type="button" aria-label="缩小" disabled={status !== 'ready'} onClick={() => changeScale(-0.12)}>
            <ZoomOut size={16} aria-hidden="true" />
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button type="button" aria-label="放大" disabled={status !== 'ready'} onClick={() => changeScale(0.12)}>
            <ZoomIn size={16} aria-hidden="true" />
          </button>
          {onFocusModeChange ? (
            <button
              type="button"
              aria-label={focusMode ? '退出专注阅读' : '进入专注阅读'}
              onClick={() => onFocusModeChange(!focusMode)}
            >
              {focusMode ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
            </button>
          ) : null}
          {onAskAi ? (
            <button
              type="button"
              className="reader-ask-ai-button"
              aria-label="问 AI（Ctrl+I）"
              title="问 AI（Ctrl+I）"
              onClick={onAskAi}
            >
              <Sparkles size={15} aria-hidden="true" />
              <span>问 AI</span>
            </button>
          ) : null}
          {navigationControls}
        </div>
      </div>
      {navigationPanel}
      <div ref={scrollRef} className="pdf-canvas-scroll">
        {status === 'loading' ? <p className="pdf-reader-state">正在载入 PDF...</p> : null}
        {status === 'error' && textFallback?.length ? (
          <section className="pdf-text-fallback" aria-label="PDF 文本内容">
            <strong>PDF 预览不可用，显示文本内容。</strong>
            {textFallback.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ) : null}
        {status === 'error' && !textFallback?.length ? (
          <p className="pdf-reader-state">PDF 预览载入失败，请检查文件是否仍在本地。</p>
        ) : null}
        <div className={status === 'ready' ? 'pdf-page-surface' : 'pdf-page-surface hidden'}>
          <canvas ref={canvasRef} className="pdf-canvas" />
          <div ref={textLayerRef} className="pdf-selectable-text-layer" data-testid="pdf-selectable-text-layer" />
        </div>
      </div>
    </section>
  )
}

export function PaperReader({
  paper,
  markdownText,
  plainText,
  previewUrl,
  pdfData,
  onPageChange,
  initialPage,
  initialScale,
  onViewStateChange,
  focusMode = false,
  onFocusModeChange,
  outline = [],
  searchResults = [],
  searching = false,
  searchError = null,
  onSearch,
  onAskAi,
  onOutlineRequest
}: PaperReaderProps): JSX.Element {
  const markdownContentRef = useRef<HTMLElement | null>(null)
  const [navigationMode, setNavigationMode] = useState<ReaderNavigationMode>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchSubmitted, setSearchSubmitted] = useState(false)
  const [requestedPage, setRequestedPage] = useState<number | null>(null)

  useEffect(() => {
    setNavigationMode(null)
    setSearchQuery('')
    setSearchSubmitted(false)
    setRequestedPage(null)
  }, [paper?.id])

  function submitSearch(): void {
    const query = searchQuery.trim()
    if (!query) return
    setSearchSubmitted(true)
    onSearch?.(query)
  }

  function navigateToPage(pageNumber: number): void {
    setRequestedPage(Math.max(1, pageNumber))
    setNavigationMode(null)
  }

  function navigateMarkdownSearch(result: PaperSearchResult): void {
    onPageChange?.(result.pageNumber)
    markdownContentRef.current?.scrollIntoView({ block: 'start' })
    setNavigationMode(null)
  }

  function navigateMarkdownOutline(item: PaperOutlineItem): void {
    const headings = Array.from(markdownContentRef.current?.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6') ?? [])
    const target = headings.find((heading) => heading.textContent?.trim() === item.heading)
    target?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    onPageChange?.(item.pageNumber)
    setNavigationMode(null)
  }

  const navigationControls = (
    <>
      <button
        type="button"
        aria-label="搜索论文"
        title="搜索论文"
        onClick={() => setNavigationMode((mode) => (mode === 'search' ? null : 'search'))}
      >
        <Search size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="论文目录"
        title="论文目录"
        onClick={() => {
          setNavigationMode((mode) => (mode === 'outline' ? null : 'outline'))
          if (navigationMode !== 'outline') onOutlineRequest?.()
        }}
      >
        <ListTree size={15} aria-hidden="true" />
      </button>
    </>
  )

  const navigationPanel = (
    <ReaderNavigationPanel
      mode={navigationMode}
      query={searchQuery}
      results={searchResults}
      outline={outline}
      searching={searching}
      searchError={searchError}
      searchSubmitted={searchSubmitted}
      onQueryChange={setSearchQuery}
      onSearch={submitSearch}
      onClose={() => setNavigationMode(null)}
      onResultSelect={paper?.fileType === 'pdf' ? (result) => navigateToPage(result.pageNumber) : navigateMarkdownSearch}
      onOutlineSelect={paper?.fileType === 'pdf' ? (item) => navigateToPage(item.pageNumber) : navigateMarkdownOutline}
    />
  )

  if (!paper) {
    return (
      <div className="reader-empty">
        <h1>选择一篇论文开始阅读</h1>
        <p>支持 PDF 和 Markdown。</p>
      </div>
    )
  }

  if (paper.fileType === 'markdown') {
    return (
      <section className="markdown-reader">
        <div className="markdown-reader-toolbar">{navigationControls}</div>
        {navigationPanel}
        <article ref={markdownContentRef} className="paper-page">
          <AcademicMarkdown>{markdownText ?? ''}</AcademicMarkdown>
        </article>
      </section>
    )
  }

  return (
    <article className="pdf-reader">
      {previewUrl || pdfData ? (
        <PdfCanvasViewer
          title={paper.title}
          previewUrl={previewUrl}
          pdfData={pdfData}
          plainText={plainText}
          onPageChange={onPageChange}
          initialPage={requestedPage ?? initialPage}
          initialScale={initialScale}
          onViewStateChange={onViewStateChange}
          focusMode={focusMode}
          onFocusModeChange={onFocusModeChange}
          onAskAi={onAskAi}
          navigationControls={navigationControls}
          navigationPanel={navigationPanel}
        />
      ) : (
        <div className="reader-empty">
          <h1>{paper.title}</h1>
          <p>无法打开 PDF 文件。</p>
        </div>
      )}
    </article>
  )
}
