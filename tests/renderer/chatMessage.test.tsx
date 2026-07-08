import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi } from '../../src/shared/ipcTypes'
import type { AppSettings, Conversation, Message } from '../../src/shared/types'

const emptySettings: AppSettings = {
  difyBaseUrl: '',
  difyAppApiKey: '',
  difyKnowledgeApiKey: '',
  defaultFolderId: null
}

const conversation: Conversation = {
  id: 'conversation-1',
  title: '总结 RAG',
  folderId: null,
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
    settings: {
      get: vi.fn().mockResolvedValue(emptySettings),
      save: vi.fn().mockImplementation(async (settings: AppSettings) => settings),
      testConnection: vi.fn().mockResolvedValue({ ok: true, message: '连接配置有效。' })
    },
    folders: { list: vi.fn().mockResolvedValue([]), create: vi.fn() },
    papers: { list: vi.fn().mockResolvedValue([]), import: vi.fn(), read: vi.fn() },
    conversations: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(conversation),
      sendMessage: vi.fn().mockResolvedValue(assistantMessage)
    }
  }
}

describe('ChatPage', () => {
  let api: DesktopApi

  beforeEach(() => {
    api = createApiMock()
    window.researchNotion = api
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
        context: { type: 'free' }
      })
      expect(api.conversations.sendMessage).toHaveBeenCalledWith(conversation.id, '总结 RAG 的核心思路')
    })
    expect(screen.getByText('总结 RAG 的核心思路')).toBeInTheDocument()
    expect(await screen.findByText('RAG 的核心是先检索相关资料，再生成回答。')).toBeInTheDocument()
    expect(screen.getByText('RAG Survey')).toBeInTheDocument()
  })
})
