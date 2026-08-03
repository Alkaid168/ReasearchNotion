import { describe, expect, it, vi } from 'vitest'
import { createDifyClient } from '../../src/main/dify/client'

describe('Dify client', () => {
  it('checks app and knowledge credentials without creating data', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          opening_statement: '',
          suggested_questions: [],
          retriever_resource: { enabled: true },
          user_input_form: [
            { text_input: { variable: 'task' } },
            { text_input: { variable: 'contextType' } },
            { text_input: { variable: 'contextLabel' } },
            { text_input: { variable: 'folderId' } },
            { text_input: { variable: 'paperId' } },
            { paragraph: { variable: 'emphasisContext' } }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: 'ResearchNotion Academic QA Agent', mode: 'chat' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] })
      })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080/',
      appApiKey: 'app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    await expect(client.testConnection()).resolves.toEqual({
      app: true,
      knowledge: true,
      appName: 'ResearchNotion Academic QA Agent',
      appMode: 'chat',
      missingInputs: [],
      retrieverResourceEnabled: true
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8080/v1/parameters',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer app-key' })
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8080/v1/info',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer app-key' })
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:8080/v1/datasets?page=1&limit=1',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer knowledge-key' })
      })
    )
  })

  it('reads the current Dify app identity with the app key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'ResearchNotion Tool Agent', mode: 'agent-chat' })
    })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080/',
      appApiKey: 'agent-app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    await expect(client.getAppInfo()).resolves.toEqual({
      name: 'ResearchNotion Tool Agent',
      mode: 'agent-chat'
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/v1/info',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer agent-app-key' })
      })
    )
  })

  it('reports missing ResearchNotion variables and disabled retriever resources', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          retriever_resource: { enabled: false },
          user_input_form: [{ text_input: { variable: 'task' } }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ mode: 'chat' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] })
      })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    await expect(client.testConnection()).resolves.toMatchObject({
      missingInputs: ['contextType', 'contextLabel', 'folderId', 'paperId', 'emphasisContext'],
      retrieverResourceEnabled: false
    })
  })

  it('accepts agent-chat apps without the legacy workflow input variables', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          retriever_resource: { enabled: false },
          user_input_form: []
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ mode: 'agent-chat' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] })
      })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    await expect(client.testConnection()).resolves.toMatchObject({
      appMode: 'agent-chat',
      missingInputs: [],
      retrieverResourceEnabled: true
    })
  })

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

  it('deletes Dify documents and datasets with the knowledge key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({})
    })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    await client.deleteDocument('dataset-1', 'document-1')
    await client.deleteDataset('dataset-1')

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'http://localhost:8080/v1/datasets/dataset-1/documents/document-1',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: 'Bearer knowledge-key' })
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8080/v1/datasets/dataset-1',
      expect.objectContaining({
        method: 'DELETE',
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
        metadata: {
          retriever_resources: [
            { document_id: 'doc-1', document_name: 'rag.pdf', content: 'retrieval augmented generation', score: 0.91 }
          ]
        }
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
    expect(result.citations[0].sourceDocumentId).toBe('doc-1')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/v1/chat-messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer app-key' })
      })
    )
  })

  it('removes agent execution narration before the substantive answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer:
          '\u73b0\u5728\u6211\u5df2\u7ecf\u83b7\u53d6\u4e86\u8db3\u591f\u7684\u4fe1\u606f\uff0c\u53ef\u4ee5\u7ed9\u51fa\u7efc\u5408\u56de\u7b54\u3002\n\nLet me start by retrieving paper evidence.\n\nNow let me read the conclusion section.\n\n## Research problem\nThe paper studies efficient sequence modeling.',
        conversation_id: 'dify-conv-1',
        metadata: { retriever_resources: [] }
      })
    })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    const result = await client.sendChatMessage({
      query: 'Summarize the paper',
      user: 'local-user',
      inputs: {}
    })

    expect(result.answer).toBe('## Research problem\nThe paper studies efficient sequence modeling.')
  })

  it('preserves substantive content after an inline execution narration prefix', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: 'Let me first retrieve the paper evidence. ## Core contribution\nThe method replaces recurrence with attention.',
        conversation_id: 'dify-conv-1',
        metadata: { retriever_resources: [] }
      })
    })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    const result = await client.sendChatMessage({ query: 'Summarize the paper', user: 'local-user', inputs: {} })

    expect(result.answer).toBe('## Core contribution\nThe method replaces recurrence with attention.')
  })

  it('removes inline Chinese tool narration without discarding the factual answer that follows', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer:
          '我先获取当前上下文，确认正在阅读哪篇论文。当前论文是 Attention Is All You Need。让我在论文中搜索相关证据。该论文未报告 CO2 排放数据集实验。',
        conversation_id: 'dify-conv-1',
        metadata: { retriever_resources: [] }
      })
    })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    const result = await client.sendChatMessage({ query: '是否有 CO2 实验？', user: 'local-user', inputs: {} })

    expect(result.answer).toBe('当前论文是 Attention Is All You Need。该论文未报告 CO2 排放数据集实验。')
  })

  it('retries transient Dify chat failures once before returning the answer', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server Unavailable: SSLEOFError unexpected eof'
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          answer: '已恢复并返回中文回答。',
          conversation_id: 'dify-conv-1',
          metadata: { retriever_resources: [] }
        })
      })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    const result = await client.sendChatMessage({
      query: '解释 RAG',
      user: 'local-user',
      inputs: {}
    })

    expect(result.answer).toBe('已恢复并返回中文回答。')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to streaming mode for Dify agent-chat apps', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"message":"Agent Chat App does not support blocking mode"}'
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          [
            'data: {"event":"message","conversation_id":"dify-agent-conv","answer":"工具已读取当前状态，"}',
            '',
            'data: {"event":"message","conversation_id":"dify-agent-conv","answer":"当前没有打开论文。"}',
            '',
            'data: {"event":"message_end","conversation_id":"dify-agent-conv","metadata":{"retriever_resources":[]}}',
            ''
          ].join('\n')
      })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'agent-app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    const result = await client.sendChatMessage({
      query: '读取当前状态',
      user: 'local-user',
      inputs: {}
    })

    expect(result).toMatchObject({
      answer: '工具已读取当前状态，当前没有打开论文。',
      difyConversationId: 'dify-agent-conv',
      citations: []
    })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ response_mode: 'blocking' })
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ response_mode: 'streaming' })
  })

  it('parses Dify agent_message chunks and message_end citations in streaming mode', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"message":"Agent Chat App does not support blocking mode"}'
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          [
            'data: {"event":"agent_thought","conversation_id":"dify-agent-conv","tool":"search_library","tool_input":"{\\"query\\":\\"attention mechanism\\"}"}',
            '',
            'data: {"event":"agent_message","conversation_id":"dify-agent-conv","answer":"The agent searched the library, "}',
            '',
            'data: {"event":"agent_message","conversation_id":"dify-agent-conv","answer":"then read the current paper."}',
            '',
            'data: {"event":"message_end","conversation_id":"dify-agent-conv","metadata":{"retriever_resources":[{"document_id":"doc-attn","document_name":"attention.pdf","content":"Scaled dot-product attention","score":0.93}]}}',
            ''
          ].join('\n')
      })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'agent-app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    const result = await client.sendChatMessage({
      query: 'Explain attention',
      user: 'local-user',
      inputs: {}
    })

    expect(result.answer).toBe('The agent searched the library, then read the current paper.')
    expect(result.citations).toEqual([
      expect.objectContaining({
        paperTitle: 'attention.pdf',
        sourceDocumentId: 'doc-attn',
        snippet: 'Scaled dot-product attention',
        score: 0.93
      })
    ])
  })

  it('emits answer deltas while reading streaming agent messages', async () => {
    const progress = vi.fn()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"message":"Agent Chat App does not support blocking mode"}'
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '',
        body: (async function* () {
          yield new TextEncoder().encode('data: {"event":"agent_message","conversation_id":"dify-agent-conv","answer":"第一段"}\n\n')
          yield new TextEncoder().encode('data: {"event":"agent_message","conversation_id":"dify-agent-conv","answer":"第二段"}\n\n')
          yield new TextEncoder().encode('data: {"event":"message_end","conversation_id":"dify-agent-conv","metadata":{"retriever_resources":[]}}\n\n')
        })()
      })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'agent-app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    await expect(
      client.sendChatMessage({ query: '流式回答', user: 'local-user', inputs: {}, onProgress: progress })
    ).resolves.toMatchObject({ answer: '第一段第二段' })

    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'delta', delta: '第一段' }))
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'delta', delta: '第二段' }))
  })

  it('withholds execution narration from streaming answer deltas', async () => {
    const progress = vi.fn()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"message":"Agent Chat App does not support blocking mode"}'
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '',
        body: (async function* () {
          yield new TextEncoder().encode('data: {"event":"agent_message","answer":"现在我已经获取了足够的信息，"}\n\n')
          yield new TextEncoder().encode('data: {"event":"agent_message","answer":"下面给出综合说明。\\n\\n"}\n\n')
          yield new TextEncoder().encode('data: {"event":"agent_message","answer":"## 结论\\nTransformer 使用自注意力。"}\n\n')
          yield new TextEncoder().encode('data: {"event":"message_end","metadata":{"retriever_resources":[]}}\n\n')
        })()
      })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'agent-app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    const result = await client.sendChatMessage({ query: '总结论文', user: 'local-user', inputs: {}, onProgress: progress })
    const deltas = progress.mock.calls
      .map(([event]) => event)
      .filter((event) => event.phase === 'delta')
      .map((event) => event.delta)
      .join('')

    expect(result.answer).toBe('## 结论\nTransformer 使用自注意力。')
    expect(deltas).toBe('## 结论\nTransformer 使用自注意力。')
  })

  it('preserves an unheaded final answer after inline English streaming narration', async () => {
    const progress = vi.fn()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"message":"Agent Chat App does not support blocking mode"}'
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '',
        body: (async function* () {
          yield new TextEncoder().encode(
            'data: {"event":"agent_message","answer":"Let me first check the current context. Let me investigate the paper for evidence. Now I have enough evidence. BERT uses masked language modeling."}\n\n'
          )
          yield new TextEncoder().encode('data: {"event":"message_end","metadata":{"retriever_resources":[]}}\n\n')
        })()
      })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'agent-app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    const result = await client.sendChatMessage({ query: 'Summarize BERT', user: 'local-user', inputs: {}, onProgress: progress })
    const deltas = progress.mock.calls
      .map(([event]) => event)
      .filter((event) => event.phase === 'delta')
      .map((event) => event.delta)
      .join('')

    expect(result.answer).toBe('BERT uses masked language modeling.')
    expect(deltas).toBe('BERT uses masked language modeling.')
  })

  it('passes an abort signal through to the streaming Dify request', async () => {
    const controller = new AbortController()
    let receivedSignal: AbortSignal | undefined
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"message":"Agent Chat App does not support blocking mode"}'
      })
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
        receivedSignal = init?.signal ?? undefined
        return new Promise<never>((_resolve, reject) => {
          receivedSignal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')))
        })
      })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'agent-app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    const pending = client.sendChatMessage({
      query: '停止生成',
      user: 'local-user',
      inputs: {},
      signal: controller.signal
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(receivedSignal).toBe(controller.signal)
  })

  it('keeps only the final answer after agent tool-call narration', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"message":"Agent Chat App does not support blocking mode"}'
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          [
            'data: {"event":"agent_message","conversation_id":"dify-agent-conv","answer":"我先读取当前论文。"}',
            '',
            'data: {"event":"agent_thought","conversation_id":"dify-agent-conv","tool":"get_current_context","tool_input":"{}"}',
            '',
            'data: {"event":"agent_message","conversation_id":"dify-agent-conv","answer":"接下来检索相关章节。"}',
            '',
            'data: {"event":"agent_thought","conversation_id":"dify-agent-conv","tool":"search_current_paper","tool_input":"{\\"query\\":\\"multi-head attention\\"}"}',
            '',
            'data: {"event":"agent_message","conversation_id":"dify-agent-conv","answer":"多头注意力允许模型同时关注不同表示子空间。"}',
            '',
            'data: {"event":"message_end","conversation_id":"dify-agent-conv","metadata":{"retriever_resources":[]}}',
            ''
          ].join('\n')
      })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'agent-app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    const result = await client.sendChatMessage({
      query: '为什么使用多头注意力？',
      user: 'local-user',
      inputs: {}
    })

    expect(result.answer).toBe('多头注意力允许模型同时关注不同表示子空间。')
  })

  it('emits compact progress events from Dify agent tool streaming events', async () => {
    const progress = vi.fn()
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"message":"Agent Chat App does not support blocking mode"}'
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          [
            'data: {"event":"agent_thought","conversation_id":"dify-agent-conv","tool":"get_current_context","tool_input":"{}"}',
            '',
            'data: {"event":"agent_thought","conversation_id":"dify-agent-conv","tool":"get_paper_outline","tool_input":"{\\"paperId\\":\\"paper-demo\\"}"}',
            '',
            'data: {"event":"agent_message","conversation_id":"dify-agent-conv","answer":"当前论文大纲可用。"}',
            '',
            'data: {"event":"message_end","conversation_id":"dify-agent-conv","metadata":{"retriever_resources":[]}}',
            ''
          ].join('\n')
      })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'agent-app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    await client.sendChatMessage({
      query: 'Summarize the current paper',
      user: 'local-user',
      inputs: {},
      onProgress: progress
    })

    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'tool', toolName: 'get_current_context', label: '读取当前状态' }))
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'tool', toolName: 'get_paper_outline', label: '读取论文大纲' }))
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'answer', label: '生成回答' }))
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'done', label: '完成' }))
  })

  it('turns local agent-tool observations into paper citations', async () => {
    const observation = JSON.stringify({
      investigate_paper: JSON.stringify({
        ok: true,
        paper: { id: 'paper-attention', title: 'Attention Is All You Need' },
        evidence: [
          {
            pageNumber: 4,
            score: 0.91,
            text: 'Scaled dot-product attention computes a weighted sum over values.',
            source: 'search'
          }
        ]
      })
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"message":"Agent Chat App does not support blocking mode"}'
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          [
            `data: ${JSON.stringify({ event: 'agent_thought', tool: 'investigate_paper', observation })}`,
            '',
            'data: {"event":"agent_message","conversation_id":"dify-agent-conv","answer":"Transformer uses self-attention."}',
            '',
            'data: {"event":"message_end","conversation_id":"dify-agent-conv","metadata":{"retriever_resources":[]}}',
            ''
          ].join('\n')
      })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'agent-app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    const result = await client.sendChatMessage({ query: 'Explain attention', user: 'local-user', inputs: {} })

    expect(result.citations).toEqual([
      expect.objectContaining({
        paperId: 'paper-attention',
        paperTitle: 'Attention Is All You Need',
        pageNumber: 4,
        evidenceType: 'tool',
        snippet: expect.stringContaining('Scaled dot-product attention')
      })
    ])
  })

  it('preserves per-paper evidence citations from a library investigation', async () => {
    const observation = JSON.stringify({
      investigate_library: JSON.stringify({
        ok: true,
        evidenceByPaper: [
          {
            paper: { id: 'paper-attention', title: 'Attention Is All You Need' },
            evidenceByAspect: [
              {
                label: 'mechanism',
                evidence: [{ pageNumber: 3, score: 0.9, text: 'The Transformer relies entirely on attention.', source: 'search' }]
              }
            ]
          },
          {
            paper: { id: 'paper-bert', title: 'BERT' },
            evidenceByAspect: [
              {
                label: 'representation',
                evidence: [{ pageNumber: 2, score: 0.88, text: 'BERT is designed to pre-train deep bidirectional representations.', source: 'search' }]
              }
            ]
          }
        ]
      })
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"message":"Agent Chat App does not support blocking mode"}'
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          [
            `data: ${JSON.stringify({ event: 'agent_thought', tool: 'investigate_library', observation })}`,
            '',
            'data: {"event":"agent_message","conversation_id":"dify-agent-conv","answer":"The papers use different mechanisms."}',
            '',
            'data: {"event":"message_end","conversation_id":"dify-agent-conv","metadata":{"retriever_resources":[]}}',
            ''
          ].join('\n')
      })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'agent-app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    const result = await client.sendChatMessage({ query: 'Compare the papers', user: 'local-user', inputs: {} })

    expect(result.citations).toEqual([
      expect.objectContaining({ paperId: 'paper-attention', pageNumber: 3, snippet: expect.stringContaining('Transformer relies') }),
      expect.objectContaining({ paperId: 'paper-bert', pageNumber: 2, snippet: expect.stringContaining('BERT is designed') })
    ])
  })

  it('retries transient DeepSeek bridge failures after falling back to agent-chat streaming mode', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"message":"Agent Chat App does not support blocking mode"}'
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          'data: {"event":"error","status":400,"message":"{\\"error_type\\":\\"ValueError\\",\\"message\\":\\"deepseek_bridge_upstream_error\\"}"}\n\n'
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"message":"Agent Chat App does not support blocking mode"}'
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => 'data: {"event":"message","conversation_id":"dify-agent-conv","answer":"已恢复。"}\n\n'
      })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'agent-app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    const result = await client.sendChatMessage({
      query: '读取当前状态',
      user: 'local-user',
      inputs: {}
    })

    expect(result.answer).toBe('已恢复。')
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toMatchObject({ response_mode: 'streaming' })
  })

  it('strips model reasoning tags from blocking chat answers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: '<think>internal reasoning</think>\n最终回答',
        conversation_id: 'dify-conv-1',
        metadata: { retriever_resources: [] }
      })
    })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    const result = await client.sendChatMessage({
      query: '解释 RAG',
      user: 'local-user',
      inputs: {}
    })

    expect(result.answer).toBe('最终回答')
  })

  it('strips common assistant boilerplate from chat answers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: '好的，作为 ResearchNotion 科研学术问答智能体，我将为你详细解释这篇论文的核心创新点。\n\n核心创新点是自注意力机制。',
        conversation_id: 'dify-conv-1',
        metadata: { retriever_resources: [] }
      })
    })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    const result = await client.sendChatMessage({
      query: '解释 Attention',
      user: 'local-user',
      inputs: {}
    })

    expect(result.answer).toBe('核心创新点是自注意力机制。')
  })

  it('strips final tool-execution narration while keeping the substantive answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: '现在我有足够的证据来综合回答。以下是这篇论文的局限分析。',
        conversation_id: 'dify-conv-1',
        metadata: { retriever_resources: [] }
      })
    })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'app-key',
      knowledgeApiKey: 'dataset-key',
      fetchImpl: fetchMock
    })

    const result = await client.sendChatMessage({ query: '分析局限', user: 'local-user', inputs: {} })

    expect(result.answer).toBe('以下是这篇论文的局限分析。')
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
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData
    expect(JSON.parse(String(body.get('data')))).toMatchObject({
      indexing_technique: 'economy',
      process_rule: { mode: 'automatic' }
    })
  })

  it('drops a stale conversation_id after a blocking 404 conversation-not-exists and retries without it', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => '{"code":"not_found","message":"Conversation Not Exists.","status":404}'
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          answer: '已在新的 Dify 对话中恢复。',
          conversation_id: 'new-conv',
          metadata: { retriever_resources: [] }
        })
      })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    const result = await client.sendChatMessage({
      query: '继续讨论',
      user: 'local-user',
      inputs: {},
      conversationId: 'stale-conv-from-other-app'
    })

    expect(result.answer).toBe('已在新的 Dify 对话中恢复。')
    expect(result.difyConversationId).toBe('new-conv')
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      conversation_id: 'stale-conv-from-other-app'
    })
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).not.toHaveProperty('conversation_id')
  })

  it('recovers from a stale conversation_id in agent-chat streaming mode', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"message":"Agent Chat App does not support blocking mode"}'
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => '{"code":"not_found","message":"Conversation Not Exists.","status":404}'
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => '{"message":"Agent Chat App does not support blocking mode"}'
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          'data: {"event":"agent_message","conversation_id":"new-agent-conv","answer":"已在新对话恢复。"}\n\n'
      })
    const client = createDifyClient({
      baseUrl: 'http://localhost:8080',
      appApiKey: 'agent-app-key',
      knowledgeApiKey: 'knowledge-key',
      fetchImpl: fetchMock
    })

    const result = await client.sendChatMessage({
      query: '继续讨论',
      user: 'local-user',
      inputs: {},
      conversationId: 'stale-conv-from-workflow-app'
    })

    expect(result.answer).toBe('已在新对话恢复。')
    expect(result.difyConversationId).toBe('new-agent-conv')
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      conversation_id: 'stale-conv-from-workflow-app'
    })
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).not.toHaveProperty('conversation_id')
  })
})
