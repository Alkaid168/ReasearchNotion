import { describe, expect, it } from 'vitest'
import { formatConversationMarkdown } from '../../src/main/conversations/exportMarkdown'
import type { Conversation, Message } from '../../src/shared/types'

const conversation: Conversation = {
  id: 'conversation-1',
  title: 'RAG 方法分析',
  folderId: null,
  conversationFolderId: null,
  difyConversationId: 'dify-1',
  context: { type: 'paper', paperId: 'paper-1', paperTitle: 'RAG Survey' },
  createdAt: '2026-07-12T01:00:00.000Z',
  updatedAt: '2026-07-12T02:00:00.000Z'
}

const messages: Message[] = [
  {
    id: 'message-user',
    conversationId: conversation.id,
    role: 'user',
    content: '总结核心方法。',
    citations: [],
    createdAt: '2026-07-12T01:00:00.000Z'
  },
  {
    id: 'message-assistant',
    conversationId: conversation.id,
    role: 'assistant',
    content: 'RAG 先检索，再生成。',
    citations: [{ paperId: 'paper-1', paperTitle: 'RAG Survey', snippet: 'retrieval augmented generation', score: 0.91 }],
    createdAt: '2026-07-12T01:00:04.000Z'
  }
]

describe('conversation Markdown export', () => {
  it('exports readable messages and citations without internal identifiers', () => {
    const output = formatConversationMarkdown(conversation, messages)

    expect(output).toContain('# RAG 方法分析')
    expect(output).toContain('上下文：RAG Survey')
    expect(output).toContain('## 你')
    expect(output).toContain('总结核心方法。')
    expect(output).toContain('## ResearchNotion')
    expect(output).toContain('RAG 先检索，再生成。')
    expect(output).toContain('- RAG Survey：retrieval augmented generation')
    expect(output).not.toContain('dify-1')
    expect(output).not.toContain('paper-1')
  })
})
