import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi } from '../../src/shared/ipcTypes'
import type { AppSettings, Conversation, Message } from '../../src/shared/types'

const emptySettings: AppSettings = {
  difyBaseUrl: '',
  difyAppApiKey: '',
  difyKnowledgeApiKey: '',
    deepseekApiKey: '',
  defaultFolderId: null
}

const conversation: Conversation = {
  id: 'conversation-1',
  title: '总结 RAG',
  folderId: null,
  conversationFolderId: null,
  difyConversationId: null,
  context: { type: 'free' },
  createdAt: '2026-07-08T00:00:00.000Z',
  updatedAt: '2026-07-08T00:00:00.000Z'
}

const assistantMessage: Message = {
  id: 'message-2',
  conversationId: conversation.id,
  role: 'assistant',
  content: 'RAG 的核心是先检索相关资料，再生成回答。',
  citations: [{ paperId: 'paper-1', paperTitle: 'RAG Survey', snippet: 'retrieval augmented generation', score: 0.91 }],
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
      testConnection: vi.fn(), switchDifyApp: vi.fn().mockResolvedValue({ ok: true, message: "", settings: { difyBaseUrl: "", difyAppApiKey: "", difyKnowledgeApiKey: "", deepseekApiKey: "", defaultFolderId: null } }).mockResolvedValue({ ok: true, message: '连接配置有效。' })
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
      create: vi.fn().mockResolvedValue(conversation),
      moveToFolder: vi.fn(),
      rename: vi.fn(),
      delete: vi.fn(),
      reorder: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(assistantMessage)
    },
    messages: { list: vi.fn().mockResolvedValue([]) }
  }
}

describe('ChatPage', () => {
  let api: DesktopApi
  let clipboardDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    api = createApiMock()
    window.researchNotion = api
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
    else Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('creates a conversation and renders the assistant answer with citations', async () => {
    const { ChatPage } = await import('../../src/renderer/pages/ChatPage')
    render(<ChatPage />)

    fireEvent.change(screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...'), {
      target: { value: '总结 RAG 的核心思路' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    await waitFor(() => {
      expect(api.conversations.create).toHaveBeenCalledWith({
        title: '总结 RAG 的核心思路',
        folderId: null,
        conversationFolderId: null,
        context: { type: 'free' }
      })
      expect(api.conversations.sendMessage).toHaveBeenCalledWith(conversation.id, '总结 RAG 的核心思路')
    })
    expect(screen.getByText('总结 RAG 的核心思路')).toBeInTheDocument()
    expect(await screen.findByText('RAG 的核心是先检索相关资料，再生成回答。')).toBeInTheDocument()
    expect(screen.getByText('RAG Survey')).toBeInTheDocument()
  })

  it('sends with Enter, keeps Shift+Enter for new lines, and clears the composer immediately', async () => {
    let resolveReply!: (message: Message) => void
    api.conversations.sendMessage = vi.fn(
      () =>
        new Promise<Message>((resolve) => {
          resolveReply = resolve
        })
    )
    const { ChatPage } = await import('../../src/renderer/pages/ChatPage')
    render(<ChatPage />)

    const input = screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...') as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: '总结 RAG 的核心思路' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

    expect(api.conversations.create).not.toHaveBeenCalled()
    expect(input).toHaveValue('总结 RAG 的核心思路')

    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(api.conversations.sendMessage).toHaveBeenCalledWith(conversation.id, '总结 RAG 的核心思路')
    })
    expect(screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...')).toHaveValue('')

    resolveReply(assistantMessage)
    expect(await screen.findByText('RAG 的核心是先检索相关资料，再生成回答。')).toBeInTheDocument()
  })

  it('shows a retrieval notice when an assistant answer has no citations', async () => {
    api.conversations.sendMessage = vi.fn().mockResolvedValue({
      ...assistantMessage,
      citations: []
    })
    const { ChatPage } = await import('../../src/renderer/pages/ChatPage')
    render(<ChatPage />)

    fireEvent.change(screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...'), {
      target: { value: '总结 RAG 的核心思路' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByText('RAG 的核心是先检索相关资料，再生成回答。')).toBeInTheDocument()
    expect(screen.getByText('通用分析')).toBeInTheDocument()
    expect(screen.queryByText('可切换论文库、重试检索，或在问题中加入更具体的论文标题。')).not.toBeInTheDocument()
  })

  it('renders assistant Markdown as structured content', async () => {
    const markdownReply: Message = {
      ...assistantMessage,
      content: '**核心结论**\n\n- 先检索资料\n- 再生成回答'
    }
    api.conversations.sendMessage = vi.fn().mockResolvedValue(markdownReply)

    const { ChatPage } = await import('../../src/renderer/pages/ChatPage')
    render(<ChatPage />)

    fireEvent.change(screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...'), {
      target: { value: '总结 RAG 的核心思路' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByText('核心结论')).toBeInTheDocument()
    expect(screen.getByText('核心结论').tagName).toBe('STRONG')
    expect(screen.getByText('先检索资料').tagName).toBe('LI')
    expect(screen.getByText('再生成回答').tagName).toBe('LI')
  })

  it('renders GFM tables in assistant Markdown', async () => {
    const tableReply: Message = {
      ...assistantMessage,
      content: '| 论文 | 区别 |\n| --- | --- |\n| Transformer | 架构创新 |'
    }
    api.conversations.sendMessage = vi.fn().mockResolvedValue(tableReply)

    const { ChatPage } = await import('../../src/renderer/pages/ChatPage')
    render(<ChatPage />)

    fireEvent.change(screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...'), {
      target: { value: '比较三篇论文' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '论文' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '架构创新' })).toBeInTheDocument()
  })

  it('renders inline and block LaTeX in assistant Markdown', async () => {
    const mathReply: Message = {
      ...assistantMessage,
      content: '注意力权重为 $\\alpha_i$。\n\n$$\n\\mathrm{softmax}(QK^T / \\sqrt{d_k})\n$$'
    }
    api.conversations.sendMessage = vi.fn().mockResolvedValue(mathReply)

    const { ChatPage } = await import('../../src/renderer/pages/ChatPage')
    render(<ChatPage />)
    fireEvent.change(screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...'), {
      target: { value: '解释注意力公式' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findAllByText('α')).not.toHaveLength(0)
    expect(document.querySelector('.katex-display')).toBeInTheDocument()
  })

  it('keeps the active answer in view when conversation messages change', async () => {
    const scrollTo = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollTo
    })
    api.conversations.list = vi.fn().mockResolvedValue([conversation])
    api.messages.list = vi.fn().mockResolvedValue([
      {
        id: 'message-user-existing',
        conversationId: conversation.id,
        role: 'user',
        content: '已有问题',
        citations: [],
        createdAt: '2026-07-08T00:00:00.000Z'
      },
      assistantMessage
    ])
    const { ChatPage } = await import('../../src/renderer/pages/ChatPage')

    render(<ChatPage selectedConversationId={conversation.id} />)

    expect(await screen.findByText('RAG 的核心是先检索相关资料，再生成回答。')).toBeInTheDocument()
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' })))
  })

  it('shows agent progress in the conversation timeline while waiting', async () => {
    api.conversations.sendMessage = vi.fn(() => new Promise<Message>(() => undefined))
    const { ChatPage } = await import('../../src/renderer/pages/ChatPage')
    render(<ChatPage />)

    const input = screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...')
    fireEvent.change(input, { target: { value: '整理实验结论' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const progress = await screen.findByRole('status')
    expect(progress.closest('.message-list')).not.toBeNull()
    expect(progress.closest('.composer')).toBeNull()
  })

  it('copies an assistant answer from its message action', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })
    const { ChatPage } = await import('../../src/renderer/pages/ChatPage')
    render(<ChatPage />)

    fireEvent.change(screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...'), {
      target: { value: '总结 RAG' }
    })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    fireEvent.click(await screen.findByRole('button', { name: '复制回答' }))
    expect(writeText).toHaveBeenCalledWith(assistantMessage.content)
    expect(await screen.findByRole('button', { name: '已复制' })).toBeInTheDocument()
  })

  it('retries a failed message from the inline error without losing the draft', async () => {
    api.conversations.sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('网络暂时不可用'))
      .mockResolvedValueOnce(assistantMessage)
    const { ChatPage } = await import('../../src/renderer/pages/ChatPage')
    render(<ChatPage />)

    const input = screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...')
    fireEvent.change(input, { target: { value: '总结 RAG' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('网络暂时不可用')
    expect(input).toHaveValue('总结 RAG')
    fireEvent.click(screen.getByRole('button', { name: '重新发送' }))

    expect(await screen.findByText(assistantMessage.content)).toBeInTheDocument()
    expect(api.conversations.sendMessage).toHaveBeenCalledTimes(2)
  })
})
