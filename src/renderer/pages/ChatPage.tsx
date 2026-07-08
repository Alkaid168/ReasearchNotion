import { useEffect, useState, type JSX } from 'react'
import { ArrowUp, BookOpen, GitCompare, Lightbulb, ListChecks, Quote } from 'lucide-react'
import { desktopApi } from '../api/desktopApi'
import type { Conversation, Message } from '../../shared/types'

export function ChatPage(): JSX.Element {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let alive = true
    void desktopApi.conversations.list().then((rows) => {
      if (alive && rows.length > 0) setConversations(rows)
    })
    return () => {
      alive = false
    }
  }, [])

  async function send(): Promise<void> {
    const content = draft.trim()
    if (!content || sending) return

    setSending(true)
    setDraft('')
    let id = conversationId
    try {
      if (!id) {
        const conversation = await desktopApi.conversations.create({
          title: content.slice(0, 24),
          folderId: null,
          context: { type: 'free' }
        })
        id = conversation.id
        setConversationId(id)
        setConversations((current) => [conversation, ...current])
      }

      const userMessage: Message = {
        id: `local-${Date.now()}`,
        conversationId: id,
        role: 'user',
        content,
        citations: [],
        createdAt: new Date().toISOString()
      }
      setMessages((current) => [...current, userMessage])

      const assistant = await desktopApi.conversations.sendMessage(id, content)
      setMessages((current) => [...current, assistant])
    } finally {
      setSending(false)
    }
  }

  return (
    <main className={messages.length ? 'chat-page has-messages' : 'chat-page'}>
      {messages.length ? (
        <section className="message-list" aria-label="对话消息">
          {messages.map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              <p>{message.content}</p>
              {message.citations.length ? (
                <footer>
                  {message.citations.map((citation) => (
                    <span key={`${message.id}-${citation.paperTitle}-${citation.snippet}`}>{citation.paperTitle}</span>
                  ))}
                </footer>
              ) : null}
            </article>
          ))}
        </section>
      ) : (
        <section className="chat-hero">
          <div className="empty-avatar">R</div>
          <h1>今天研究点什么？</h1>
          <Composer draft={draft} sending={sending} onDraftChange={setDraft} onSend={() => void send()} />
        </section>
      )}

      {messages.length ? (
        <section className="chat-dock">
          <Composer draft={draft} sending={sending} onDraftChange={setDraft} onSend={() => void send()} />
        </section>
      ) : null}

      <span className="conversation-count">{conversations.length ? `${conversations.length} 个历史对话` : '新对话'}</span>
    </main>
  )
}

type ComposerProps = {
  draft: string
  sending: boolean
  onDraftChange: (value: string) => void
  onSend: () => void
}

function Composer({ draft, sending, onDraftChange, onSend }: ComposerProps): JSX.Element {
  return (
    <div className="composer" aria-label="研究问答输入区">
      <div className="composer-notice">选择论文库后，回答会优先引用你上传的资料。</div>
      <textarea
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="询问论文、比较方法、提取创新点、解释术语..."
      />
      <div className="quick-actions">
        <button type="button">
          <BookOpen size={15} aria-hidden="true" />
          摘要
        </button>
        <button type="button">
          <Quote size={15} aria-hidden="true" />
          术语解释
        </button>
        <button type="button">
          <Lightbulb size={15} aria-hidden="true" />
          创新点
        </button>
        <button type="button">
          <GitCompare size={15} aria-hidden="true" />
          方法对比
        </button>
        <button type="button">
          <ListChecks size={15} aria-hidden="true" />
          综述提纲
        </button>
        <button className="send-button" type="button" aria-label="发送" disabled={sending} onClick={onSend}>
          <ArrowUp size={17} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
