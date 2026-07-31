import type { ChatContext, Conversation, Message } from '../../shared/types'

function contextLabel(context: ChatContext): string {
  if (context.type === 'paper') return context.paperTitle || '论文'
  if (context.type === 'folder') return context.folderName || '论文库'
  return '不限定资料'
}

function formatCitations(message: Message): string[] {
  if (message.role !== 'assistant' || !message.citations.length) return []
  return [
    '',
    '### 引用',
    ...message.citations.map((citation) => {
      const snippet = citation.snippet.trim().replace(/\s+/g, ' ')
      return `- ${citation.paperTitle}${snippet ? `：${snippet}` : ''}`
    })
  ]
}

export function formatConversationMarkdown(conversation: Conversation, messages: Message[]): string {
  const lines = [
    `# ${conversation.title || '未命名对话'}`,
    '',
    `上下文：${contextLabel(conversation.context)}`,
    `导出时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`
  ]

  for (const message of messages) {
    lines.push('', `## ${message.role === 'user' ? '你' : 'ResearchNotion'}`, '', message.content.trim())
    lines.push(...formatCitations(message))
  }

  return `${lines.join('\n').trim()}\n`
}

export function conversationExportFilename(title: string): string {
  const safeTitle = title.trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'ResearchNotion 对话'
  return `${safeTitle}.md`
}
