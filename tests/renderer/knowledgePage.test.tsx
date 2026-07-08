import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi } from '../../src/shared/ipcTypes'
import type { AppSettings, Folder, Paper, PaperCard } from '../../src/shared/types'

const emptySettings: AppSettings = {
  difyBaseUrl: '',
  difyAppApiKey: '',
  difyKnowledgeApiKey: '',
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

function createApiMock(): DesktopApi {
  return {
    settings: {
      get: vi.fn().mockResolvedValue(emptySettings),
      save: vi.fn().mockImplementation(async (settings: AppSettings) => settings),
      testConnection: vi.fn().mockResolvedValue({ ok: true, message: '连接配置有效。' })
    },
    folders: {
      list: vi.fn().mockResolvedValue([folder]),
      create: vi.fn()
    },
    papers: {
      list: vi.fn().mockResolvedValue([{ ...paper, card }]),
      import: vi.fn(),
      read: vi.fn().mockResolvedValue({
        paper,
        markdownText: '# RAG Survey\n\nRetrieval augmented generation.'
      })
    },
    conversations: { list: vi.fn(), create: vi.fn(), sendMessage: vi.fn() }
  }
}

describe('KnowledgePage', () => {
  beforeEach(() => {
    window.researchNotion = createApiMock()
  })

  it('shows folders, papers, reader, and hidden AI drawer trigger', async () => {
    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    expect(await screen.findByText('毕业设计')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /RAG Survey/ }))

    expect(await screen.findByRole('heading', { name: 'RAG Survey' })).toBeInTheDocument()
    expect(screen.getByText('Retrieval augmented generation.')).toBeInTheDocument()
    expect(screen.queryByText('对当前论文提问')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '打开 AI 问答栏' }))

    expect(screen.getByText('对当前论文提问')).toBeInTheDocument()
  })

  it('toggles the AI drawer with Ctrl+J', async () => {
    const { KnowledgePage } = await import('../../src/renderer/pages/KnowledgePage')
    render(<KnowledgePage />)

    await screen.findByText('毕业设计')
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true })

    expect(screen.getByText('对当前论文提问')).toBeInTheDocument()
  })
})
