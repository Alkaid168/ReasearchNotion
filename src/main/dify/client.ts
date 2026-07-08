import type { Citation } from '../../shared/types'
import { DifyApiError } from './errors'
import type { DifyDataset, SendChatInput, SendChatResult } from './types'

type FetchResponseLike = {
  ok: boolean
  status?: number
  json(): Promise<unknown>
  text?: () => Promise<string>
}

type FetchImpl = (url: string, init?: RequestInit) => Promise<FetchResponseLike>

type DifyClientOptions = {
  baseUrl: string
  appApiKey: string
  knowledgeApiKey: string
  fetchImpl?: FetchImpl
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
    return {
      paperId: null,
      paperTitle: String(resource.document_name ?? resource.documentName ?? 'Unknown source'),
      snippet: String(resource.content ?? ''),
      score: typeof resource.score === 'number' ? resource.score : null
    }
  })
}

export function createDifyClient(options: DifyClientOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const fetchImpl: FetchImpl = options.fetchImpl ?? fetch

  return {
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
    async sendChatMessage(input: SendChatInput): Promise<SendChatResult> {
      const response = await fetchImpl(`${baseUrl}/v1/chat-messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.appApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: input.inputs,
          query: input.query,
          response_mode: 'blocking',
          conversation_id: input.conversationId,
          user: input.user
        })
      })
      const json = (await readJson(response)) as Record<string, unknown>
      return {
        answer: String(json.answer ?? ''),
        difyConversationId: typeof json.conversation_id === 'string' ? json.conversation_id : null,
        citations: mapCitations(json.retriever_resources)
      }
    }
  }
}
