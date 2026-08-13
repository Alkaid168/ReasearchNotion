import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/App'
import type { DesktopApi } from '../../src/shared/ipcTypes'
import type { AppSettings, Conversation, ConversationFolder, Folder, Message, Paper } from '../../src/shared/types'

const emptySettings: AppSettings = {
  difyBaseUrl: '',
  difyAppApiKey: '',
  difyKnowledgeApiKey: '',
    deepseekApiKey: '',
  defaultFolderId: null,
  activeModelProfileId: null
}

function createApiMock(): DesktopApi {
  return {
    app: {
      getEnvironmentStatus: vi.fn()
    },
    settings: {
      get: vi.fn().mockResolvedValue(emptySettings),
      save: vi.fn().mockImplementation(async (settings: AppSettings) => settings),
      testConnection: vi.fn().mockResolvedValue({ ok: true, message: 'valid' })
    },
    folders: { list: vi.fn().mockResolvedValue([]), create: vi.fn(), rename: vi.fn(), delete: vi.fn() },
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
    memories: { list: vi.fn().mockResolvedValue([]), save: vi.fn(), delete: vi.fn() },
    papers: { list: vi.fn().mockResolvedValue([]), import: vi.fn(), importFiles: vi.fn(), updateReadingStatus: vi.fn(), reindex: vi.fn(), delete: vi.fn(), getOutline: vi.fn().mockResolvedValue([]), searchText: vi.fn().mockResolvedValue([]), read: vi.fn() },
    conversations: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      moveToFolder: vi.fn(),
      rename: vi.fn(),
      updateContext: vi.fn().mockResolvedValue({}),
      delete: vi.fn(),
      reorder: vi.fn(),
      sendMessage: vi.fn()
    },
    messages: { list: vi.fn().mockResolvedValue([]) },
    modelProfiles: { list: vi.fn().mockResolvedValue([]), save: vi.fn(), delete: vi.fn(), setActive: vi.fn() }
  }
}

const outsideConversation: Conversation = {
  id: 'conversation-outside',
  title: 'Hello outside',
  folderId: null,
  conversationFolderId: null,
  difyConversationId: null,
  context: { type: 'free' },
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:01.000Z'
}

const readingFolder: ConversationFolder = {
  id: 'conversation-folder-reading',
  name: 'Reading',
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z'
}

const paperFolder: Folder = {
  id: 'folder-rag',
  name: 'RAG 论文库',
  parentId: null,
  difyDatasetId: 'dataset-rag',
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z'
}

const ragPaper: Paper = {
  id: 'paper-rag',
  folderId: paperFolder.id,
  title: 'RAG 综述笔记',
  fileType: 'markdown',
  filePath: 'F:/papers/rag.md',
  difyDocumentId: 'doc-rag',
  indexStatus: 'indexed',
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z'
}

const folderConversation: Conversation = {
  id: 'conversation-folder-chat',
  title: 'Folder chat',
  folderId: null,
  conversationFolderId: readingFolder.id,
  difyConversationId: null,
  context: { type: 'free' },
  createdAt: '2026-07-08T00:00:02.000Z',
  updatedAt: '2026-07-08T00:00:03.000Z'
}

const historyMessages: Message[] = [
  {
    id: 'message-user',
    conversationId: outsideConversation.id,
    role: 'user',
    content: 'Explain attention',
    citations: [],
    createdAt: '2026-07-08T00:00:00.000Z'
  },
  {
    id: 'message-assistant',
    conversationId: outsideConversation.id,
    role: 'assistant',
    content: 'Attention weighs related tokens.',
    citations: [],
    createdAt: '2026-07-08T00:00:01.000Z'
  }
]

const assistantReply: Message = {
  id: 'message-reply',
  conversationId: folderConversation.id,
  role: 'assistant',
  content: 'Draft the review by retrieval, generation, and evaluation.',
  citations: [],
  createdAt: '2026-07-08T00:00:04.000Z'
}

function mockElementFromPoint() {
  const originalElementFromPoint = document.elementFromPoint
  const elementFromPoint = vi.fn()
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: elementFromPoint
  })
  return {
    elementFromPoint,
    restore: () =>
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: originalElementFromPoint
      })
  }
}

function mockRowRect(element: Element, top: number): void {
  element.getBoundingClientRect = vi.fn(
    () =>
      ({
        top,
        bottom: top + 32,
        left: 0,
        right: 220,
        width: 220,
        height: 32,
        x: 0,
        y: top,
        toJSON: () => ({})
      }) as DOMRect
  )
}

function mouseDragTo(source: Element, clientY = 32): void {
  const handle = source.querySelector('.drag-grip-button') ?? source
  fireEvent.mouseDown(handle, { button: 0, clientX: 10, clientY: 10 })
  fireEvent.mouseMove(window, { clientX: 10, clientY })
  fireEvent.mouseUp(window, { clientX: 10, clientY })
}

function mouseDragMoveTo(source: Element, clientY = 32): void {
  const handle = source.querySelector('.drag-grip-button') ?? source
  fireEvent.mouseDown(handle, { button: 0, clientX: 10, clientY: 10 })
  fireEvent.mouseMove(window, { clientX: 10, clientY })
}

function dragDropTo(source: Element, target: Element, clientY = 32): void {
  const data = new Map<string, string>()
  const dataTransfer = {
    effectAllowed: '',
    dropEffect: '',
    setData: vi.fn((type: string, value: string) => data.set(type, value)),
    getData: vi.fn((type: string) => data.get(type) ?? ''),
    clearData: vi.fn(() => data.clear()),
    setDragImage: vi.fn()
  }

  fireEvent.dragStart(source, { dataTransfer })
  fireEvent.dragEnter(target, { clientY, dataTransfer })
  fireEvent.dragOver(target, { clientY, dataTransfer })
  fireEvent.drop(target, { clientY, dataTransfer })
  fireEvent.dragEnd(source, { dataTransfer })
}

describe('App shell', () => {
  let clipboardDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    window.localStorage.clear()
    window.researchNotion = createApiMock()
  })

  afterEach(() => {
    cleanup()
    if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
    else Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('restores the last workspace tab after relaunch', async () => {
    window.localStorage.setItem(
      'research-notion:workspace-preferences',
      JSON.stringify({ version: 1, activeTab: 'knowledge' })
    )

    render(<App />)

    expect(screen.getByRole('tab', { name: /知识库/ })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('heading', { name: '我的论文库' })).toBeInTheDocument()
  })

  it('restores the last conversation when it still exists', async () => {
    const api = createApiMock()
    api.conversations.list = vi.fn().mockResolvedValue([outsideConversation])
    api.messages.list = vi.fn().mockResolvedValue(historyMessages)
    window.researchNotion = api
    window.localStorage.setItem(
      'research-notion:workspace-preferences',
      JSON.stringify({
        version: 1,
        activeTab: 'chat',
        selectedConversationId: outsideConversation.id,
        selectedConversationFolderId: null
      })
    )

    render(<App />)

    expect(await screen.findByText('Explain attention')).toBeInTheDocument()
    expect(api.messages.list).toHaveBeenCalledWith(outsideConversation.id)
  })

  it('ignores malformed workspace preferences and opens chat normally', async () => {
    window.localStorage.setItem('research-notion:workspace-preferences', '{not-json')

    render(<App />)

    expect(screen.getByRole('tab', { name: /对话/ })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText('暂无历史对话')).toBeInTheDocument()
  })

  it('opens on the chat page with a compact sidebar', async () => {
    render(<App />)

    expect(screen.getByText('科研工作空间')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /对话/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByRole('tab', { name: /报告/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新对话' })).toBeInTheDocument()
    expect(await screen.findByText('暂无历史对话')).toBeInTheDocument()
  })

  it('opens unified workspace search from the sidebar and Ctrl+K', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '搜索论文和对话' }))
    expect(await screen.findByRole('dialog', { name: '搜索工作区' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '搜索工作区' })).toHaveFocus()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '搜索工作区' })).not.toBeInTheDocument())

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(await screen.findByRole('dialog', { name: '搜索工作区' })).toBeInTheDocument()
  })

  it('searches conversations and papers and opens the selected result', async () => {
    const api = createApiMock()
    api.conversations.list = vi.fn().mockResolvedValue([outsideConversation])
    api.messages.list = vi.fn().mockResolvedValue(historyMessages)
    api.folders.list = vi.fn().mockResolvedValue([paperFolder])
    api.papers.list = vi.fn().mockResolvedValue([{ ...ragPaper, card: null }])
    api.papers.read = vi.fn().mockResolvedValue({
      paper: ragPaper,
      markdownText: '# RAG 综述笔记\n\n检索增强生成。',
      plainText: null,
      previewUrl: null,
      pdfData: null
    })
    window.researchNotion = api
    render(<App />)

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const searchInput = await screen.findByRole('textbox', { name: '搜索工作区' })
    fireEvent.change(searchInput, { target: { value: 'Hello' } })
    fireEvent.click(await screen.findByRole('button', { name: '打开对话 Hello outside' }))

    expect(await screen.findByText('Explain attention')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    fireEvent.change(await screen.findByRole('textbox', { name: '搜索工作区' }), { target: { value: 'RAG 综述' } })
    fireEvent.click(await screen.findByRole('button', { name: '打开论文 RAG 综述笔记' }))

    expect(screen.getByRole('tab', { name: /知识库/ })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('heading', { name: 'RAG 综述笔记' })).toBeInTheDocument()
    expect(api.papers.read).toHaveBeenCalledWith(ragPaper.id)
  })

  it('switches between workspace pages without showing the chat sidebar on knowledge', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('tab', { name: /知识库/ }))

    expect(screen.getByRole('tab', { name: /知识库/ })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('heading', { name: '我的论文库' })).toBeInTheDocument()
    expect(screen.queryByText('科研工作空间')).not.toBeInTheDocument()
    expect(screen.queryByText('阅读器优先布局')).not.toBeInTheDocument()
  })

  it('updates the visible Dify status after a successful connection test', async () => {
    const api = createApiMock()
    window.researchNotion = api

    render(<App />)

    expect(await screen.findAllByText('Dify 未配置')).toHaveLength(2)

    fireEvent.click(screen.getByRole('tab', { name: /设置/ }))
    fireEvent.change(await screen.findByLabelText('Dify 服务地址'), { target: { value: 'http://localhost:8080' } })
    fireEvent.change(screen.getByLabelText('Dify App API Key'), { target: { value: 'app-key' } })
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }))

    expect(await screen.findAllByText('Dify 连接正常')).toHaveLength(2)
  })

  it('opens settings from the topbar Dify status', async () => {
    const api = createApiMock()
    window.researchNotion = api

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Dify 未配置，打开设置' }))
    expect(screen.getByRole('tab', { name: /设置/ })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByLabelText('Dify 服务地址')).toBeInTheDocument()
  })

  it('shows and dismisses a toast after copying an answer', async () => {
    const api = createApiMock()
    const createdConversation: Conversation = { ...outsideConversation, id: 'conversation-copy', title: 'Copy answer' }
    api.conversations.create = vi.fn().mockResolvedValue(createdConversation)
    api.conversations.sendMessage = vi.fn().mockResolvedValue({ ...assistantReply, conversationId: createdConversation.id })
    api.messages.list = vi.fn().mockImplementation(async (conversationId: string) =>
      conversationId === createdConversation.id ? [{ ...assistantReply, conversationId }] : []
    )
    window.researchNotion = api
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })
    expect(navigator.clipboard?.writeText).toBe(writeText)

    render(<App />)

    fireEvent.change(screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...'), {
      target: { value: 'Copy answer' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await screen.findByText(assistantReply.content)
    const copyButton = await screen.findByRole('button', { name: '复制回答' })
    await act(async () => {
      fireEvent.click(copyButton)
    })

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(assistantReply.content))
    expect(await screen.findByText('回答已复制')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('回答已复制')).not.toBeInTheDocument())
  })

  it('collapses and restores the conversation sidebar with Ctrl+B', async () => {
    const api = createApiMock()
    window.researchNotion = api

    render(<App />)

    await waitFor(() => {
      expect(api.settings.get).toHaveBeenCalled()
      expect(api.conversations.list).toHaveBeenCalled()
      expect(api.conversationFolders.list).toHaveBeenCalled()
      expect(api.folders.list).toHaveBeenCalled()
    })
    await act(async () => {
      await Promise.resolve()
    })

    const layout = document.querySelector('.app-layout')
    expect(layout).not.toHaveClass('sidebar-collapsed')

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    expect(layout).toHaveClass('sidebar-collapsed')

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    expect(layout).not.toHaveClass('sidebar-collapsed')
  })

  it('shows one import notification after choosing a paper', async () => {
    const api = createApiMock()
    api.folders.list = vi.fn().mockResolvedValue([paperFolder])
    api.papers.list = vi.fn().mockResolvedValue([])
    api.papers.import = vi.fn().mockResolvedValue([ragPaper])
    window.researchNotion = api

    render(<App />)

    fireEvent.click(screen.getByRole('tab', { name: /知识库/ }))
    fireEvent.click(await screen.findByRole('button', { name: paperFolder.name }))
    fireEvent.click(await screen.findByRole('button', { name: '导入 PDF / Markdown' }))

    expect(await screen.findByText('已导入「RAG 综述笔记」')).toBeInTheDocument()
    expect(screen.getAllByText('已导入「RAG 综述笔记」')).toHaveLength(1)
  })

  it('loads an existing conversation from the history sidebar', async () => {
    const api = createApiMock()
    api.conversations.list = vi.fn().mockResolvedValue([outsideConversation])
    api.messages.list = vi.fn().mockResolvedValue(historyMessages)
    window.researchNotion = api

    render(<App />)

    fireEvent.click(await screen.findByText('Hello outside'))

    expect(await screen.findByText('Explain attention')).toBeInTheDocument()
    expect(screen.getByText('Attention weighs related tokens.')).toBeInTheDocument()
    expect(api.messages.list).toHaveBeenCalledWith(outsideConversation.id)
  })

  it('opens a history conversation when clicking the full row surface', async () => {
    const api = createApiMock()
    api.conversations.list = vi.fn().mockResolvedValue([outsideConversation])
    api.messages.list = vi.fn().mockResolvedValue(historyMessages)
    window.researchNotion = api

    render(<App />)

    fireEvent.click(await screen.findByTestId(`conversation-row-${outsideConversation.id}`))

    expect(await screen.findByText('Explain attention')).toBeInTheDocument()
    expect(api.messages.list).toHaveBeenCalledWith(outsideConversation.id)
  })

  it('keeps outside conversations visible while folder conversations are nested', async () => {
    const api = createApiMock()
    api.conversationFolders.list = vi.fn().mockResolvedValue([readingFolder])
    api.conversations.list = vi.fn().mockResolvedValue([outsideConversation, folderConversation])
    window.researchNotion = api

    render(<App />)

    expect(await screen.findByText('Hello outside')).toBeInTheDocument()
    expect(await screen.findByText('Folder chat')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reading' }))

    expect(screen.getByText('Hello outside')).toBeInTheDocument()
    expect(screen.getByText('Folder chat')).toBeInTheDocument()
    expect(api.conversations.list).toHaveBeenCalledWith()
    expect(api.conversations.list).not.toHaveBeenCalledWith({ conversationFolderId: readingFolder.id })
  })

  it('keeps the current conversation open when selecting a conversation folder', async () => {
    const api = createApiMock()
    api.conversationFolders.list = vi.fn().mockResolvedValue([readingFolder])
    api.conversations.list = vi.fn().mockResolvedValue([outsideConversation, folderConversation])
    api.messages.list = vi.fn().mockResolvedValue(historyMessages)
    window.researchNotion = api

    render(<App />)

    fireEvent.click(await screen.findByText('Hello outside'))
    expect(await screen.findByText('Explain attention')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reading' }))

    expect(screen.getByText('Hello outside')).toBeInTheDocument()
    expect(screen.getByText('Folder chat')).toBeInTheDocument()
    expect(screen.getByText('Explain attention')).toBeInTheDocument()
  })

  it('collapses and expands a selected conversation folder without losing outside conversations', async () => {
    const api = createApiMock()
    api.conversationFolders.list = vi.fn().mockResolvedValue([readingFolder])
    api.conversations.list = vi.fn().mockResolvedValue([outsideConversation, folderConversation])
    window.researchNotion = api

    render(<App />)

    expect(await screen.findByText('Hello outside')).toBeInTheDocument()
    expect(screen.getByText('Folder chat')).toBeInTheDocument()

    const folderButton = screen.getByRole('button', { name: 'Reading' })
    fireEvent.click(folderButton)
    expect(screen.getByText('Folder chat')).toBeInTheDocument()

    fireEvent.click(folderButton)
    expect(screen.queryByText('Folder chat')).not.toBeInTheDocument()
    expect(screen.getByText('Hello outside')).toBeInTheDocument()

    fireEvent.click(folderButton)
    expect(screen.getByText('Folder chat')).toBeInTheDocument()
  })

  it('creates a conversation folder without filtering the tree', async () => {
    const api = createApiMock()
    const newFolder: ConversationFolder = { ...readingFolder, id: 'conversation-folder-methods', name: 'Methods' }
    api.conversationFolders.list = vi.fn().mockResolvedValue([readingFolder])
    api.conversations.list = vi.fn().mockResolvedValue([outsideConversation, folderConversation])
    api.conversationFolders.create = vi.fn().mockResolvedValue(newFolder)
    window.researchNotion = api

    render(<App />)

    expect(await screen.findByText('Hello outside')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '新建对话文件夹' }))
    fireEvent.change(screen.getByLabelText('对话文件夹名称'), { target: { value: 'Methods' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    expect(api.conversationFolders.create).toHaveBeenCalledWith('Methods')
    expect(await screen.findByRole('button', { name: 'Methods' })).toBeInTheDocument()
    expect(screen.getByText('Hello outside')).toBeInTheDocument()
  })

  it('uses compact rows without the old folder picker', async () => {
    const api = createApiMock()
    api.conversationFolders.list = vi.fn().mockResolvedValue([readingFolder])
    api.conversations.list = vi.fn().mockResolvedValue([outsideConversation])
    window.researchNotion = api

    render(<App />)

    await screen.findByText('Hello outside')

    expect(screen.queryByText('自由对话')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('移动 Hello outside')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新对话' })).toBeInTheDocument()
  })

  it('opens a conversation context menu and moves it without dragging', async () => {
    const api = createApiMock()
    const movedConversation: Conversation = { ...outsideConversation, conversationFolderId: readingFolder.id }
    api.conversationFolders.list = vi.fn().mockResolvedValue([readingFolder])
    api.conversations.list = vi.fn().mockResolvedValue([outsideConversation])
    api.conversations.moveToFolder = vi.fn().mockResolvedValue(movedConversation)
    window.researchNotion = api
    render(<App />)

    fireEvent.contextMenu(await screen.findByTestId(`conversation-row-${outsideConversation.id}`), {
      clientX: 120,
      clientY: 90
    })

    const menu = screen.getByRole('menu', { name: '对话操作' })
    expect(menu).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '重命名对话' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: `移至 ${readingFolder.name}` }))

    await waitFor(() => {
      expect(api.conversations.moveToFolder).toHaveBeenCalledWith(outsideConversation.id, readingFolder.id)
    })
    expect(screen.queryByRole('menu', { name: '对话操作' })).not.toBeInTheDocument()
  })

  it('restores a deliberately collapsed conversation folder', async () => {
    const api = createApiMock()
    api.conversationFolders.list = vi.fn().mockResolvedValue([readingFolder])
    api.conversations.list = vi.fn().mockResolvedValue([folderConversation])
    window.researchNotion = api
    const firstRender = render(<App />)

    expect(await screen.findByText('Folder chat')).toBeInTheDocument()
    const folderButton = screen.getByRole('button', { name: readingFolder.name })
    fireEvent.click(folderButton)
    fireEvent.click(folderButton)
    expect(screen.queryByText('Folder chat')).not.toBeInTheDocument()
    firstRender.unmount()

    window.researchNotion = api
    render(<App />)

    expect(await screen.findByRole('button', { name: readingFolder.name })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Folder chat')).not.toBeInTheDocument()
  })

  it('auto-scrolls the conversation tree near an edge while dragging', async () => {
    const api = createApiMock()
    const secondConversation = { ...outsideConversation, id: 'conversation-second', title: 'Second chat' }
    api.conversations.list = vi.fn().mockResolvedValue([outsideConversation, secondConversation])
    window.researchNotion = api
    render(<App />)

    const nav = await screen.findByRole('navigation', { name: '历史对话' })
    const scrollBy = vi.fn()
    Object.defineProperty(nav, 'scrollBy', { configurable: true, value: scrollBy })
    nav.getBoundingClientRect = vi.fn(
      () => ({ top: 0, bottom: 200, left: 0, right: 260, width: 260, height: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    )
    const firstRow = screen.getByTestId(`conversation-row-${outsideConversation.id}`)
    const secondRow = screen.getByTestId(`conversation-row-${secondConversation.id}`)
    const { elementFromPoint, restore } = mockElementFromPoint()
    elementFromPoint.mockReturnValue(secondRow)

    fireEvent.mouseDown(firstRow.querySelector('.drag-grip-button') ?? firstRow, { button: 0, clientX: 10, clientY: 10 })
    fireEvent.mouseMove(window, { clientX: 10, clientY: 195 })

    expect(scrollBy).toHaveBeenCalledWith({ top: 28, behavior: 'auto' })
    fireEvent.mouseUp(window, { clientX: 10, clientY: 195 })
    restore()
  })

  it('moves conversations into folders and back out with mouse dragging', async () => {
    const api = createApiMock()
    const movedConversation: Conversation = { ...outsideConversation, conversationFolderId: readingFolder.id }
    const looseConversation: Conversation = { ...outsideConversation, conversationFolderId: null }
    api.conversationFolders.list = vi.fn().mockResolvedValue([readingFolder])
    api.conversations.list = vi.fn().mockResolvedValue([outsideConversation])
    api.conversations.moveToFolder = vi.fn().mockResolvedValueOnce(movedConversation).mockResolvedValueOnce(looseConversation)
    window.researchNotion = api

    render(<App />)

    const row = await screen.findByTestId(`conversation-row-${outsideConversation.id}`)
    const folderRow = screen.getByTestId(`conversation-folder-row-${readingFolder.id}`)
    const { elementFromPoint, restore } = mockElementFromPoint()

    elementFromPoint.mockReturnValueOnce(folderRow)
    mouseDragTo(row)

    await waitFor(() => {
      expect(api.conversations.moveToFolder).toHaveBeenCalledWith(outsideConversation.id, readingFolder.id)
    })

    const movedRow = await screen.findByTestId(`conversation-row-${outsideConversation.id}`)
    const outsideTarget = screen.getByLabelText('拖到所有文件夹外')
    elementFromPoint.mockReturnValueOnce(outsideTarget)
    mouseDragTo(movedRow)

    await waitFor(() => {
      expect(api.conversations.moveToFolder).toHaveBeenLastCalledWith(outsideConversation.id, null)
    })
    restore()
  })

  it('moves conversations with native drag and drop events', async () => {
    const api = createApiMock()
    const movedConversation: Conversation = { ...outsideConversation, conversationFolderId: readingFolder.id }
    api.conversationFolders.list = vi.fn().mockResolvedValue([readingFolder])
    api.conversations.list = vi.fn().mockResolvedValue([outsideConversation])
    api.conversations.moveToFolder = vi.fn().mockResolvedValue(movedConversation)
    window.researchNotion = api

    render(<App />)

    const row = await screen.findByTestId(`conversation-row-${outsideConversation.id}`)
    const folderRow = screen.getByTestId(`conversation-folder-row-${readingFolder.id}`)

    dragDropTo(row, folderRow)

    await waitFor(() => {
      expect(api.conversations.moveToFolder).toHaveBeenCalledWith(outsideConversation.id, readingFolder.id)
    })
  })

  it('reorders conversations and folders with mouse dragging', async () => {
    const api = createApiMock()
    const firstFolder: ConversationFolder = { ...readingFolder, id: 'folder-a', name: 'Folder A' }
    const secondFolder: ConversationFolder = { ...readingFolder, id: 'folder-b', name: 'Folder B' }
    const firstConversation: Conversation = { ...outsideConversation, id: 'conversation-a', title: 'First chat' }
    const secondConversation: Conversation = { ...outsideConversation, id: 'conversation-b', title: 'Second chat' }
    api.conversationFolders.list = vi.fn().mockResolvedValue([firstFolder, secondFolder])
    api.conversations.list = vi.fn().mockResolvedValue([firstConversation, secondConversation])
    api.conversationFolders.reorder = vi.fn().mockResolvedValue([secondFolder, firstFolder])
    api.conversations.reorder = vi.fn().mockResolvedValue([secondConversation, firstConversation])
    window.researchNotion = api

    render(<App />)

    const firstConversationRow = await screen.findByTestId(`conversation-row-${firstConversation.id}`)
    const secondConversationRow = await screen.findByTestId(`conversation-row-${secondConversation.id}`)
    const firstFolderRow = await screen.findByTestId(`conversation-folder-row-${firstFolder.id}`)
    const secondFolderRow = await screen.findByTestId(`conversation-folder-row-${secondFolder.id}`)
    const { elementFromPoint, restore } = mockElementFromPoint()

    elementFromPoint.mockReturnValueOnce(secondConversationRow)
    mouseDragTo(firstConversationRow)

    await waitFor(() => {
      expect(api.conversations.reorder).toHaveBeenCalledWith([secondConversation.id, firstConversation.id])
    })

    elementFromPoint.mockReturnValueOnce(secondFolderRow)
    mouseDragTo(firstFolderRow)

    await waitFor(() => {
      expect(api.conversationFolders.reorder).toHaveBeenCalledWith([secondFolder.id, firstFolder.id])
    })
    restore()
  })

  it('reorders conversations and folders with native drag and drop events', async () => {
    const api = createApiMock()
    const firstFolder: ConversationFolder = { ...readingFolder, id: 'folder-a', name: 'Folder A' }
    const secondFolder: ConversationFolder = { ...readingFolder, id: 'folder-b', name: 'Folder B' }
    const firstConversation: Conversation = { ...outsideConversation, id: 'conversation-a', title: 'First chat' }
    const secondConversation: Conversation = { ...outsideConversation, id: 'conversation-b', title: 'Second chat' }
    api.conversationFolders.list = vi.fn().mockResolvedValue([firstFolder, secondFolder])
    api.conversations.list = vi.fn().mockResolvedValue([firstConversation, secondConversation])
    api.conversationFolders.reorder = vi.fn().mockResolvedValue([secondFolder, firstFolder])
    api.conversations.reorder = vi.fn().mockResolvedValue([secondConversation, firstConversation])
    window.researchNotion = api

    render(<App />)

    const firstConversationRow = await screen.findByTestId(`conversation-row-${firstConversation.id}`)
    const secondConversationRow = await screen.findByTestId(`conversation-row-${secondConversation.id}`)
    const firstFolderRow = await screen.findByTestId(`conversation-folder-row-${firstFolder.id}`)
    const secondFolderRow = await screen.findByTestId(`conversation-folder-row-${secondFolder.id}`)

    dragDropTo(firstConversationRow, secondConversationRow)

    await waitFor(() => {
      expect(api.conversations.reorder).toHaveBeenCalledWith([secondConversation.id, firstConversation.id])
    })

    dragDropTo(firstFolderRow, secondFolderRow)

    await waitFor(() => {
      expect(api.conversationFolders.reorder).toHaveBeenCalledWith([secondFolder.id, firstFolder.id])
    })
  })

  it('inserts dragged conversations before or after the row half under the cursor', async () => {
    const api = createApiMock()
    const firstConversation: Conversation = { ...outsideConversation, id: 'conversation-a', title: 'First chat' }
    const secondConversation: Conversation = { ...outsideConversation, id: 'conversation-b', title: 'Second chat' }
    const thirdConversation: Conversation = { ...outsideConversation, id: 'conversation-c', title: 'Third chat' }
    api.conversations.list = vi.fn().mockResolvedValue([firstConversation, secondConversation, thirdConversation])
    api.conversations.reorder = vi.fn().mockResolvedValue([])
    window.researchNotion = api

    render(<App />)

    const secondConversationRow = await screen.findByTestId(`conversation-row-${secondConversation.id}`)
    const thirdConversationRow = await screen.findByTestId(`conversation-row-${thirdConversation.id}`)
    mockRowRect(secondConversationRow, 100)
    const { elementFromPoint, restore } = mockElementFromPoint()
    elementFromPoint.mockReturnValueOnce(secondConversationRow)

    mouseDragTo(thirdConversationRow, 104)

    await waitFor(() => {
      expect(api.conversations.reorder).toHaveBeenCalledWith([
        firstConversation.id,
        thirdConversation.id,
        secondConversation.id
      ])
    })
    restore()
  })

  it('swaps adjacent conversations as soon as an upward drag reaches the previous row', async () => {
    const api = createApiMock()
    const firstConversation: Conversation = { ...outsideConversation, id: 'conversation-a', title: 'First chat' }
    const secondConversation: Conversation = { ...outsideConversation, id: 'conversation-b', title: 'Second chat' }
    const thirdConversation: Conversation = { ...outsideConversation, id: 'conversation-c', title: 'Third chat' }
    api.conversations.list = vi.fn().mockResolvedValue([firstConversation, secondConversation, thirdConversation])
    api.conversations.reorder = vi.fn().mockResolvedValue([])
    window.researchNotion = api

    render(<App />)

    const secondConversationRow = await screen.findByTestId(`conversation-row-${secondConversation.id}`)
    const thirdConversationRow = await screen.findByTestId(`conversation-row-${thirdConversation.id}`)
    mockRowRect(secondConversationRow, 100)
    const { elementFromPoint, restore } = mockElementFromPoint()
    elementFromPoint.mockReturnValueOnce(secondConversationRow)

    mouseDragTo(thirdConversationRow, 129)

    await waitFor(() => {
      expect(api.conversations.reorder).toHaveBeenCalledWith([
        firstConversation.id,
        thirdConversation.id,
        secondConversation.id
      ])
    })
    restore()
  })

  it('previews adjacent conversation order while dragging before mouseup', async () => {
    const api = createApiMock()
    const firstConversation: Conversation = { ...outsideConversation, id: 'conversation-a', title: 'First chat' }
    const secondConversation: Conversation = { ...outsideConversation, id: 'conversation-b', title: 'Second chat' }
    const thirdConversation: Conversation = { ...outsideConversation, id: 'conversation-c', title: 'Third chat' }
    api.conversations.list = vi.fn().mockResolvedValue([firstConversation, secondConversation, thirdConversation])
    api.conversations.reorder = vi.fn().mockResolvedValue([])
    window.researchNotion = api

    render(<App />)

    const secondConversationRow = await screen.findByTestId(`conversation-row-${secondConversation.id}`)
    const thirdConversationRow = await screen.findByTestId(`conversation-row-${thirdConversation.id}`)
    mockRowRect(secondConversationRow, 100)
    const { elementFromPoint, restore } = mockElementFromPoint()
    elementFromPoint.mockReturnValue(secondConversationRow)

    mouseDragMoveTo(thirdConversationRow, 104)

    await waitFor(() => {
      const updatedThirdRow = screen.getByTestId(`conversation-row-${thirdConversation.id}`)
      const updatedSecondRow = screen.getByTestId(`conversation-row-${secondConversation.id}`)
      expect(updatedThirdRow.compareDocumentPosition(updatedSecondRow)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })
    expect(api.conversations.reorder).not.toHaveBeenCalled()

    fireEvent.mouseUp(window, { clientX: 10, clientY: 104 })
    await waitFor(() => {
      expect(api.conversations.reorder).toHaveBeenCalledWith([
        firstConversation.id,
        thirdConversation.id,
        secondConversation.id
      ])
    })
    restore()
  })

  it('keeps an upward adjacent swap stable after the preview reorders the rows', async () => {
    const api = createApiMock()
    const firstConversation: Conversation = { ...outsideConversation, id: 'conversation-a', title: 'First chat' }
    const secondConversation: Conversation = { ...outsideConversation, id: 'conversation-b', title: 'Second chat' }
    const thirdConversation: Conversation = { ...outsideConversation, id: 'conversation-c', title: 'Third chat' }
    api.conversations.list = vi.fn().mockResolvedValue([firstConversation, secondConversation, thirdConversation])
    api.conversations.reorder = vi.fn().mockResolvedValue([])
    window.researchNotion = api

    render(<App />)

    const secondConversationRow = await screen.findByTestId(`conversation-row-${secondConversation.id}`)
    const thirdConversationRow = await screen.findByTestId(`conversation-row-${thirdConversation.id}`)
    mockRowRect(secondConversationRow, 100)
    const { elementFromPoint, restore } = mockElementFromPoint()
    elementFromPoint.mockReturnValue(secondConversationRow)

    fireEvent.mouseDown(thirdConversationRow.querySelector('.drag-grip-button') ?? thirdConversationRow, {
      button: 0,
      clientX: 10,
      clientY: 150
    })
    fireEvent.mouseMove(window, { clientX: 10, clientY: 129 })

    await waitFor(() => {
      const updatedThirdRow = screen.getByTestId(`conversation-row-${thirdConversation.id}`)
      const updatedSecondRow = screen.getByTestId(`conversation-row-${secondConversation.id}`)
      expect(updatedThirdRow.compareDocumentPosition(updatedSecondRow)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    })

    fireEvent.mouseMove(window, { clientX: 10, clientY: 126 })
    fireEvent.mouseUp(window, { clientX: 10, clientY: 126 })

    await waitFor(() => {
      expect(api.conversations.reorder).toHaveBeenCalledWith([
        firstConversation.id,
        thirdConversation.id,
        secondConversation.id
      ])
    })
    restore()
  })

  it('can swap the first two conversations by dragging the second above the first', async () => {
    const api = createApiMock()
    const firstConversation: Conversation = { ...outsideConversation, id: 'conversation-a', title: 'First chat' }
    const secondConversation: Conversation = { ...outsideConversation, id: 'conversation-b', title: 'Second chat' }
    api.conversations.list = vi.fn().mockResolvedValue([firstConversation, secondConversation])
    api.conversations.reorder = vi.fn().mockResolvedValue([])
    window.researchNotion = api

    render(<App />)

    const firstConversationRow = await screen.findByTestId(`conversation-row-${firstConversation.id}`)
    const secondConversationRow = await screen.findByTestId(`conversation-row-${secondConversation.id}`)
    mockRowRect(firstConversationRow, 100)
    const { elementFromPoint, restore } = mockElementFromPoint()
    elementFromPoint.mockReturnValueOnce(firstConversationRow)

    mouseDragTo(secondConversationRow, 104)

    await waitFor(() => {
      expect(api.conversations.reorder).toHaveBeenCalledWith([secondConversation.id, firstConversation.id])
    })
    restore()
  })

  it('swaps the first two conversations even when the second reaches the lower half of the first row', async () => {
    const api = createApiMock()
    const firstConversation: Conversation = { ...outsideConversation, id: 'conversation-a', title: 'First chat' }
    const secondConversation: Conversation = { ...outsideConversation, id: 'conversation-b', title: 'Second chat' }
    api.conversations.list = vi.fn().mockResolvedValue([firstConversation, secondConversation])
    api.conversations.reorder = vi.fn().mockResolvedValue([])
    window.researchNotion = api

    render(<App />)

    const firstConversationRow = await screen.findByTestId(`conversation-row-${firstConversation.id}`)
    const secondConversationRow = await screen.findByTestId(`conversation-row-${secondConversation.id}`)
    mockRowRect(firstConversationRow, 100)
    const { elementFromPoint, restore } = mockElementFromPoint()
    elementFromPoint.mockReturnValueOnce(firstConversationRow)

    mouseDragTo(secondConversationRow, 129)

    await waitFor(() => {
      expect(api.conversations.reorder).toHaveBeenCalledWith([secondConversation.id, firstConversation.id])
    })
    restore()
  })

  it('uses row geometry to reorder when drag hit testing lands on the source row', async () => {
    const api = createApiMock()
    const firstConversation: Conversation = { ...outsideConversation, id: 'conversation-a', title: 'First chat' }
    const secondConversation: Conversation = { ...outsideConversation, id: 'conversation-b', title: 'Second chat' }
    const thirdConversation: Conversation = { ...outsideConversation, id: 'conversation-c', title: 'Third chat' }
    api.conversations.list = vi.fn().mockResolvedValue([firstConversation, secondConversation, thirdConversation])
    api.conversations.reorder = vi.fn().mockResolvedValue([])
    window.researchNotion = api

    render(<App />)

    const secondConversationRow = await screen.findByTestId(`conversation-row-${secondConversation.id}`)
    const thirdConversationRow = await screen.findByTestId(`conversation-row-${thirdConversation.id}`)
    mockRowRect(secondConversationRow, 100)
    mockRowRect(thirdConversationRow, 132)
    const { elementFromPoint, restore } = mockElementFromPoint()
    elementFromPoint.mockReturnValueOnce(thirdConversationRow)

    mouseDragTo(thirdConversationRow, 129)

    await waitFor(() => {
      expect(api.conversations.reorder).toHaveBeenCalledWith([
        firstConversation.id,
        thirdConversation.id,
        secondConversation.id
      ])
    })
    restore()
  })

  it('swaps the first two conversations when hit testing still reports the dragged row', async () => {
    const api = createApiMock()
    const firstConversation: Conversation = { ...outsideConversation, id: 'conversation-a', title: 'First chat' }
    const secondConversation: Conversation = { ...outsideConversation, id: 'conversation-b', title: 'Second chat' }
    api.conversations.list = vi.fn().mockResolvedValue([firstConversation, secondConversation])
    api.conversations.reorder = vi.fn().mockResolvedValue([])
    window.researchNotion = api

    render(<App />)

    const firstConversationRow = await screen.findByTestId(`conversation-row-${firstConversation.id}`)
    const secondConversationRow = await screen.findByTestId(`conversation-row-${secondConversation.id}`)
    mockRowRect(firstConversationRow, 100)
    mockRowRect(secondConversationRow, 132)
    const { elementFromPoint, restore } = mockElementFromPoint()
    elementFromPoint.mockReturnValueOnce(secondConversationRow)

    mouseDragTo(secondConversationRow, 129)

    await waitFor(() => {
      expect(api.conversations.reorder).toHaveBeenCalledWith([secondConversation.id, firstConversation.id])
    })
    restore()
  })

  it('renames conversations and conversation folders from the sidebar', async () => {
    const api = createApiMock()
    const renamedConversation: Conversation = { ...outsideConversation, title: 'Attention notes' }
    const renamedFolder: ConversationFolder = { ...readingFolder, name: 'RAG review' }
    api.conversationFolders.list = vi.fn().mockResolvedValue([readingFolder])
    api.conversations.list = vi.fn().mockResolvedValue([outsideConversation])
    api.conversations.rename = vi.fn().mockResolvedValue(renamedConversation)
    api.conversationFolders.rename = vi.fn().mockResolvedValue(renamedFolder)
    window.researchNotion = api

    render(<App />)

    await screen.findByText('Hello outside')
    fireEvent.click(screen.getByRole('button', { name: '重命名 Hello outside' }))
    fireEvent.change(screen.getByLabelText('对话标题'), { target: { value: 'Attention notes' } })
    fireEvent.click(screen.getByRole('button', { name: '保存对话标题' }))

    await waitFor(() => {
      expect(api.conversations.rename).toHaveBeenCalledWith(outsideConversation.id, 'Attention notes')
    })
    expect(await screen.findByText('Attention notes')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重命名 Reading' }))
    fireEvent.change(screen.getByLabelText('对话文件夹标题'), { target: { value: 'RAG review' } })
    fireEvent.click(screen.getByRole('button', { name: '保存文件夹标题' }))

    await waitFor(() => {
      expect(api.conversationFolders.rename).toHaveBeenCalledWith(readingFolder.id, 'RAG review')
    })
    expect(await screen.findByRole('button', { name: 'RAG review' })).toBeInTheDocument()
  })

  it('deletes conversations from the history sidebar', async () => {
    const api = createApiMock()
    api.conversations.list = vi.fn().mockResolvedValue([outsideConversation])
    api.conversations.delete = vi.fn().mockResolvedValue(outsideConversation)
    window.researchNotion = api

    render(<App />)

    await screen.findByText('Hello outside')
    const conversationRow = screen.getByTestId(`conversation-row-${outsideConversation.id}`)
    fireEvent.click(screen.getByRole('button', { name: '删除 Hello outside' }))

    fireEvent.mouseLeave(conversationRow)
    expect(screen.getByTestId(`conversation-delete-confirm-${outsideConversation.id}`)).toBeInTheDocument()
    expect(screen.getByTestId(`conversation-row-${outsideConversation.id}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '删除 Hello outside' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(api.conversations.delete).toHaveBeenCalledWith(outsideConversation.id)
    })
    expect(screen.queryByText('Hello outside')).not.toBeInTheDocument()
  })

  it('creates new conversations inside the selected conversation folder', async () => {
    const api = createApiMock()
    api.conversationFolders.list = vi.fn().mockResolvedValue([readingFolder])
    api.conversations.list = vi.fn().mockResolvedValue([folderConversation])
    api.conversations.create = vi.fn().mockResolvedValue(folderConversation)
    api.conversations.sendMessage = vi.fn().mockResolvedValue(assistantReply)
    api.messages.list = vi.fn().mockResolvedValue([assistantReply])
    window.researchNotion = api

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Reading' }))
    expect(await screen.findByText('Folder chat')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...'), {
      target: { value: 'Plan a RAG review' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => {
      expect(api.conversations.create).toHaveBeenCalledWith({
        title: 'Plan a RAG review',
        folderId: null,
        conversationFolderId: readingFolder.id,
        context: { type: 'free' }
      })
      expect(api.conversations.sendMessage).toHaveBeenCalledWith(folderConversation.id, 'Plan a RAG review')
    })
    expect(await screen.findByText('Draft the review by retrieval, generation, and evaluation.')).toBeInTheDocument()
  })

  it('uses the clicked conversation location when starting the next conversation', async () => {
    const api = createApiMock()
    const createdRootConversation: Conversation = {
      ...outsideConversation,
      id: 'conversation-created-root',
      title: 'Root follow-up'
    }
    api.conversationFolders.list = vi.fn().mockResolvedValue([readingFolder])
    api.conversations.list = vi.fn().mockResolvedValue([outsideConversation, folderConversation])
    api.messages.list = vi.fn().mockResolvedValue(historyMessages)
    api.conversations.create = vi.fn().mockResolvedValue(createdRootConversation)
    api.conversations.sendMessage = vi.fn().mockResolvedValue({ ...assistantReply, conversationId: createdRootConversation.id })
    window.researchNotion = api

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Reading' }))
    fireEvent.click(await screen.findByText('Hello outside'))
    expect(await screen.findByText('Explain attention')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '新对话' }))
    fireEvent.change(screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...'), {
      target: { value: 'Root follow-up' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => {
      expect(api.conversations.create).toHaveBeenCalledWith({
        title: 'Root follow-up',
        folderId: null,
        conversationFolderId: null,
        context: { type: 'free' }
      })
    })
  })

  it('reveals a collapsed selected folder after creating a conversation inside it', async () => {
    const api = createApiMock()
    const createdConversation: Conversation = {
      ...folderConversation,
      id: 'conversation-created-hidden-folder',
      title: 'Hidden folder plan'
    }
    let conversationRows: Conversation[] = []
    api.conversationFolders.list = vi.fn().mockResolvedValue([readingFolder])
    api.conversations.list = vi.fn().mockImplementation(async () => conversationRows)
    api.conversations.create = vi.fn().mockImplementation(async () => {
      conversationRows = [createdConversation]
      return createdConversation
    })
    api.conversations.sendMessage = vi.fn().mockResolvedValue({ ...assistantReply, conversationId: createdConversation.id })
    window.researchNotion = api

    render(<App />)

    const folderButton = await screen.findByRole('button', { name: 'Reading' })
    fireEvent.click(folderButton)
    expect(folderButton).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(folderButton)
    expect(folderButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.change(screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...'), {
      target: { value: 'Hidden folder plan' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => {
      expect(api.conversations.create).toHaveBeenCalled()
      expect(api.conversations.list).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reading' })).toHaveAttribute('aria-expanded', 'true')
    })
    expect(screen.getByText('Hidden folder plan')).toBeInTheDocument()
  })

  it('creates a new conversation with the selected research context', async () => {
    const api = createApiMock()
    const contextConversation: Conversation = {
      ...outsideConversation,
      id: 'conversation-rag-context',
      title: 'Compare retrieval methods',
      context: { type: 'folder', folderId: paperFolder.id, folderName: paperFolder.name }
    }
    api.folders.list = vi.fn().mockResolvedValue([paperFolder])
    api.papers.list = vi.fn().mockResolvedValue([{ ...ragPaper, card: null }])
    api.conversations.create = vi.fn().mockResolvedValue(contextConversation)
    api.conversations.sendMessage = vi.fn().mockResolvedValue({ ...assistantReply, conversationId: contextConversation.id })
    window.researchNotion = api

    render(<App />)

    const contextSelect = await screen.findByLabelText('问答上下文')
    fireEvent.change(contextSelect, { target: { value: `folder:${paperFolder.id}` } })
    fireEvent.change(screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...'), {
      target: { value: 'Compare retrieval methods' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => {
      expect(api.conversations.create).toHaveBeenCalledWith({
        title: 'Compare retrieval method',
        folderId: null,
        conversationFolderId: null,
        context: { type: 'folder', folderId: paperFolder.id, folderName: paperFolder.name }
      })
    })
  })

  it('lets the user switch context in an existing conversation', async () => {
    const api = createApiMock()
    const contextConversation: Conversation = {
      ...outsideConversation,
      context: { type: 'folder', folderId: paperFolder.id, folderName: paperFolder.name }
    }
    api.folders.list = vi.fn().mockResolvedValue([paperFolder])
    api.papers.list = vi.fn().mockResolvedValue([{ ...ragPaper, card: null }])
    api.conversations.list = vi.fn().mockResolvedValue([contextConversation])
    api.messages.list = vi.fn().mockResolvedValue(historyMessages)
    window.researchNotion = api

    render(<App />)

    fireEvent.click(await screen.findByText(contextConversation.title))
    expect(await screen.findByText('Explain attention')).toBeInTheDocument()

    const contextSelect = await screen.findByRole('combobox', { name: '问答上下文' })
    expect(contextSelect).toHaveValue(`folder:${paperFolder.id}`)
    expect(contextSelect).not.toHaveAttribute('readonly')

    fireEvent.change(contextSelect, { target: { value: 'free' } })

    expect(api.conversations.updateContext).toHaveBeenCalledWith(contextConversation.id, { type: 'free' })
  })

  it('shows a compact agent progress state while waiting for the answer', async () => {
    const api = createApiMock()
    let resolveReply!: (message: Message) => void
    const createdConversation: Conversation = { ...outsideConversation, id: 'conversation-progress', title: 'Explain RAG' }
    api.conversations.create = vi.fn().mockResolvedValue(createdConversation)
    api.conversations.sendMessage = vi.fn(
      () =>
        new Promise<Message>((resolve) => {
          resolveReply = resolve
        })
    )
    window.researchNotion = api

    render(<App />)

    await screen.findByText('暂无历史对话')
    fireEvent.change(screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...'), {
      target: { value: 'Explain RAG' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    const progress = await screen.findByRole('status')
    expect(progress).toHaveTextContent('准备对话')
    expect(progress).toHaveTextContent('锁定上下文')
    expect(progress).toHaveTextContent('Dify 检索与生成')
    expect(progress).toHaveTextContent('写入回答')
    expect(progress).toHaveTextContent(/\d+s/)

    await act(async () => {
      resolveReply({ ...assistantReply, conversationId: createdConversation.id })
    })

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })

  it('updates the waiting state from Dify streaming progress events', async () => {
    const api = createApiMock()
    let resolveReply!: (message: Message) => void
    let progressListener!: Parameters<NonNullable<DesktopApi['conversations']['onSendProgress']>>[0]
    const unsubscribeProgress = vi.fn()
    const createdConversation: Conversation = { ...outsideConversation, id: 'conversation-live-progress', title: 'Explain RAG' }
    api.conversations.create = vi.fn().mockResolvedValue(createdConversation)
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

    render(<App />)

    await screen.findByText('暂无历史对话')
    fireEvent.change(screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...'), {
      target: { value: 'Explain RAG' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => expect(api.conversations.sendMessage).toHaveBeenCalled())
    const progressRequestId = vi.mocked(api.conversations.sendMessage).mock.calls[0][2]?.progressRequestId
    expect(progressRequestId).toMatch(/^progress-/)

    act(() => {
      progressListener({
        requestId: progressRequestId!,
        phase: 'tool',
        toolName: 'get_paper_outline',
        label: '读取论文大纲'
      })
    })

    expect(await screen.findByRole('status')).toHaveTextContent('读取论文大纲')

    await act(async () => {
      resolveReply({ ...assistantReply, conversationId: createdConversation.id })
    })

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      expect(unsubscribeProgress).toHaveBeenCalled()
    })
  })

  it('renders streamed answer text before the final assistant message is saved', async () => {
    const api = createApiMock()
    let resolveReply!: (message: Message) => void
    let progressListener!: Parameters<NonNullable<DesktopApi['conversations']['onSendProgress']>>[0]
    const createdConversation: Conversation = { ...outsideConversation, id: 'conversation-streaming-answer', title: 'Explain RAG' }
    api.conversations.create = vi.fn().mockResolvedValue(createdConversation)
    api.conversations.onSendProgress = vi.fn((listener) => {
      progressListener = listener
      return vi.fn()
    })
    api.conversations.sendMessage = vi.fn(
      () =>
        new Promise<Message>((resolve) => {
          resolveReply = resolve
        })
    )
    window.researchNotion = api

    const { ChatPage } = await import('../../src/renderer/pages/ChatPage')
    render(<ChatPage />)

    fireEvent.change(await screen.findByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...'), {
      target: { value: 'Explain RAG' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => expect(api.conversations.sendMessage).toHaveBeenCalled())
    const progressRequestId = vi.mocked(api.conversations.sendMessage).mock.calls[0][2]?.progressRequestId

    act(() => {
      progressListener({ requestId: progressRequestId!, phase: 'delta', label: '生成回答', delta: '检索增强生成' })
    })
    expect(await screen.findByText('检索增强生成')).toBeInTheDocument()

    act(() => {
      progressListener({ requestId: progressRequestId!, phase: 'delta', label: '生成回答', delta: '先检索，再生成。' })
    })
    expect(await screen.findByText('检索增强生成先检索，再生成。')).toBeInTheDocument()

    await act(async () => {
      resolveReply({ ...assistantReply, conversationId: createdConversation.id, content: '最终回答。' })
    })
    expect(await screen.findByText('最终回答。')).toBeInTheDocument()
    expect(screen.queryByText('检索增强生成先检索，再生成。')).not.toBeInTheDocument()
  })

  it('stops the active generation with its progress request id', async () => {
    const api = createApiMock()
    let progressListener!: Parameters<NonNullable<DesktopApi['conversations']['onSendProgress']>>[0]
    const createdConversation: Conversation = { ...outsideConversation, id: 'conversation-stop-generation', title: 'Explain RAG' }
    api.conversations.create = vi.fn().mockResolvedValue(createdConversation)
    api.conversations.onSendProgress = vi.fn((listener) => {
      progressListener = listener
      return vi.fn()
    })
    api.conversations.cancelSend = vi.fn().mockResolvedValue(true)
    api.conversations.sendMessage = vi.fn(() => new Promise<Message>(() => undefined))
    window.researchNotion = api

    const { ChatPage } = await import('../../src/renderer/pages/ChatPage')
    render(<ChatPage />)
    fireEvent.change(screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...'), {
      target: { value: 'Explain RAG' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => expect(api.conversations.sendMessage).toHaveBeenCalled())
    const progressRequestId = vi.mocked(api.conversations.sendMessage).mock.calls[0][2]?.progressRequestId
    act(() => progressListener({ requestId: progressRequestId!, phase: 'answer', label: '生成回答' }))
    expect(screen.queryByRole('button', { name: '停止生成' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '停止' }))

    expect(api.conversations.cancelSend).toHaveBeenCalledWith(progressRequestId)
  })

  it('shows a jump control instead of pulling a reader back to a streaming answer', async () => {
    const api = createApiMock()
    let progressListener!: Parameters<NonNullable<DesktopApi['conversations']['onSendProgress']>>[0]
    const createdConversation: Conversation = { ...outsideConversation, id: 'conversation-scroll-control', title: 'Explain RAG' }
    api.conversations.create = vi.fn().mockResolvedValue(createdConversation)
    api.conversations.onSendProgress = vi.fn((listener) => {
      progressListener = listener
      return vi.fn()
    })
    api.conversations.sendMessage = vi.fn(() => new Promise<Message>(() => undefined))
    window.researchNotion = api

    const { ChatPage } = await import('../../src/renderer/pages/ChatPage')
    render(<ChatPage />)
    fireEvent.change(screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...'), {
      target: { value: 'Explain RAG' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(api.conversations.sendMessage).toHaveBeenCalled())

    const messageList = screen.getByRole('region', { name: '对话消息' })
    Object.defineProperties(messageList, {
      scrollHeight: { configurable: true, value: 1200 },
      clientHeight: { configurable: true, value: 600 },
      scrollTop: { configurable: true, value: 100 }
    })
    const scrollTo = vi.fn()
    Object.defineProperty(messageList, 'scrollTo', { configurable: true, value: scrollTo })
    fireEvent.scroll(messageList)

    const progressRequestId = vi.mocked(api.conversations.sendMessage).mock.calls[0][2]?.progressRequestId
    act(() => progressListener({ requestId: progressRequestId!, phase: 'delta', label: '生成回答', delta: '正在生成答案。' }))

    const jumpButton = await screen.findByRole('button', { name: '跳到最新回答' })
    fireEvent.click(jumpButton)
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 1200 }))
  })

  it('fills the composer with reusable research prompts from quick actions', async () => {
    window.researchNotion = createApiMock()

    render(<App />)

    await screen.findByText('暂无历史对话')
    const input = screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...')
    fireEvent.click(screen.getByRole('button', { name: '创新点' }))

    expect(input).toHaveValue('请提取当前上下文中可能的创新点，并说明它们与已有工作的差异。')

    fireEvent.click(screen.getByRole('button', { name: '综述提纲' }))

    expect(input).toHaveValue('请基于当前上下文生成一份综述提纲，包含章节结构、核心问题和可继续追问的方向。')
  })

  it('shows a visible error and keeps the draft when sending fails', async () => {
    const api = createApiMock()
    const failedConversation: Conversation = { ...outsideConversation, id: 'conversation-failed-send' }
    api.conversations.create = vi.fn().mockResolvedValue(failedConversation)
    api.conversations.sendMessage = vi
      .fn()
      .mockRejectedValue(new Error("Error invoking remote method 'conversations:sendMessage': Error: 请先在设置页填写 Dify 配置。"))
    window.researchNotion = api

    render(<App />)

    await screen.findByText('暂无历史对话')
    const input = screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...')
    fireEvent.change(input, { target: { value: '解释这篇论文的创新点' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('请先在设置页填写 Dify 配置。')
    expect(screen.getByRole('alert')).not.toHaveTextContent('Error invoking remote method')
    const retryInput = screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...')
    expect(retryInput).toHaveValue('解释这篇论文的创新点')
    expect(screen.queryAllByText('解释这篇论文的创新点').filter((element) => element.tagName === 'P')).toHaveLength(0)

    fireEvent.change(retryInput, { target: { value: '重新解释创新点' } })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('turns a DeepSeek bridge failure into a useful retry message', async () => {
    const api = createApiMock()
    api.conversations.create = vi.fn().mockResolvedValue({ ...outsideConversation, id: 'conversation-bridge-failure' })
    api.conversations.sendMessage = vi
      .fn()
      .mockRejectedValue(
        new Error(
          `Error invoking remote method 'conversations:sendMessage': DifyApiError: {"error_type":"ValueError","message":"deepseek_bridge_upstream_error"}`
        )
      )
    window.researchNotion = api

    render(<App />)

    await screen.findByText('暂无历史对话')
    fireEvent.change(screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...'), {
      target: { value: '解释论文方法' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('大模型服务暂时不可用，已保留你的问题，请稍后重新发送。')
    expect(screen.getByRole('alert')).not.toHaveTextContent('deepseek_bridge_upstream_error')
  })
})
