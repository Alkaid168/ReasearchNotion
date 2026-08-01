import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi } from '../../src/shared/ipcTypes'
import type { AppSettings, Conversation, Folder, Message, Paper, PaperCard, ReadingStatus } from '../../src/shared/types'

const emptySettings: AppSettings = {
  difyBaseUrl: '',
  difyAppApiKey: '',
  difyKnowledgeApiKey: '',
    deepseekApiKey: '',
  defaultFolderId: null
}

const folder: Folder = {
  id: 'folder-1',
  name: '毕业设计',
  parentId: null,
  difyDatasetId: 'dataset-1',
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z'
}

const paper: Paper = {
  id: 'paper-1',
  folderId: folder.id,
  title: 'RAG Survey',
  fileType: 'markdown',
  filePath: 'rag-survey.md',
  difyDocumentId: 'doc-1',
  indexStatus: 'indexed',
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z'
}

const pdfPaper: Paper = {
  ...paper,
  id: 'paper-pdf-1',
  title: 'RAG PDF',
  fileType: 'pdf',
  filePath: 'rag-survey.pdf'
}

const evaluationPaper: Paper = {
  ...paper,
  id: 'paper-evaluation-1',
  title: 'RAG Evaluation',
  filePath: 'rag-evaluation.md'
}

const transformerPaper: Paper = {
  ...paper,
  id: 'paper-transformer-1',
  title: 'Transformer Notes',
  filePath: 'transformer-notes.md'
}

const card: PaperCard = {
  id: 'card-1',
  paperId: paper.id,
  authors: 'Lewis et al.',
  year: '2020',
  oneSentenceSummary: 'A retrieval-augmented generation survey.',
  researchProblem: 'Knowledge-intensive generation',
  methodSummary: 'Retrieve passages before generation.',
  contributions: ['Summarizes RAG systems'],
  keywords: ['RAG', 'retrieval'],
  readingStatus: 'reading',
  updatedAt: '2026-07-08T00:00:00.000Z'
}

const finishedCard: PaperCard = {
  ...card,
  id: 'card-finished-1',
  paperId: evaluationPaper.id,
  oneSentenceSummary: 'Compares retrieval evaluation metrics.',
  keywords: ['evaluation', 'metrics'],
  readingStatus: 'finished'
}

const unreadCard: PaperCard = {
  ...card,
  id: 'card-unread-1',
  paperId: transformerPaper.id,
  oneSentenceSummary: 'A note about transformer attention.',
  keywords: ['transformer', 'attention'],
  readingStatus: 'unread'
}

const paperConversation: Conversation = {
  id: 'conversation-paper-1',
  title: '解释这一段',
  folderId: folder.id,
  conversationFolderId: null,
  difyConversationId: null,
  context: { type: 'paper', paperId: paper.id, paperTitle: paper.title },
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z'
}

const assistantMessage: Message = {
  id: 'message-assistant-1',
  conversationId: paperConversation.id,
  role: 'assistant',
  content: '这段话说明 RAG 会先检索资料，再生成回答。',
  citations: [{ paperId: paper.id, paperTitle: paper.title, snippet: 'Retrieval augmented generation.', score: 0.91 }],
  createdAt: '2026-07-08T00:00:01.000Z'
}

function createApiMock(): DesktopApi {
  return {
    app: {
      getEnvironmentStatus: vi.fn()
    },
    settings: {
      get: vi.fn().mockResolvedValue(emptySettings),
      save: vi.fn().mockImplementation(async (settings: AppSettings) => settings),
      testConnection: vi.fn().mockResolvedValue({ ok: true, message: '连接配置有效。' })
    },
    folders: {
      list: vi.fn().mockResolvedValue([folder]),
      create: vi.fn(),
      rename: vi.fn(),
      delete: vi.fn()
    },
    conversationFolders: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), rename: vi.fn(), reorder: vi.fn() },
    reading: {
      updateState: vi.fn().mockResolvedValue({
        activeFolderId: null,
        activePaperId: null,
        currentPage: 1,
        selectedText: null,
        updatedAt: '2026-07-08T00:00:00.000Z'
      })
    },
    memories: { list: vi.fn(), save: vi.fn(), delete: vi.fn() },
    papers: {
      list: vi.fn().mockResolvedValue([{ ...paper, card }]),
      import: vi.fn(),
      importFiles: vi.fn(),
      updateReadingStatus: vi.fn().mockImplementation(async (_paperId: string, readingStatus: ReadingStatus) => ({
        ...card,
        readingStatus
      })),
      reindex: vi.fn(),
      delete: vi.fn(),
      getOutline: vi.fn().mockResolvedValue([]),
      searchText: vi.fn().mockResolvedValue([]),
      read: vi.fn().mockResolvedValue({
        paper,
        markdownText: '# RAG Survey\n\nRetrieval augmented generation.',
        plainText: null,
        previewUrl: null
      })
    },
    conversations: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), moveToFolder: vi.fn(), rename: vi.fn(), delete: vi.fn(), reorder: vi.fn(), sendMessage: vi.fn() },
    messages: { list: vi.fn() }
  }
}

describe('KnowledgePage', () => {
  let getSelectionSpy: ReturnType<typeof vi.spyOn> | null = null
  let clipboardDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    getSelectionSpy?.mockRestore()
    getSelectionSpy = null
    clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    window.localStorage.clear()
    window.researchNotion = createApiMock()
  })

  afterEach(() => {
    if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
    else Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('restores the last open paper when it is still in the library', async () => {
    const api = createApiMock()
    window.researchNotion = api
    window.localStorage.setItem(
      'research-notion:workspace-preferences',
      JSON.stringify({
        version: 1,
        activeTab: 'knowledge',
        selectedConversationId: null,
        selectedConversationFolderId: null,
        knowledge: {
          activeFolderId: folder.id,
          activePaperId: paper.id,
          expandedFolderIds: [folder.id],
          paperViews: {}
        }
      })
    )

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    expect(await screen.findByRole('heading', { name: 'RAG Survey' })).toBeInTheDocument()
    expect(api.papers.read).toHaveBeenCalledWith(paper.id)
    expect(screen.getByRole('button', { name: folder.name })).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows folders and papers without exposing internal reader labels', async () => {
    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    expect(await screen.findByText('毕业设计')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))

    expect(await screen.findByRole('heading', { name: 'RAG Survey' })).toBeInTheDocument()
    expect(screen.getByText('Retrieval augmented generation.')).toBeInTheDocument()
    expect(screen.queryByText('对当前论文提问')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '打开 AI 问答栏' })).not.toBeInTheDocument()
    expect(screen.queryByText('知识库')).not.toBeInTheDocument()
    expect(screen.queryByText('阅读器优先布局')).not.toBeInTheDocument()
    expect(screen.queryByText(/MVP/)).not.toBeInTheDocument()
  })

  it('uses the desktop paper search bridge from the reader search panel', async () => {
    const api = createApiMock()
    api.papers.searchText = vi.fn().mockResolvedValue([
      { pageNumber: 1, snippet: 'Retrieval augmented generation combines retrieval and generation.', score: 0.9 }
    ])
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))
    await screen.findByRole('heading', { name: 'RAG Survey' })
    fireEvent.click(screen.getByRole('button', { name: '搜索论文' }))
    const input = screen.getByRole('searchbox', { name: '搜索论文内容' })
    fireEvent.change(input, { target: { value: 'retrieval generation' } })
    fireEvent.submit(input.closest('form') as HTMLFormElement)

    await waitFor(() => {
      expect(api.papers.searchText).toHaveBeenCalledWith(paper.id, 'retrieval generation')
    })
    expect(await screen.findByText('Retrieval augmented generation combines retrieval and generation.')).toBeInTheDocument()
  })

  it('renders paper metadata without index status values', async () => {
    const api = createApiMock()
    api.papers.list = vi.fn().mockResolvedValue([
      { ...paper, indexStatus: 'local-only', difyDocumentId: null, card },
      { ...pdfPaper, indexStatus: 'failed', difyDocumentId: null, card: null }
    ])
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    expect(await screen.findByText(/Markdown.*2020/)).toBeInTheDocument()
    expect(await screen.findByText('PDF')).toBeInTheDocument()
    expect(screen.queryByText(/local-only|failed|indexed/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reindex/i })).not.toBeInTheDocument()
  })

  it('does not expose manual reindex controls in the library sidebar', async () => {
    const api = createApiMock()
    const localPaper: Paper = { ...paper, indexStatus: 'local-only', difyDocumentId: null }
    api.papers.list = vi.fn().mockResolvedValue([{ ...localPaper, card }])
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))
    expect(await screen.findByRole('heading', { name: 'RAG Survey' })).toBeInTheDocument()

    expect(api.papers.reindex).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /reindex/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/index/i)).not.toBeInTheDocument()
  })

  it('deletes the selected paper and clears the reader', async () => {
    const api = createApiMock()
    api.papers.list = vi.fn().mockResolvedValueOnce([{ ...paper, card }]).mockResolvedValueOnce([])
    api.papers.delete = vi.fn().mockResolvedValue(paper)
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))
    expect(await screen.findByRole('heading', { name: 'RAG Survey' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: '删除论文' }))
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(api.papers.delete).toHaveBeenCalledWith(paper.id)
    })
    expect(await screen.findByText('当前文件夹还没有论文。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '选择一篇论文开始阅读' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'RAG Survey' })).not.toBeInTheDocument()
    expect(screen.queryByText('Retrieval augmented generation.')).not.toBeInTheDocument()
  })

  it('keeps generated paper-card details out of the library and reader', async () => {
    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    expect(await screen.findByRole('button', { name: /RAG Survey/ })).toBeInTheDocument()
    expect(screen.queryByText('A retrieval-augmented generation survey.')).not.toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))

    expect(await screen.findByRole('heading', { name: 'RAG Survey' })).toBeInTheDocument()
    expect(screen.queryByText('Knowledge-intensive generation')).not.toBeInTheDocument()
    expect(screen.queryByText('Retrieve passages before generation.')).not.toBeInTheDocument()
    expect(screen.queryByText('Summarizes RAG systems')).not.toBeInTheDocument()
    expect(screen.queryByText('retrieval')).not.toBeInTheDocument()
  })

  it('does not expose unfinished reading-status controls in the library or reader', async () => {
    const api = createApiMock()
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))
    await screen.findByRole('heading', { name: 'RAG Survey' })

    expect(screen.queryByRole('group', { name: '阅读状态筛选' })).not.toBeInTheDocument()
    expect(api.papers.updateReadingStatus).not.toHaveBeenCalled()
  })

  it('searches library papers without exposing unfinished reading-status controls', async () => {
    const api = createApiMock()
    api.papers.list = vi.fn().mockResolvedValue([
      { ...paper, card },
      { ...evaluationPaper, card: finishedCard },
      { ...transformerPaper, card: unreadCard }
    ])
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    expect(await screen.findByText('RAG Evaluation')).toBeInTheDocument()
    expect(screen.getByText('Transformer Notes')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('搜索论文'), { target: { value: 'evaluation' } })

    expect(screen.getByText('RAG Evaluation')).toBeInTheDocument()
    expect(screen.queryByText('RAG Survey')).not.toBeInTheDocument()
    expect(screen.queryByText('Transformer Notes')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('搜索论文'), { target: { value: '' } })

    expect(screen.getByText('RAG Evaluation')).toBeInTheDocument()
    expect(screen.getByText('RAG Survey')).toBeInTheDocument()
    expect(screen.getByText('Transformer Notes')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: '阅读状态筛选' })).not.toBeInTheDocument()
  })

  it('collapses and expands the active paper folder', async () => {
    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    const folderButton = await screen.findByRole('button', { name: folder.name })
    expect(await screen.findByText('RAG Survey')).toBeInTheDocument()

    fireEvent.click(folderButton)
    expect(screen.queryByText('RAG Survey')).not.toBeInTheDocument()

    fireEvent.click(folderButton)
    expect(await screen.findByText('RAG Survey')).toBeInTheDocument()
  })

  it('keeps previously expanded paper folders visible when another folder opens', async () => {
    const api = createApiMock()
    const writingFolder: Folder = { ...folder, id: 'folder-writing', name: '写作参考', difyDatasetId: null }
    const writingPaper: Paper = {
      ...paper,
      id: 'paper-writing',
      folderId: writingFolder.id,
      title: 'Writing Notes',
      filePath: 'writing-notes.md'
    }
    api.folders.list = vi.fn().mockResolvedValue([folder, writingFolder])
    api.papers.list = vi
      .fn()
      .mockImplementation(async (folderId: string) =>
        folderId === folder.id ? [{ ...paper, card }] : [{ ...writingPaper, card: { ...card, paperId: writingPaper.id } }]
      )
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    expect(await screen.findByText('RAG Survey')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: writingFolder.name }))

    expect(await screen.findByText('Writing Notes')).toBeInTheDocument()
    expect(screen.getByText('RAG Survey')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: folder.name })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: writingFolder.name })).toHaveAttribute('aria-expanded', 'true')
  })

  it('clears the reader when deleting the folder that owns the open paper', async () => {
    const api = createApiMock()
    const writingFolder: Folder = { ...folder, id: 'folder-writing', name: '写作参考', difyDatasetId: null }
    api.folders.list = vi.fn().mockResolvedValue([folder, writingFolder])
    api.folders.delete = vi.fn().mockResolvedValue(folder)
    api.papers.list = vi
      .fn()
      .mockImplementation(async (folderId: string) => (folderId === folder.id ? [{ ...paper, card }] : []))
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))
    expect(await screen.findByRole('heading', { name: 'RAG Survey' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: writingFolder.name }))
    fireEvent.click(screen.getByRole('button', { name: `删除 ${folder.name}` }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除论文库' }))

    await waitFor(() => {
      expect(api.folders.delete).toHaveBeenCalledWith(folder.id)
    })
    expect(screen.queryByRole('heading', { name: 'RAG Survey' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '选择一篇论文开始阅读' })).toBeInTheDocument()
  })

  it('shows import progress and reports import failures in the library sidebar', async () => {
    const api = createApiMock()
    let rejectImport!: (error: Error) => void
    api.papers.import = vi.fn(
      () =>
        new Promise<Paper[]>((_resolve, reject) => {
          rejectImport = reject
        })
    )
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    fireEvent.click(await screen.findByRole('button', { name: '导入 PDF / Markdown' }))

    const importingButtons = screen.getAllByRole('button', { name: '正在导入...' })
    expect(importingButtons).toHaveLength(2)
    importingButtons.forEach((button) => expect(button).toBeDisabled())

    await act(async () => {
      rejectImport(new Error('当前论文库还没有关联 Dify dataset。'))
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('当前论文库还没有关联 Dify dataset。')
    expect(screen.getByRole('button', { name: '导入 PDF / Markdown' })).not.toBeDisabled()
  })

  it('imports supported papers dropped onto the library sidebar', async () => {
    const api = createApiMock()
    const importFiles = vi.fn().mockResolvedValue([pdfPaper, paper])
    Object.assign(api.papers, { importFiles })
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    const dropZone = await screen.findByLabelText('论文拖放导入区')
    const files = [
      new File(['pdf'], 'attention.pdf', { type: 'application/pdf' }),
      new File(['markdown'], 'notes.md', { type: 'text/markdown' })
    ]

    fireEvent.dragEnter(dropZone, { dataTransfer: { files, types: ['Files'] } })
    expect(dropZone).toHaveClass('drag-active')
    expect(screen.getByText('松开以导入到「毕业设计」')).toBeInTheDocument()

    fireEvent.drop(dropZone, { dataTransfer: { files, types: ['Files'] } })

    await waitFor(() => {
      expect(importFiles).toHaveBeenNthCalledWith(1, folder.id, [files[0]])
      expect(importFiles).toHaveBeenNthCalledWith(2, folder.id, [files[1]])
    })
    expect(api.papers.list).toHaveBeenCalledWith(folder.id)
    expect(dropZone).not.toHaveClass('drag-active')
  })

  it('collapses and restores the library sidebar with Ctrl+B', async () => {
    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    await screen.findByText(folder.name)
    const layout = document.querySelector('.knowledge-layout')
    expect(layout).not.toHaveClass('sidebar-collapsed')

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    expect(layout).toHaveClass('sidebar-collapsed')

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    expect(layout).not.toHaveClass('sidebar-collapsed')
  })

  it('opens a requested paper at the citation evidence page', async () => {
    const api = createApiMock()
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage requestedPaperId={paper.id} requestedPage={3} requestNonce={1} />)

    await waitFor(() => {
      expect(api.reading.updateState).toHaveBeenCalledWith(expect.objectContaining({ activePaperId: paper.id, currentPage: 3 }))
    })
  })

  it('shows per-file import feedback and skips duplicate paper titles', async () => {
    const api = createApiMock()
    const importedPaper: Paper = { ...pdfPaper, title: 'New Evidence' }
    const importFiles = vi.fn().mockResolvedValue([importedPaper])
    Object.assign(api.papers, { importFiles })
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    const dropZone = await screen.findByLabelText('论文拖放导入区')
    const files = [
      new File(['duplicate'], 'RAG Survey.md', { type: 'text/markdown' }),
      new File(['new'], 'New Evidence.pdf', { type: 'application/pdf' })
    ]
    fireEvent.drop(dropZone, { dataTransfer: { files, types: ['Files'] } })

    await waitFor(() => expect(importFiles).toHaveBeenCalledWith(folder.id, [files[1]]))
    expect(screen.getByText('RAG Survey.md')).toBeInTheDocument()
    expect(screen.getByText('已跳过重复文件')).toBeInTheDocument()
    expect(screen.getByText('New Evidence.pdf')).toBeInTheDocument()
    expect(screen.getByText('已导入')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '清除导入记录' }))
    expect(screen.queryByLabelText('导入队列')).not.toBeInTheDocument()
  })

  it('rejects unsupported files before starting a dropped import', async () => {
    const api = createApiMock()
    const importFiles = vi.fn()
    Object.assign(api.papers, { importFiles })
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    const dropZone = await screen.findByLabelText('论文拖放导入区')
    const files = [new File(['notes'], 'notes.txt', { type: 'text/plain' })]
    fireEvent.drop(dropZone, { dataTransfer: { files, types: ['Files'] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('仅支持 PDF、Markdown（.md / .markdown）文件。')
    expect(importFiles).not.toHaveBeenCalled()
  })

  it('toggles the AI drawer with Ctrl+I after a paper is open and includes selected text context', async () => {
    getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'Retrieval augmented generation.'
    } as Selection)

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    await screen.findByText('毕业设计')
    fireEvent.keyDown(window, { key: 'i', ctrlKey: true })

    expect(screen.queryByText('对当前论文提问')).not.toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))
    expect(await screen.findByRole('heading', { name: 'RAG Survey' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'i', ctrlKey: true })

    expect(await screen.findByLabelText('论文提问输入')).toBeInTheDocument()
    expect(screen.queryByText('对当前论文提问')).not.toBeInTheDocument()
    expect(screen.queryByText('强调上下文')).not.toBeInTheDocument()
    expect(screen.getAllByText('Retrieval augmented generation.')).toHaveLength(2)

    fireEvent.keyDown(window, { key: 'i', ctrlKey: true })

    await waitFor(() => expect(screen.queryByLabelText('论文提问输入')).not.toBeInTheDocument())
  })

  it('does not toggle the AI drawer with Ctrl+J', async () => {
    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))
    expect(await screen.findByRole('heading', { name: 'RAG Survey' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true })

    expect(screen.queryByText('对当前论文提问')).not.toBeInTheDocument()
  })

  it('syncs the active reading state for local Agent tools', async () => {
    getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'Retrieval augmented generation.'
    } as Selection)
    const api = createApiMock()
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))

    await waitFor(() => {
      expect(api.reading.updateState).toHaveBeenCalledWith({
        activeFolderId: folder.id,
        activePaperId: paper.id,
        currentPage: 1,
        selectedText: null
      })
    })

    fireEvent.keyDown(window, { key: 'i', ctrlKey: true })

    await waitFor(() => {
      expect(api.reading.updateState).toHaveBeenLastCalledWith({
        activeFolderId: folder.id,
        activePaperId: paper.id,
        currentPage: 1,
        selectedText: 'Retrieval augmented generation.'
      })
    })
  })

  it('asks about the open paper with selected text as emphasis context', async () => {
    getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'Retrieval augmented generation.'
    } as Selection)
    const api = createApiMock()
    api.conversations.create = vi.fn().mockResolvedValue(paperConversation)
    api.conversations.sendMessage = vi.fn().mockResolvedValue(assistantMessage)
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))
    expect(await screen.findByRole('heading', { name: 'RAG Survey' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'i', ctrlKey: true })

    fireEvent.change(await screen.findByLabelText('论文提问输入'), { target: { value: '解释这一段' } })
    fireEvent.click(screen.getByRole('button', { name: '发送问题' }))

    await waitFor(() => {
      expect(api.conversations.create).toHaveBeenCalledWith({
        title: '解释这一段',
        folderId: folder.id,
        context: { type: 'paper', paperId: paper.id, paperTitle: paper.title }
      })
      expect(api.conversations.sendMessage).toHaveBeenCalledWith(paperConversation.id, '解释这一段', {
        emphasisContext: 'Retrieval augmented generation.'
      })
    })
    expect(screen.getByText('解释这一段')).toBeInTheDocument()
    expect(await screen.findByText('这段话说明 RAG 会先检索资料，再生成回答。')).toBeInTheDocument()
    expect(screen.getAllByText('RAG Survey').length).toBeGreaterThan(0)
  })

  it('removes selected emphasis context before sending a paper question', async () => {
    getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'Retrieval augmented generation.'
    } as Selection)
    const api = createApiMock()
    api.conversations.create = vi.fn().mockResolvedValue(paperConversation)
    api.conversations.sendMessage = vi.fn().mockResolvedValue(assistantMessage)
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))
    expect(await screen.findByRole('heading', { name: 'RAG Survey' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'i', ctrlKey: true })
    expect(await screen.findByLabelText('选中文本')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '移除选中文本' }))
    expect(screen.queryByLabelText('选中文本')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('论文提问输入'), { target: { value: '解释这一段' } })
    fireEvent.click(screen.getByRole('button', { name: '发送问题' }))

    await waitFor(() => {
      expect(api.conversations.sendMessage).toHaveBeenCalledWith(paperConversation.id, '解释这一段')
      expect(api.reading.updateState).toHaveBeenLastCalledWith(
        expect.objectContaining({ activePaperId: paper.id, selectedText: null })
      )
    })
  })

  it('restores each paper AI thread after switching papers', async () => {
    const api = createApiMock()
    api.papers.list = vi.fn().mockResolvedValue([
      { ...paper, card },
      { ...evaluationPaper, card: finishedCard }
    ])
    api.papers.read = vi.fn().mockImplementation(async (paperId: string) => {
      const selected = paperId === paper.id ? paper : evaluationPaper
      return {
        paper: selected,
        markdownText: `# ${selected.title}`,
        plainText: null,
        previewUrl: null,
        pdfData: null
      }
    })
    api.conversations.create = vi.fn().mockResolvedValue(paperConversation)
    api.conversations.sendMessage = vi.fn().mockResolvedValue(assistantMessage)
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))
    expect(await screen.findByRole('heading', { name: 'RAG Survey' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'i', ctrlKey: true })
    fireEvent.change(await screen.findByLabelText('论文提问输入'), { target: { value: '解释这一段' } })
    fireEvent.click(screen.getByRole('button', { name: '发送问题' }))
    expect(await screen.findByText('这段话说明 RAG 会先检索资料，再生成回答。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /RAG Evaluation/ }))
    expect(await screen.findByRole('heading', { name: 'RAG Evaluation' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /RAG Survey/ }))
    expect(await screen.findByRole('heading', { name: 'RAG Survey' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'i', ctrlKey: true })

    expect(await screen.findByText('这段话说明 RAG 会先检索资料，再生成回答。')).toBeInTheDocument()
  })

  it('restores the latest saved paper conversation when the drawer opens', async () => {
    const api = createApiMock()
    api.conversations.list = vi.fn().mockResolvedValue([paperConversation])
    api.messages.list = vi.fn().mockResolvedValue([
      { ...assistantMessage, id: 'message-user-restore', role: 'user', content: 'Explain this passage', citations: [] },
      assistantMessage
    ])
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))
    await screen.findByRole('heading', { name: 'RAG Survey' })
    fireEvent.keyDown(window, { key: 'i', ctrlKey: true })

    expect(await screen.findByText(assistantMessage.content)).toBeInTheDocument()
    expect(api.messages.list).toHaveBeenCalledWith(paperConversation.id)
    expect(document.querySelector('.ai-suggestions')).toBeNull()
  })

  it('copies an answer from the paper AI drawer', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })
    const api = createApiMock()
    api.conversations.create = vi.fn().mockResolvedValue(paperConversation)
    api.conversations.sendMessage = vi.fn().mockResolvedValue(assistantMessage)
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))
    await screen.findByRole('heading', { name: 'RAG Survey' })
    fireEvent.keyDown(window, { key: 'i', ctrlKey: true })
    const input = await waitFor(() => {
      const element = document.querySelector<HTMLTextAreaElement>('.drawer-composer textarea')
      expect(element).not.toBeNull()
      return element!
    })
    fireEvent.change(input, { target: { value: 'Explain this passage' } })
    fireEvent.click(document.querySelector<HTMLButtonElement>('.drawer-composer button')!)

    await waitFor(() => expect(api.conversations.sendMessage).toHaveBeenCalled())
    const copyButton = await waitFor(() => {
      const element = document.querySelector<HTMLButtonElement>('.ai-message.assistant .ai-message-actions button')
      expect(element).not.toBeNull()
      return element!
    })
    fireEvent.click(copyButton)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(assistantMessage.content))
  })

  it('resizes the paper AI drawer within readable bounds', async () => {
    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))
    expect(await screen.findByRole('heading', { name: 'RAG Survey' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'i', ctrlKey: true })

    const drawer = await screen.findByLabelText('论文 AI 问答栏')
    const resizeHandle = screen.getByRole('button', { name: '调整 AI 问答栏宽度' })
    fireEvent.mouseDown(resizeHandle, { button: 0, clientX: 500 })
    fireEvent.mouseMove(window, { clientX: 400 })
    expect(drawer).toHaveStyle({ width: '480px' })

    fireEvent.mouseMove(window, { clientX: -500 })
    expect(drawer).toHaveStyle({ width: '560px' })
    fireEvent.mouseUp(window)
  })

  it('sends paper questions with Enter and keeps Shift+Enter for new lines', async () => {
    const api = createApiMock()
    let resolveReply!: (message: Message) => void
    api.conversations.create = vi.fn().mockResolvedValue(paperConversation)
    api.conversations.sendMessage = vi.fn(
      () =>
        new Promise<Message>((resolve) => {
          resolveReply = resolve
        })
    )
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))
    expect(await screen.findByRole('heading', { name: 'RAG Survey' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'i', ctrlKey: true })

    const input = (await screen.findByLabelText('论文提问输入')) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '解释这一段' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

    expect(api.conversations.create).not.toHaveBeenCalled()
    expect(input).toHaveValue('解释这一段')

    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(api.conversations.sendMessage).toHaveBeenCalledWith(paperConversation.id, '解释这一段')
    })
    expect(input).toHaveValue('')

    resolveReply(assistantMessage)
    expect(await screen.findByText('这段话说明 RAG 会先检索资料，再生成回答。')).toBeInTheDocument()
  })

  it('updates the paper AI drawer progress from Dify streaming events', async () => {
    const api = createApiMock()
    let resolveReply!: (message: Message) => void
    let progressListener!: Parameters<NonNullable<DesktopApi['conversations']['onSendProgress']>>[0]
    const unsubscribeProgress = vi.fn()
    api.conversations.create = vi.fn().mockResolvedValue(paperConversation)
    api.conversations.onSendProgress = vi.fn((listener) => {
      progressListener = listener
      return unsubscribeProgress
    })
    api.conversations.sendMessage = vi.fn(
      () =>
        new Promise<Message>((resolve) => {
          resolveReply = resolve
        })
    )
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))
    expect(await screen.findByRole('heading', { name: 'RAG Survey' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'i', ctrlKey: true })

    fireEvent.change(await screen.findByLabelText('论文提问输入'), { target: { value: '总结当前页' } })
    fireEvent.click(screen.getByRole('button', { name: '发送问题' }))

    await waitFor(() => expect(api.conversations.sendMessage).toHaveBeenCalled())
    const progressRequestId = vi.mocked(api.conversations.sendMessage).mock.calls[0][2]?.progressRequestId
    expect(progressRequestId).toMatch(/^progress-/)

    act(() => {
      progressListener({
        requestId: progressRequestId!,
        phase: 'tool',
        toolName: 'search_library',
        label: '检索论文库'
      })
    })

    expect(await screen.findByRole('status')).toHaveTextContent('检索论文库')

    await act(async () => {
      resolveReply(assistantMessage)
    })

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(unsubscribeProgress).toHaveBeenCalled()
    })
  })

  it('renders streamed text in the paper AI drawer and stops the matching request', async () => {
    const api = createApiMock()
    let progressListener!: Parameters<NonNullable<DesktopApi['conversations']['onSendProgress']>>[0]
    api.conversations.create = vi.fn().mockResolvedValue(paperConversation)
    api.conversations.onSendProgress = vi.fn((listener) => {
      progressListener = listener
      return vi.fn()
    })
    api.conversations.cancelSend = vi.fn().mockResolvedValue(true)
    api.conversations.sendMessage = vi.fn(() => new Promise<Message>(() => undefined))
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)
    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))
    expect(await screen.findByRole('heading', { name: 'RAG Survey' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'i', ctrlKey: true })
    fireEvent.change(await screen.findByLabelText('论文提问输入'), { target: { value: '总结当前页' } })
    fireEvent.click(screen.getByRole('button', { name: '发送问题' }))

    await waitFor(() => expect(api.conversations.sendMessage).toHaveBeenCalled())
    const progressRequestId = vi.mocked(api.conversations.sendMessage).mock.calls[0][2]?.progressRequestId
    act(() => progressListener({ requestId: progressRequestId!, phase: 'delta', label: '生成回答', delta: '流式论文回答。' }))
    expect(await screen.findByText('流式论文回答。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '停止生成' }))
    expect(api.conversations.cancelSend).toHaveBeenCalledWith(progressRequestId)
  })

  it('labels paper AI answers without citations as general analysis', async () => {
    const api = createApiMock()
    api.conversations.create = vi.fn().mockResolvedValue(paperConversation)
    api.conversations.sendMessage = vi.fn().mockResolvedValue({ ...assistantMessage, citations: [] })
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))
    expect(await screen.findByRole('heading', { name: 'RAG Survey' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'i', ctrlKey: true })
    fireEvent.change(await screen.findByLabelText('论文提问输入'), { target: { value: '解释这一段' } })
    fireEvent.click(screen.getByRole('button', { name: '发送问题' }))

    expect(await screen.findByText('这段话说明 RAG 会先检索资料，再生成回答。')).toBeInTheDocument()
    expect(screen.getByText('通用分析')).toBeInTheDocument()
  })

  it('shows a readable AI drawer error and keeps the draft when paper chat fails', async () => {
    getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'Retrieval augmented generation.'
    } as Selection)
    const api = createApiMock()
    api.conversations.create = vi.fn().mockResolvedValue(paperConversation)
    api.conversations.sendMessage = vi
      .fn()
      .mockRejectedValue(new Error("Error invoking remote method 'conversations:sendMessage': Error: 请先配置 Dify。"))
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))
    expect(await screen.findByRole('heading', { name: 'RAG Survey' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'i', ctrlKey: true })

    const input = await screen.findByLabelText('论文提问输入')
    fireEvent.change(input, { target: { value: '解释实验局限' } })
    fireEvent.click(screen.getByRole('button', { name: '发送问题' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('请先配置 Dify。')
    expect(screen.getByRole('alert')).not.toHaveTextContent('Error invoking remote method')
    expect(screen.getByLabelText('论文提问输入')).toHaveValue('解释实验局限')
    expect(screen.queryAllByText('解释实验局限').filter((element) => element.tagName === 'P')).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('论文提问输入'), { target: { value: '重新解释实验局限' } })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders a local PDF preview when a PDF paper is opened', async () => {
    const api = createApiMock()
    api.papers.list = vi.fn().mockResolvedValue([{ ...pdfPaper, card }])
    api.papers.read = vi.fn().mockResolvedValue({
      paper: pdfPaper,
      markdownText: null,
      plainText: 'Retrieval augmented generation connects retrieval with generation.',
      previewUrl: 'file:///C:/Users/51044/AppData/Roaming/ResearchNotion/papers/paper-pdf-1.pdf'
    })
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    fireEvent.click(await screen.findByRole('button', { name: /RAG PDF/ }))

    expect(await screen.findByLabelText('RAG PDF PDF 阅读器')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '放大' })).toBeInTheDocument()
    expect(await screen.findByText('PDF 预览不可用，显示文本内容。')).toBeInTheDocument()
    expect(screen.getByText('Retrieval augmented generation connects retrieval with generation.')).toBeInTheDocument()
    expect(screen.queryByText('A retrieval-augmented generation survey.')).not.toBeInTheDocument()
    expect(screen.queryByText('PDF 阅读器将在导入流程接通后显示本地文件预览。')).not.toBeInTheDocument()
  })

  it('creates a paper folder from the library sidebar', async () => {
    const api = createApiMock()
    const newFolder: Folder = {
      ...folder,
      id: 'folder-2',
      name: '创新实训',
      difyDatasetId: null
    }
    api.folders.list = vi.fn().mockResolvedValue([])
    api.folders.create = vi.fn().mockResolvedValue(newFolder)
    api.papers.list = vi.fn().mockResolvedValue([])
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    fireEvent.click(await screen.findByRole('button', { name: '新建论文库' }))
    fireEvent.change(screen.getByLabelText('论文库名称'), { target: { value: '创新实训' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    expect(api.folders.create).toHaveBeenCalledWith('创新实训', null)
    expect(await screen.findByText('创新实训')).toBeInTheDocument()
  })

  it('renames a paper folder from the library sidebar', async () => {
    const api = createApiMock()
    const renamedFolder: Folder = { ...folder, name: 'RAG 论文库' }
    api.folders.rename = vi.fn().mockResolvedValue(renamedFolder)
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    expect(await screen.findByText(folder.name)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `重命名 ${folder.name}` }))
    fireEvent.change(screen.getByLabelText('论文库名称'), { target: { value: 'RAG 论文库' } })
    fireEvent.click(screen.getByRole('button', { name: '保存论文库名称' }))

    await waitFor(() => {
      expect(api.folders.rename).toHaveBeenCalledWith(folder.id, 'RAG 论文库')
    })
    expect(await screen.findByText('RAG 论文库')).toBeInTheDocument()
    expect(screen.queryByText(folder.name)).not.toBeInTheDocument()
  })

  it('deletes a paper folder from the library sidebar and selects the next folder', async () => {
    const api = createApiMock()
    const nextFolder: Folder = { ...folder, id: 'folder-2', name: '写作参考', difyDatasetId: null }
    api.folders.list = vi.fn().mockResolvedValue([folder, nextFolder])
    api.folders.delete = vi.fn().mockResolvedValue(folder)
    api.papers.list = vi
      .fn()
      .mockResolvedValueOnce([{ ...paper, card }])
      .mockResolvedValueOnce([])
    window.researchNotion = api

    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    expect(await screen.findByText(folder.name)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `删除 ${folder.name}` }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除论文库' }))

    await waitFor(() => {
      expect(api.folders.delete).toHaveBeenCalledWith(folder.id)
    })
    expect(screen.queryByText(folder.name)).not.toBeInTheDocument()
    expect(await screen.findByText(nextFolder.name)).toBeInTheDocument()
    await waitFor(() => {
      expect(api.papers.list).toHaveBeenLastCalledWith(nextFolder.id)
    })
  })
})
