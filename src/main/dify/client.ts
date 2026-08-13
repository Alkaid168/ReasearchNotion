import type { Citation, TokenUsage } from '../../shared/types'
import { DifyApiError } from './errors'
import type { DifyAppInfo, DifyChatProgressEvent, DifyConnectionCheck, DifyDataset, SendChatInput, SendChatResult } from './types'

type FetchResponseLike = {
  ok: boolean
  status?: number
  json(): Promise<unknown>
  text?: () => Promise<string>
  body?: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array> | null
}

type FetchImpl = (url: string, init?: RequestInit) => Promise<FetchResponseLike>

type DifyClientOptions = {
  baseUrl: string
  appApiKey: string
  knowledgeApiKey: string
  fetchImpl?: FetchImpl
  preferredResponseMode?: 'blocking' | 'streaming'
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readJson(response: FetchResponseLike): Promise<unknown> {
  if (response.ok) return response.json()
  const body = response.text ? await response.text() : ''
  throw new DifyApiError(`Dify request failed with status ${response.status ?? 0}`, response.status ?? 0, body)
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

function mapCitations(resources: unknown): Citation[] {
  if (!Array.isArray(resources)) return []
  return resources.map((item) => {
    const resource = item as Record<string, unknown>
    const sourceDocumentId = resource.document_id ?? resource.documentId
    return {
      paperId: null,
      paperTitle: String(resource.document_name ?? resource.documentName ?? 'Unknown source'),
      snippet: String(resource.content ?? ''),
      score: typeof resource.score === 'number' ? resource.score : null,
      sourceDocumentId: typeof sourceDocumentId === 'string' ? sourceDocumentId : null,
      evidenceType: 'retrieval'
    }
  })
}

function objectValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function parseToolValue(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      return objectValue(JSON.parse(value))
    } catch {
      return null
    }
  }
  return objectValue(value)
}

function toolCitation(input: {
  paperId: unknown
  paperTitle: unknown
  pageNumber?: unknown
  section?: unknown
  snippet?: unknown
  score?: unknown
  evidenceType?: Citation['evidenceType']
}): Citation | null {
  const paperId = typeof input.paperId === 'string' && input.paperId.trim() ? input.paperId : null
  const paperTitle = typeof input.paperTitle === 'string' && input.paperTitle.trim() ? input.paperTitle : '本地论文'
  const snippet = typeof input.snippet === 'string' ? input.snippet.trim() : ''
  if (!paperId && !snippet) return null
  return {
    paperId,
    paperTitle,
    snippet,
    score: typeof input.score === 'number' ? input.score : null,
    pageNumber: typeof input.pageNumber === 'number' ? input.pageNumber : null,
    section: typeof input.section === 'string' && input.section.trim() ? input.section : null,
    evidenceType: input.evidenceType ?? 'tool'
  }
}

function citationsFromToolOutput(toolName: string, rawOutput: unknown): Citation[] {
  const output = parseToolValue(rawOutput)
  if (!output || output.ok !== true) return []
  const paper = objectValue(output.paper)
  const paperId = paper?.id ?? output.paperId
  const paperTitle = paper?.title ?? output.paperTitle

  function citationsForEvidence(paperId: unknown, paperTitle: unknown, evidenceItems: unknown[]): Citation[] {
    return evidenceItems
      .map((item) => objectValue(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) =>
        toolCitation({
          paperId,
          paperTitle,
          pageNumber: item.pageNumber,
          snippet: item.text,
          score: item.score
        })
      )
      .filter((citation): citation is Citation => Boolean(citation))
  }

  function aspectEvidenceItems(value: unknown): unknown[] {
    if (!Array.isArray(value)) return []
    return value.flatMap((aspect) => {
      const item = objectValue(aspect)
      return item && Array.isArray(item.evidence) ? item.evidence : []
    })
  }

  if (Array.isArray(output.evidenceByPaper)) {
    return output.evidenceByPaper
      .map((item) => objectValue(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .flatMap((item) => {
        const evidencePaper = objectValue(item.paper)
        if (!evidencePaper) return []
        const evidenceItems = [
          ...(Array.isArray(item.evidence) ? item.evidence : []),
          ...aspectEvidenceItems(item.evidenceByAspect)
        ]
        return citationsForEvidence(evidencePaper.id, evidencePaper.title, evidenceItems)
      })
  }

  if (Array.isArray(output.evidenceByAspect)) {
    return citationsForEvidence(paperId, paperTitle, aspectEvidenceItems(output.evidenceByAspect))
  }

  if (Array.isArray(output.evidence)) {
    return citationsForEvidence(paperId, paperTitle, output.evidence)
  }

  if (Array.isArray(output.results)) {
    return output.results
      .map((item) => objectValue(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) =>
        toolCitation({
          paperId: item.paperId ?? paperId,
          paperTitle: item.paperTitle ?? paperTitle,
          pageNumber: item.pageNumber,
          snippet: item.snippet,
          score: item.score
        })
      )
      .filter((citation): citation is Citation => Boolean(citation))
  }

  const isTextualRead = ['get_current_page_text', 'get_paper_page_text', 'get_paper_section', 'get_paper_text_chunk'].includes(
    toolName
  )
  if (!isTextualRead) return []
  const pageNumber = output.pageNumber ?? output.pageStart
  return [
    toolCitation({
      paperId,
      paperTitle,
      pageNumber,
      section: output.heading,
      snippet: output.text,
      evidenceType: 'tool'
    })
  ].filter((citation): citation is Citation => Boolean(citation))
}

function citationsFromAgentThought(event: Record<string, unknown>): Citation[] {
  if (event.event !== 'agent_thought' || typeof event.tool !== 'string' || !event.observation) return []
  const observation = parseToolValue(event.observation)
  if (!observation) return []

  return event.tool
    .split(';')
    .map((toolName) => toolName.trim())
    .flatMap((toolName) => citationsFromToolOutput(toolName, observation[toolName] ?? observation))
}

function uniqueCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>()
  return citations.filter((citation) => {
    const key = [citation.paperId ?? citation.paperTitle, citation.pageNumber ?? '', citation.section ?? '', citation.snippet.slice(0, 180)].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function stripReasoning(answer: string): string {
  return answer.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

function isExecutionNarration(line: string): boolean {
  const normalized = line.trim()
  if (!normalized || /^#{1,6}\s+/.test(normalized)) return false

  const englishNarration =
    /^(?:okay|sure|certainly|let me|now let me|first,?\s+(?:let me|i(?:'ll| will))|i(?:'ll| will)\s+(?:first\s+)?(?:read|retrieve|inspect|search|gather|check|look up|use)|here(?:'s| is)\s+(?:the\s+)?(?:analysis|answer))\b/i.test(
      normalized
    ) ||
    /\b(?:let me|i(?:'ll| will))\b.{0,100}\b(?:read|retrieve|inspect|search|gather|check|look up|use)\b/i.test(
      normalized
    )
  if (englishNarration) return true

  return /^(?:\u597d\u7684[\uff0c,]?\s*)?(?:(?:\u6211\u4eec|\u6211|\u8ba9\u6211)(?:\u5148|\u6b63\u5728|\u4f1a|\u5c06|\u5df2\u7ecf)|(?:\u73b0\u5728|\u63a5\u4e0b\u6765|\u9996\u5148)(?:\u6211\u4eec|\u6211)?(?:\u5148|\u6b63\u5728|\u4f1a|\u5c06|\u5df2\u7ecf)?)/.test(
    normalized
  )
}

function stripInlineExecutionNarration(answer: string): string {
  const narrationSentence = /(^|[。！？\n])\s*(?:好的[，,]?\s*)?(?:(?:我|我们)(?:先|正在|会|将|已经)?|让(?:我|我们)|首先(?:我|我们)?|现在(?:我|我们)?)[^。！？\n]{0,120}(?:获取|读取|检索|搜索|调查|调用)[^。！？\n]{0,120}[。！？]\s*/g
  const englishNarrationSentence =
    /(?:^|(?<=[.!?\n]))\s*(?:(?:okay|sure|certainly)[,!]?\s*)?(?:(?:(?:let me|now let me|first,?\s+let me|i(?:'ll| will)\s+(?:first\s+)?)[^.!?\n]{0,140}\b(?:read|retrieve|inspect|search|gather|check|look up|use|list|investigate)\b[^.!?\n]*)|(?:(?:now|at this point),?\s+i(?:'ve| have)[^.!?\n]{0,100}\b(?:evidence|information|context)\b[^.!?\n]*))[.!?]/gi
  return answer
    .replace(narrationSentence, (_match, boundary: string) => boundary)
    .replace(englishNarrationSentence, '')
}

function stripExecutionNarration(answer: string): string {
  const lines = answer.replace(/\r/g, '').split('\n')
  let start = 0

  while (start < lines.length) {
    const line = lines[start].trim()
    if (!line) {
      start += 1
      continue
    }
    const headingIndex = line.search(/#{1,6}\s+/)
    if (headingIndex > 0 && isExecutionNarration(line)) {
      lines[start] = line.slice(headingIndex)
      break
    }
    if (!isExecutionNarration(line)) break
    start += 1
  }

  return lines.slice(start).join('\n').trim()
}

function stripBoilerplate(answer: string): string {
  const withoutCommonBoilerplate = answer
    .replace(/^好的[，,]\s*作为\s*ResearchNotion\s*科研学术问答智能体[，,。\s]*我(?:将|会)?(?:为你|给你|帮你)?(?:详细)?(?:解释|分析|总结|回答)[^。\n]*[。\n]\s*/i, '')
    .replace(/^好的[，,]\s*/i, '')
    .replace(
      /^(?:现在)?我(?:(?:已经)?(?:收集|获取|读取|检索)|有)[^。\n]{0,40}(?:信息|证据|内容)(?:来[^。\n]{0,20})?[。！]\s*/i,
      ''
    )
  return stripExecutionNarration(stripInlineExecutionNarration(withoutCommonBoilerplate).trim())
}

function cleanAnswer(answer: string): string {
  const withoutReasoning = stripReasoning(answer)
  const withoutBoilerplate = stripBoilerplate(withoutReasoning)

  // A useful answer is better than an empty message. Some short, general
  // responses can consist entirely of wording that resembles execution
  // narration, so fall back to the reasoning-free response when the optional
  // presentation cleanup removes everything.
  return withoutBoilerplate || withoutReasoning
}

function cleanStreamingAnswer(answer: string): string {
  return stripBoilerplate(stripReasoning(answer))
}

function retrieverResourcesFromResponse(json: Record<string, unknown>): unknown {
  if (Array.isArray(json.retriever_resources)) return json.retriever_resources
  const metadata = json.metadata
  if (metadata && typeof metadata === 'object') {
    return (metadata as Record<string, unknown>).retriever_resources
  }
  return []
}

function isTransientDifyFailure(error: unknown): boolean {
  if (!(error instanceof DifyApiError)) return false
  if (![400, 500, 502, 503, 504].includes(error.status)) return false
  return /Server Unavailable|SSLEOF|UNEXPECTED_EOF|HTTPSConnectionPool|Max retries exceeded|timeout|deepseek_bridge_upstream_error/i.test(
    error.body
  )
}

function isBlockingModeUnsupported(error: unknown): boolean {
  return error instanceof DifyApiError && error.status === 400 && /does not support blocking mode|blocking mode/i.test(error.body)
}

function isConversationNotFound(error: unknown): boolean {
  // Dify may retain a conversation id after its server-side state is removed.
  // Recover by retrying the request without that stale id.
  return error instanceof DifyApiError && error.status === 404 && /conversation not exists/i.test(error.body)
}

function parseStreamingDataLine(line: string): Record<string, unknown> | null {
  if (!line.startsWith('data:')) return null
  const payload = line.slice(5).trim()
  if (!payload || payload === '[DONE]') return null
  try {
    const parsed = JSON.parse(payload) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function progressLabelForTool(toolName: string): string {
  const labels: Record<string, string> = {
    get_current_context: '读取当前状态',
    list_library_papers: '列出论文库',
    get_paper_metadata: '读取论文信息',
    get_current_page_text: '读取当前页',
    get_paper_page_text: '读取指定页',
    get_paper_section: '读取论文章节',
    get_paper_outline: '读取论文大纲',
    get_paper_text_chunk: '读取论文文本',
    investigate_paper: '调查论文证据',
    investigate_library: '逐篇调查论文库',
    search_current_paper: '检索当前论文',
    search_library: '检索论文库',
    search_arxiv: '检索 arXiv',
    search_semantic_scholar: '检索 Semantic Scholar',
    search_openalex: '检索 OpenAlex',
    save_memory: '保存研究偏好'
  }
  return labels[toolName] ?? '调用研究工具'
}

function emitStreamingProgress(event: Record<string, unknown>, onProgress?: (event: DifyChatProgressEvent) => void): void {
  if (!onProgress) return

  if (event.event === 'agent_thought') {
    const thought = typeof event.thought === 'string' ? event.thought.trim() : ''
    // Dify also emits a final agent_thought that repeats the completed answer.
    // Tool-bound thoughts are the useful public planning summaries for this UI.
    if (thought && typeof event.tool === 'string' && event.tool) {
      onProgress({ phase: 'thought', label: '梳理问题与证据', thought })
    }

    if (typeof event.tool === 'string' && event.tool) {
      for (const toolName of event.tool.split(';').map((value) => value.trim()).filter(Boolean)) {
        onProgress({ phase: 'tool', toolName, label: progressLabelForTool(toolName) })
      }
    }
    return
  }

  if (event.event === 'message_end') {
    onProgress({ phase: 'done', label: '完成' })
  }
}

async function* readStreamingResponseChunks(response: FetchResponseLike): AsyncGenerator<Uint8Array> {
  if (response.body) {
    const body = response.body
    if (Symbol.asyncIterator in body) {
      yield* body as AsyncIterable<Uint8Array>
      return
    }

    const reader = body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) yield value
      }
    } finally {
      reader.releaseLock()
    }
    return
  }

  const text = response.text ? await response.text() : ''
  if (text) yield new TextEncoder().encode(text)
}

async function readStreamingChatResponse(response: FetchResponseLike, onProgress?: (event: DifyChatProgressEvent) => void): Promise<SendChatResult> {
  let rawText = ''
  if (!response.ok) {
    for await (const chunk of readStreamingResponseChunks(response)) rawText += new TextDecoder().decode(chunk)
    throw new DifyApiError(`Dify request failed with status ${response.status ?? 0}`, response.status ?? 0, rawText)
  }

  let answer = ''
  let emittedAnswer = ''
  let difyConversationId: string | null = null
  let citationSource: unknown = []
  let capturedUsage: TokenUsage | undefined
  const toolCitations: Citation[] = []
  const decoder = new TextDecoder()

  const handleLine = (line: string): void => {
    const event = parseStreamingDataLine(line)
    if (!event) return

    if (event.event === 'error') {
      throw new DifyApiError(
        String(event.message ?? 'Dify streaming request failed'),
        typeof event.status === 'number' ? event.status : 500,
        JSON.stringify(event)
      )
    }

    if (event.event === 'agent_thought' && typeof event.tool === 'string' && event.tool && answer) {
      const interimThought = stripReasoning(answer).trim()
      if (interimThought) {
        onProgress?.({ phase: 'thought', label: '梳理问题与证据', thought: interimThought })
      }
      onProgress?.({ phase: 'delta', label: '生成回答', delta: '', replaceAnswer: true })
      answer = ''
      emittedAnswer = ''
    }

    if (event.event === 'message_end') {
      const metadata = objectValue(event.metadata)
      const usageRaw = metadata ? objectValue(metadata.usage) : null
      if (usageRaw) {
        capturedUsage = {
          promptTokens: Number(usageRaw.prompt_tokens ?? 0),
          completionTokens: Number(usageRaw.completion_tokens ?? 0),
          totalTokens: Number(usageRaw.total_tokens ?? 0)
        }
        onProgress?.({ phase: 'usage', label: 'token', usage: capturedUsage })
      }
    }
    emitStreamingProgress(event, onProgress)
    toolCitations.push(...citationsFromAgentThought(event))

    if (typeof event.conversation_id === 'string') {
      difyConversationId = event.conversation_id
    }
    if (typeof event.answer === 'string') {
      answer += event.answer
      const cleanedAnswer = cleanStreamingAnswer(answer)
      if (cleanedAnswer) {
        onProgress?.({ phase: 'answer', label: '生成回答' })
        if (cleanedAnswer.startsWith(emittedAnswer)) {
          const delta = cleanedAnswer.slice(emittedAnswer.length)
          if (delta) onProgress?.({ phase: 'delta', label: '生成回答', delta })
        } else {
          onProgress?.({ phase: 'delta', label: '生成回答', delta: cleanedAnswer, replaceAnswer: true })
        }
        emittedAnswer = cleanedAnswer
      }
    }

    const resources = retrieverResourcesFromResponse(event)
    if (Array.isArray(resources) && resources.length > 0) {
      citationSource = resources
    }
  }

  for await (const chunk of readStreamingResponseChunks(response)) {
    rawText += decoder.decode(chunk, { stream: true })
    let newlineIndex = rawText.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = rawText.slice(0, newlineIndex).replace(/\r$/, '')
      rawText = rawText.slice(newlineIndex + 1)
      handleLine(line)
      newlineIndex = rawText.indexOf('\n')
    }
  }
  rawText += decoder.decode()
  if (rawText.trim()) handleLine(rawText.replace(/\r$/, ''))

  const finalCitations = uniqueCitations([...mapCitations(citationSource), ...toolCitations])
  return {
    answer: cleanAnswer(answer),
    difyConversationId,
    citations: finalCitations,
    usage: capturedUsage
  }
}

export function createDifyClient(options: DifyClientOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const fetchImpl: FetchImpl = options.fetchImpl ?? fetch

  const getAppInfo = async (): Promise<DifyAppInfo> => {
    const info = (await readJson(
      await fetchImpl(`${baseUrl}/v1/info`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${options.appApiKey}`
        }
      })
    )) as Record<string, unknown>

    return {
      name: typeof info.name === 'string' ? info.name : null,
      mode: typeof info.mode === 'string' ? info.mode : null
    }
  }

  return {
    getAppInfo,
    async testConnection(): Promise<DifyConnectionCheck> {
      const info = await getAppInfo()

      const hasKnowledgeKey = Boolean(options.knowledgeApiKey)
      if (hasKnowledgeKey) {
        await readJson(
          await fetchImpl(`${baseUrl}/v1/datasets?page=1&limit=1`, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${options.knowledgeApiKey}`
            }
          })
        )
      }

      return {
        app: true,
        knowledge: hasKnowledgeKey,
        appName: info.name,
        appMode: info.mode,
        missingInputs: [],
        retrieverResourceEnabled: true
      }
    },
    async createDataset(name: string): Promise<DifyDataset> {
      const response = await fetchImpl(`${baseUrl}/v1/datasets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.knowledgeApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name })
      })
      const json = (await readJson(response)) as Record<string, unknown>
      return { id: String(json.id), name: String(json.name ?? name) }
    },
    async deleteDocument(datasetId: string, documentId: string): Promise<void> {
      await readJson(
        await fetchImpl(`${baseUrl}/v1/datasets/${datasetId}/documents/${documentId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${options.knowledgeApiKey}`
          }
        })
      )
    },
    async deleteDataset(datasetId: string): Promise<void> {
      await readJson(
        await fetchImpl(`${baseUrl}/v1/datasets/${datasetId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${options.knowledgeApiKey}`
          }
        })
      )
    },
    async uploadDocumentByFile(input: {
      datasetId: string
      file: Blob
      filename: string
    }): Promise<{ documentId: string }> {
      const form = new FormData()
      form.append(
        'data',
        JSON.stringify({
          indexing_technique: 'economy',
          process_rule: { mode: 'automatic' }
        })
      )
      form.append('file', input.file, input.filename)

      const response = await fetchImpl(`${baseUrl}/v1/datasets/${input.datasetId}/document/create-by-file`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.knowledgeApiKey}`
        },
        body: form
      })
      const json = (await readJson(response)) as Record<string, unknown>
      const document = json.document as Record<string, unknown> | undefined
      return { documentId: String(document?.id ?? json.id) }
    },
    async sendChatMessage(input: SendChatInput): Promise<SendChatResult> {
      let lastError: unknown = null
      const preferredResponseMode = options.preferredResponseMode ?? 'blocking'

      const send = async (responseMode: 'blocking' | 'streaming'): Promise<SendChatResult> => {
        const response = await fetchImpl(`${baseUrl}/v1/chat-messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.appApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            inputs: input.inputs,
            query: input.query,
            response_mode: responseMode,
            conversation_id: input.conversationId,
            user: input.user
          }),
          signal: input.signal
        })

        if (responseMode === 'streaming') {
          return readStreamingChatResponse(response, input.onProgress)
        }

        const json = (await readJson(response)) as Record<string, unknown>
        return {
          answer: cleanAnswer(String(json.answer ?? '')),
          difyConversationId: typeof json.conversation_id === 'string' ? json.conversation_id : null,
          citations: mapCitations(retrieverResourcesFromResponse(json))
        }
      }

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return await send(preferredResponseMode)
        } catch (error) {
          lastError = error
          if (input.conversationId && isConversationNotFound(error)) {
            input.conversationId = undefined
            if (attempt === 0) continue
          }
          if (preferredResponseMode === 'streaming') {
            if (attempt === 0 && isTransientDifyFailure(error)) {
              await wait(1600)
              continue
            }
            throw error
          }
          if (isBlockingModeUnsupported(error)) {
            try {
              return await send('streaming')
            } catch (streamingError) {
              lastError = streamingError
              if (input.conversationId && isConversationNotFound(streamingError)) {
                input.conversationId = undefined
                if (attempt === 0) continue
              }
              if (attempt === 0 && isTransientDifyFailure(streamingError)) {
                await wait(1600)
                continue
              }
              throw streamingError
            }
          }
          if (attempt === 0 && isTransientDifyFailure(error)) {
            await wait(1600)
            continue
          }
          throw error
        }
      }

      throw lastError instanceof Error ? lastError : new Error('Dify request failed')
    }
  }
}
