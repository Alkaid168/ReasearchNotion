import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PaperReader } from '../../src/renderer/components/PaperReader'
import type { Paper } from '../../src/shared/types'

const renderPdfPage = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }))
const renderTextLayer = vi.fn(() => ({ render: vi.fn(() => Promise.resolve()) }))
const getPdfPage = vi.fn(async () => ({
  getViewport: ({ scale }: { scale: number }) => ({ width: 500 * scale, height: 700 * scale }),
  render: renderPdfPage,
  getTextContent: vi.fn(async () => ({ items: [] }))
}))

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: renderTextLayer,
  getDocument: vi.fn(() => ({
    promise: Promise.resolve({
      numPages: 3,
      getPage: getPdfPage
    }),
    destroy: vi.fn()
  }))
}))

const pdfPaper: Paper = {
  id: 'paper-pdf-1',
  folderId: 'folder-1',
  title: 'RAG PDF',
  fileType: 'pdf',
  filePath: 'rag.pdf',
  difyDocumentId: 'doc-1',
  indexStatus: 'indexed',
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z'
}

const markdownPaper: Paper = {
  ...pdfPaper,
  id: 'paper-md-1',
  title: 'RAG Notes',
  fileType: 'markdown',
  filePath: 'rag.md'
}

describe('PaperReader', () => {
  let getContextSpy: { mockRestore(): void }

  beforeEach(() => {
    renderPdfPage.mockClear()
    renderTextLayer.mockClear()
    getPdfPage.mockClear()
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      setTransform: vi.fn()
    } as unknown as CanvasRenderingContext2D)
  })

  afterEach(() => {
    getContextSpy.mockRestore()
  })

  it('renders markdown papers without PDF controls', () => {
    render(
      <PaperReader
        paper={markdownPaper}
        markdownText={'# 摘要\n\nRetrieval augmented generation.'}
        plainText="Retrieval augmented generation."
        previewUrl={null}
        pdfData={null}
      />
    )

    expect(screen.getByRole('heading', { name: '摘要' })).toBeInTheDocument()
    expect(screen.queryByLabelText('跳转页码')).not.toBeInTheDocument()
  })

  it('supports PDF page jumps and fit-width zoom', async () => {
    render(
      <PaperReader
        paper={pdfPaper}
        markdownText={null}
        plainText={null}
        previewUrl={null}
        pdfData={new Uint8Array([1, 2, 3])}
      />
    )

    const pageInput = (await screen.findByLabelText('跳转页码')) as HTMLInputElement
    await waitFor(() => expect(screen.getByText('/ 3')).toBeInTheDocument())
    expect(pageInput).toHaveValue('1')
    expect(screen.getByText('112%')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(pageInput).toHaveValue('2'))

    fireEvent.change(pageInput, { target: { value: '3' } })
    fireEvent.submit(pageInput.closest('form') as HTMLFormElement)
    await waitFor(() => expect(pageInput).toHaveValue('3'))

    fireEvent.click(screen.getByRole('button', { name: '适合宽度' }))
    await waitFor(() => expect(screen.getByText('72%')).toBeInTheDocument())
  })

  it('renders a selectable text layer over the PDF canvas', async () => {
    render(
      <PaperReader
        paper={pdfPaper}
        markdownText={null}
        plainText={null}
        previewUrl={null}
        pdfData={new Uint8Array([1, 2, 3])}
      />
    )

    expect(await screen.findByTestId('pdf-selectable-text-layer')).toBeInTheDocument()
    await waitFor(() => expect(renderTextLayer).toHaveBeenCalledTimes(1))
  })

  it('restores a saved page and zoom for a paper', async () => {
    render(
      <PaperReader
        paper={pdfPaper}
        markdownText={null}
        plainText={null}
        previewUrl={null}
        pdfData={new Uint8Array([1, 2, 3])}
        {...({ initialPage: 2, initialScale: 1.4 } as Record<string, unknown>)}
      />
    )

    await waitFor(() => expect(screen.getByText('/ 3')).toBeInTheDocument())
    expect(screen.getByLabelText('跳转页码')).toHaveValue('2')
    expect(screen.getByText('140%')).toBeInTheDocument()
  })

  it('uses arrow keys to turn PDF pages outside editable controls', async () => {
    render(
      <PaperReader
        paper={pdfPaper}
        markdownText={null}
        plainText={null}
        previewUrl={null}
        pdfData={new Uint8Array([1, 2, 3])}
      />
    )

    await waitFor(() => expect(screen.getByText('/ 3')).toBeInTheDocument())
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    await waitFor(() => expect(screen.getByLabelText('跳转页码')).toHaveValue('2'))
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    await waitFor(() => expect(screen.getByLabelText('跳转页码')).toHaveValue('1'))
  })

  it('offers a focus reading mode from the PDF toolbar', async () => {
    const onFocusModeChange = vi.fn()
    render(
      <PaperReader
        paper={pdfPaper}
        markdownText={null}
        plainText={null}
        previewUrl={null}
        pdfData={new Uint8Array([1, 2, 3])}
        {...({ focusMode: false, onFocusModeChange } as Record<string, unknown>)}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: '进入专注阅读' }))
    expect(onFocusModeChange).toHaveBeenCalledWith(true)
  })

  it('searches paper text and navigates a PDF result to its page', async () => {
    const onSearch = vi.fn()
    const onPageChange = vi.fn()
    render(
      <PaperReader
        paper={pdfPaper}
        markdownText={null}
        plainText={null}
        previewUrl={null}
        pdfData={new Uint8Array([1, 2, 3])}
        {...({
          searchResults: [{ pageNumber: 3, snippet: 'Scaled dot-product attention appears here.', score: 0.92 }],
          onSearch,
          onPageChange
        } as Record<string, unknown>)}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: '搜索论文' }))
    const input = screen.getByRole('searchbox', { name: '搜索论文内容' })
    fireEvent.change(input, { target: { value: 'scaled attention' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)
    expect(onSearch).toHaveBeenCalledWith('scaled attention')

    fireEvent.click(screen.getByRole('button', { name: /第 3 页/ }))
    await waitFor(() => expect(onPageChange).toHaveBeenCalledWith(3))
  })

  it('opens the paper outline and navigates to a selected section', async () => {
    const onPageChange = vi.fn()
    const onOutlineRequest = vi.fn()
    render(
      <PaperReader
        paper={pdfPaper}
        markdownText={null}
        plainText={null}
        previewUrl={null}
        pdfData={new Uint8Array([1, 2, 3])}
        {...({
          outline: [{ level: 2, heading: '3 Method', pageNumber: 2, preview: 'The model uses evidence planning.' }],
          onPageChange,
          onOutlineRequest
        } as Record<string, unknown>)}
      />
    )

    fireEvent.click(await screen.findByRole('button', { name: '论文目录' }))
    expect(onOutlineRequest).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /3 Method/ }))
    await waitFor(() => expect(onPageChange).toHaveBeenCalledWith(2))
  })

  it('falls back to extracted text when PDF preview rendering fails', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    vi.mocked(pdfjs.getDocument).mockReturnValueOnce({
      promise: Promise.reject(new Error('worker failed')),
      destroy: vi.fn()
    } as unknown as ReturnType<typeof pdfjs.getDocument>)

    render(
      <PaperReader
        paper={pdfPaper}
        markdownText={null}
        plainText={'Retrieval augmented generation connects retrieval with generation.\n\nIt keeps reading usable.'}
        previewUrl={null}
        pdfData={new Uint8Array([1, 2, 3])}
      />
    )

    expect(await screen.findByText('PDF 预览不可用，显示文本内容。')).toBeInTheDocument()
    expect(screen.getByText('Retrieval augmented generation connects retrieval with generation.')).toBeInTheDocument()
    expect(screen.getByText('It keeps reading usable.')).toBeInTheDocument()
  })
})
