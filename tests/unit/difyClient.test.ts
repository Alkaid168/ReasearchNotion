import { describe, expect, it, vi } from 'vitest'
import { createDifyClient } from '../../src/main/dify/client'

describe('Dify client', () => {
  it('creates datasets with the knowledge key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'dataset-1', name: '毕业设计' })
    })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    await expect(client.createDataset('毕业设计')).resolves.toEqual({ id: 'dataset-1', name: '毕业设计' })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/v1/datasets',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer knowledge-key' })
      })
    )
  })

  it('sends chat messages with the app key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: '这篇论文提出了检索增强生成。',
        conversation_id: 'dify-conv-1',
        retriever_resources: [{ document_name: 'rag.pdf', content: 'retrieval augmented generation', score: 0.91 }]
      })
    })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    const result = await client.sendChatMessage({
      query: '总结创新点',
      user: 'local-user',
      inputs: { contextType: 'folder', contextId: 'folder-1' }
    })

    expect(result.answer).toContain('检索增强生成')
    expect(result.citations[0].paperTitle).toBe('rag.pdf')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/v1/chat-messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer app-key' })
      })
    )
  })

  it('uploads documents to a dataset with the knowledge key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ document: { id: 'doc-1' } })
    })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080/',
      appApiKey: 'app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    await expect(
      client.uploadDocumentByFile({
        datasetId: 'dataset-1',
        file: new Blob(['# RAG Survey']),
        filename: 'rag.md'
      })
    ).resolves.toEqual({ documentId: 'doc-1' })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/v1/datasets/dataset-1/document/create-by-file',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer knowledge-key' }),
        body: expect.any(FormData)
      })
    )
  })
})
