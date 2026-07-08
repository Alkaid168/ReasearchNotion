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
}

export type SendChatResult = {
  answer: string
  difyConversationId: string | null
  citations: Citation[]
}
