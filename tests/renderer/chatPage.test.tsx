import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/renderer/App'
import type { DesktopApi } from '../../src/shared/ipcTypes'
import type { AppSettings } from '../../src/shared/types'

const emptySettings: AppSettings = {
  difyBaseUrl: '',
  difyAppApiKey: '',
  difyKnowledgeApiKey: '',
  defaultFolderId: null
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
    conversations: { list: vi.fn(), create: vi.fn(), sendMessage: vi.fn() }
  }
}

describe('App shell', () => {
  beforeEach(() => {
    window.researchNotion = createApiMock()
  })

  it('opens on the chat page with a research prompt', () => {
    render(<App />)

    expect(screen.getByText('科研工作空间')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '对话' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('今天研究点什么？')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...')).toBeInTheDocument()
  })

  it('switches between top-level workspace pages', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('tab', { name: '知识库' }))

    expect(screen.getByRole('tab', { name: '知识库' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByRole('heading', { name: '我的论文库' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: '设置' }))

    expect(screen.getByRole('tab', { name: '设置' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: '连接 Dify' })).toBeInTheDocument()
    expect(await screen.findByText('配置保存在本机。')).toBeInTheDocument()
  })
})
