import type { Citation } from '../../shared/types'

export type DifyDataset = {
  id: string
  name: string
}

export type SendChatInput = {
  query: string
  user: string
  inputs: Record<string, string>
  conversationId?: string
  onProgress?: (event: DifyChatProgressEvent) => void
  signal?: AbortSignal
}

export type SendChatResult = {
  answer: string
  difyConversationId: string | null
  citations: Citation[]
}

export type DifyChatProgressEvent = {
  phase: 'tool' | 'answer' | 'delta' | 'done'
  label: string
  toolName?: string
  delta?: string
  replaceAnswer?: boolean
}

export type DifyConnectionCheck = {
  app: boolean
  knowledge: boolean
  appName: string | null
  appMode: string | null
  missingInputs: string[]
  retrieverResourceEnabled: boolean
}

export type DifyAppInfo = {
  name: string | null
  mode: string | null
}
