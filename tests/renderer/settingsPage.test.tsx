import '@testing-library/jest-dom/vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi, EnvironmentStatus } from '../../src/shared/ipcTypes'
import type { AppSettings } from '../../src/shared/types'

const emptySettings: AppSettings = {
  difyBaseUrl: '',
  difyAppApiKey: '',
  difyKnowledgeApiKey: '',
    deepseekApiKey: '',
  defaultFolderId: null
}

const unconfiguredStatus: EnvironmentStatus = {
  appVersion: '0.1.0',
  electronVersion: '33.2.1',
  nodeVersion: '22.10.2',
  userDataDir: 'C:\\Users\\demo\\AppData\\Roaming\\ResearchNotion',
  databasePath: 'C:\\Users\\demo\\AppData\\Roaming\\ResearchNotion\\research-notion.sqlite',
  difyConfigured: false,
  difyAppName: null,
  difyAppMode: null,
  agentToolServiceUrl: 'http://127.0.0.1:17777',
  agentToolOperationCount: 10,
  folderCount: 2,
  paperCount: 3,
  pdfPaperCount: 1,
  indexedPaperCount: 1,
  cardCount: 1,
  conversationCount: 4
}

function createApiMock(status: EnvironmentStatus = unconfiguredStatus): DesktopApi {
  return {
    app: { getEnvironmentStatus: vi.fn().mockResolvedValue(status) },
    settings: {
      get: vi.fn().mockResolvedValue(emptySettings),
      save: vi.fn().mockImplementation(async (settings: AppSettings) => settings),
      testConnection: vi.fn().mockResolvedValue({ ok: true, message: 'connection configured' })
    },
    folders: { list: vi.fn(), create: vi.fn(), rename: vi.fn(), delete: vi.fn() },
    conversationFolders: { list: vi.fn(), create: vi.fn(), rename: vi.fn(), reorder: vi.fn() },
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
    papers: {
      list: vi.fn(),
      import: vi.fn(),
      importFiles: vi.fn(),
      updateReadingStatus: vi.fn(),
      reindex: vi.fn(),
      delete: vi.fn(),
      getOutline: vi.fn().mockResolvedValue([]),
      searchText: vi.fn().mockResolvedValue([]),
      read: vi.fn()
    },
    conversations: {
      list: vi.fn(),
      create: vi.fn(),
      moveToFolder: vi.fn(),
      rename: vi.fn(),
      updateContext: vi.fn(),
      delete: vi.fn(),
      reorder: vi.fn(),
      sendMessage: vi.fn()
    },
    messages: { list: vi.fn() }
  }
}

async function renderPage(): Promise<void> {
  const { SettingsPage } = await import('../../src/renderer/pages/SettingsPage')
  render(<SettingsPage />)
  await waitFor(() => expect(document.querySelector('.settings-status-panel')).not.toBeNull())
}

describe('SettingsPage', () => {
  let api: DesktopApi

  beforeEach(() => {
    vi.resetModules()
    api = createApiMock()
    window.researchNotion = api
  })

  it('saves Dify settings through the desktop API', async () => {
    await renderPage()
    const inputs = document.querySelectorAll<HTMLInputElement>('.settings-form input')
    fireEvent.change(inputs[0], { target: { value: 'http://localhost:8080/' } })
    fireEvent.change(inputs[1], { target: { value: 'app-key' } })
    fireEvent.change(inputs[2], { target: { value: 'knowledge-key' } })
    fireEvent.submit(document.querySelector<HTMLFormElement>('.settings-form')!)

    await waitFor(() => {
      expect(api.settings.save).toHaveBeenCalledWith({
        difyBaseUrl: 'http://localhost:8080/',
        difyAppApiKey: 'app-key',
        difyKnowledgeApiKey: 'knowledge-key',
    deepseekApiKey: '',
        defaultFolderId: null
      })
    })
  })

  it('tests the configured Dify connection', async () => {
    await renderPage()
    const inputs = document.querySelectorAll<HTMLInputElement>('.settings-form input')
    fireEvent.change(inputs[0], { target: { value: 'http://localhost:8080' } })
    fireEvent.change(inputs[1], { target: { value: 'app-key' } })
    fireEvent.change(inputs[2], { target: { value: 'knowledge-key' } })
    fireEvent.click(document.querySelector<HTMLButtonElement>('.settings-form .secondary-action')!)

    await waitFor(() => {
      expect(api.settings.testConnection).toHaveBeenCalledWith({
        difyBaseUrl: 'http://localhost:8080',
        difyAppApiKey: 'app-key',
        difyKnowledgeApiKey: 'knowledge-key',
    deepseekApiKey: '',
        defaultFolderId: null
      })
    })
  })

  it('shows concise user-facing workspace status without implementation diagnostics', async () => {
    await renderPage()
    const status = document.querySelector<HTMLElement>('.settings-status-panel')!

    expect(status.querySelectorAll('.settings-status-card')).toHaveLength(7)
    expect(status.textContent).not.toContain('ResearchNotion Tool Agent')
    expect(status.textContent).not.toContain('agent-chat')
    expect(status.textContent).not.toContain('127.0.0.1:17777')
    expect(status.textContent).not.toContain('Electron')
    expect(status.textContent).not.toContain('0.1.0')
    expect(api.app.getEnvironmentStatus).toHaveBeenCalled()
  })

  it('reports configured Dify alongside the current workspace counts', async () => {
    api = createApiMock({
      ...unconfiguredStatus,
      difyConfigured: true,
      difyAppName: 'ResearchNotion Tool Agent',
      difyAppMode: 'agent-chat',
      folderCount: 1,
      paperCount: 3,
      pdfPaperCount: 2,
      indexedPaperCount: 3,
      cardCount: 3,
      conversationCount: 2
    })
    window.researchNotion = api
    await renderPage()

    const values = Array.from(document.querySelectorAll('.settings-status-card strong')).map((element) => element.textContent)
    expect(values).toEqual(['已配置', '1', '3', '2', '3', '3', '2'])
  })

  it('refreshes the workspace status manually', async () => {
    await renderPage()
    fireEvent.click(document.querySelector<HTMLButtonElement>('.settings-status-head button')!)
    await waitFor(() => expect(api.app.getEnvironmentStatus).toHaveBeenCalledTimes(2))
  })
})
