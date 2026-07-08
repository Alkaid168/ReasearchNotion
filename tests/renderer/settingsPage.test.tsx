import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    folders: { list: vi.fn(), create: vi.fn() },
    papers: { list: vi.fn(), import: vi.fn(), read: vi.fn() },
    conversations: { list: vi.fn(), create: vi.fn(), sendMessage: vi.fn() }
  }
}

describe('SettingsPage', () => {
  let api: DesktopApi

  beforeEach(() => {
    vi.resetModules()
    api = createApiMock()
    window.researchNotion = api
  })

  it('saves Dify settings through the desktop API', async () => {
    const { SettingsPage } = await import('../../src/renderer/pages/SettingsPage')
    render(<SettingsPage />)

    fireEvent.change(await screen.findByLabelText('Dify 服务地址'), { target: { value: 'http://localhost:8080/' } })
    fireEvent.change(screen.getByLabelText('Dify App API Key'), { target: { value: 'app-key' } })
    fireEvent.change(screen.getByLabelText('Dify Knowledge API Key'), { target: { value: 'knowledge-key' } })
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

    await waitFor(() => {
      expect(api.settings.save).toHaveBeenCalledWith({
        difyBaseUrl: 'http://localhost:8080/',
        difyAppApiKey: 'app-key',
        difyKnowledgeApiKey: 'knowledge-key',
        defaultFolderId: null
      })
    })
    expect(await screen.findByText('设置已保存。')).toBeInTheDocument()
  })

  it('tests the configured Dify connection', async () => {
    const { SettingsPage } = await import('../../src/renderer/pages/SettingsPage')
    render(<SettingsPage />)

    fireEvent.change(await screen.findByLabelText('Dify 服务地址'), { target: { value: 'http://localhost:8080' } })
    fireEvent.change(screen.getByLabelText('Dify App API Key'), { target: { value: 'app-key' } })
    fireEvent.change(screen.getByLabelText('Dify Knowledge API Key'), { target: { value: 'knowledge-key' } })
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }))

    await waitFor(() => {
      expect(api.settings.testConnection).toHaveBeenCalledWith({
        difyBaseUrl: 'http://localhost:8080',
        difyAppApiKey: 'app-key',
        difyKnowledgeApiKey: 'knowledge-key',
        defaultFolderId: null
      })
    })
    expect(await screen.findByText('连接配置有效。')).toBeInTheDocument()
  })
})
