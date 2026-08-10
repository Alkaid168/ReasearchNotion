import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { ArrowDown, ArrowUp, BookOpen, Check, Copy, Download, GitCompare, LibraryBig, Lightbulb, ListChecks, Quote, RotateCcw, Square } from 'lucide-react'
import { desktopApi } from '../api/desktopApi'
import researchNotionMark from '../assets/research-notion-mark.svg'
import { AcademicMarkdown } from '../components/AcademicMarkdown'
import { CitationStatus } from '../components/CitationStatus'
import { userFacingSendError } from '../utils/userFacingError'
import type { ChatContext, Citation, Conversation, Folder, Message, Paper } from '../../shared/types'

type ChatPageProps = {
  selectedConversationId?: string | null
  selectedConversationFolderId?: string | null
  onConversationCreated?: (conversation: Conversation) => void
  onNotify?: (message: string, tone?: 'success' | 'error') => void
  onOpenCitation?: (citation: Citation) => void
}

type ContextOption = {
  value: string
  label: string
  context: ChatContext
}

type SendProgressStep = 'prepare' | 'context' | 'dify' | 'save'

type SendProgress = {
  step: SendProgressStep
  startedAt: number
  detail?: string
} | null

type StreamingAnswer = {
  requestId: string
  content: string
} | null

const progressSteps: Array<{ step: SendProgressStep; label: string }> = [
  { step: 'prepare', label: '准备对话' },
  { step: 'context', label: '锁定上下文' },
  { step: 'dify', label: 'Dify 检索与生成' },
  { step: 'save', label: '写入回答' }
]

const freeContext: ChatContext = { type: 'free' }

function createProgressRequestId(): string {
  return `progress-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const quickActionTemplates = {
  summary: '请总结当前上下文的核心内容，按研究问题、方法、结论和局限性组织。',
  terms: '请解释当前上下文中的关键术语，并给出适合初学者理解的中文说明。',
  novelty: '请提取当前上下文中可能的创新点，并说明它们与已有工作的差异。',
  compare: '请比较当前上下文中的主要方法，包括适用场景、优势、局限和评价指标。',
  outline: '请基于当前上下文生成一份综述提纲，包含章节结构、核心问题和可继续追问的方向。'
} as const

function contextValue(context: ChatContext): string {
  if (context.type === 'folder') return `folder:${context.folderId}`
  if (context.type === 'paper') return `paper:${context.paperId}`
  return 'free'
}

function folderContext(folder: Folder): ChatContext {
  return { type: 'folder', folderId: folder.id, folderName: folder.name }
}

function paperContext(paper: Paper): ChatContext {
  return { type: 'paper', paperId: paper.id, paperTitle: paper.title }
}

export function ChatPage({
  selectedConversationId,
  selectedConversationFolderId = null,
  onConversationCreated,
  onNotify,
  onOpenCitation
}: ChatPageProps): JSX.Element {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendProgress, setSendProgress] = useState<SendProgress>(null)
  const [streamingAnswer, setStreamingAnswer] = useState<StreamingAnswer>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [selectedContext, setSelectedContext] = useState<ChatContext>(freeContext)
  const [availableFolders, setAvailableFolders] = useState<Folder[]>([])
  const [availablePapers, setAvailablePapers] = useState<Paper[]>([])
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [activeProgressRequestId, setActiveProgressRequestId] = useState<string | null>(null)
  const [followLatest, setFollowLatest] = useState(true)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const [contextSwitchNotice, setContextSwitchNotice] = useState<string | null>(null)
  const messageListRef = useRef<HTMLElement | null>(null)

  function handleContextChange(context: ChatContext): void {
    setSelectedContext(context)
    if (conversationId) {
      void desktopApi.conversations.updateContext(conversationId, context).then(() => {
        setContextSwitchNotice('上下文已切换，后续消息将基于新上下文生成。')
        window.setTimeout(() => setContextSwitchNotice(null), 4000)
      })
    }
  }

  const contextOptions = useMemo(() => {
    const folderOptions = availableFolders.map((folder) => ({
      value: contextValue(folderContext(folder)),
      label: folder.name,
      context: folderContext(folder)
    }))
    const paperOptions = availablePapers.map((paper) => ({
      value: contextValue(paperContext(paper)),
      label: paper.title,
      context: paperContext(paper)
    }))
    return { folderOptions, paperOptions }
  }, [availableFolders, availablePapers])

  useEffect(() => {
    let alive = true

    void desktopApi.folders.list().then(async (folders) => {
      const paperGroups = await Promise.all(folders.map((folder) => desktopApi.papers.list(folder.id)))
      if (!alive) return
      setAvailableFolders(folders)
      setAvailablePapers(paperGroups.flat().map(({ card: _card, ...paper }) => paper))
    })

    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (selectedConversationId === undefined) return
    if (!selectedConversationId) {
      setConversationId(null)
      setMessages([])
      setDraft('')
      setSendError(null)
      setStreamingAnswer(null)
      setSelectedContext(freeContext)
      return
    }

    let alive = true
    void Promise.all([desktopApi.messages.list(selectedConversationId), desktopApi.conversations.list()]).then(
      ([rows, conversations]) => {
        if (!alive) return
        setConversationId(selectedConversationId)
        setMessages(rows)
        setDraft('')
        setSendError(null)
        setStreamingAnswer(null)
        setSelectedContext(conversations.find((conversation) => conversation.id === selectedConversationId)?.context ?? freeContext)
      }
    )
    return () => {
      alive = false
    }
  }, [selectedConversationId])

  function scrollToLatest(behavior: ScrollBehavior = 'smooth'): void {
    const container = messageListRef.current
    if (!container) return
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top: container.scrollHeight, behavior })
    } else {
      container.scrollTop = container.scrollHeight
    }
    setFollowLatest(true)
    setShowJumpToLatest(false)
  }

  function handleMessageListScroll(): void {
    const container = messageListRef.current
    if (!container) return
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 96
    setFollowLatest(nearBottom)
    if (nearBottom) setShowJumpToLatest(false)
  }

  useEffect(() => {
    if (!messages.length && !streamingAnswer?.content) return
    if (followLatest) {
      scrollToLatest('smooth')
    } else {
      setShowJumpToLatest(true)
    }
  }, [messages.length, streamingAnswer?.content])

  async function copyAnswer(message: Message): Promise<void> {
    if (!navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(message.content)
    setCopiedMessageId(message.id)
    onNotify?.('回答已复制', 'success')
  }

  async function exportConversation(): Promise<void> {
    if (!conversationId || !desktopApi.conversations.exportMarkdown) return
    try {
      const result = await desktopApi.conversations.exportMarkdown(conversationId)
      if (!result.canceled) onNotify?.('对话已导出', 'success')
    } catch {
      onNotify?.('导出失败，请重试', 'error')
    }
  }

  async function send(): Promise<void> {
    const content = draft.trim()
    if (!content || sending) return

    setSending(true)
    setSendProgress({ step: conversationId ? 'context' : 'prepare', startedAt: Date.now() })
    setSendError(null)
    setDraft('')
    let id = conversationId
    let createdConversation: Conversation | null = null
    let optimisticMessageId: string | null = null
    const progressRequestId = desktopApi.conversations.onSendProgress ? createProgressRequestId() : null
    setActiveProgressRequestId(progressRequestId)
    const unsubscribeProgress = progressRequestId
      ? desktopApi.conversations.onSendProgress?.((event) => {
          if (event.requestId !== progressRequestId) return
          if (event.phase === 'delta') {
            setStreamingAnswer((current) => ({
              requestId: progressRequestId,
              content: event.replaceAnswer ? event.delta ?? '' : current?.requestId === progressRequestId ? `${current.content}${event.delta ?? ''}` : event.delta ?? ''
            }))
          }
          setSendProgress((current) => ({
            step: event.phase === 'done' ? 'save' : 'dify',
            startedAt: current?.startedAt ?? Date.now(),
            detail: event.label
          }))
        })
      : undefined
    try {
      if (!id) {
        setSendProgress((current) => ({ step: 'prepare', startedAt: current?.startedAt ?? Date.now() }))
        const conversation = await desktopApi.conversations.create({
          title: content.slice(0, 24),
          folderId: null,
          conversationFolderId: selectedConversationFolderId,
          context: selectedContext
        })
        id = conversation.id
        setConversationId(id)
        createdConversation = conversation
      }

      setSendProgress((current) => ({ step: 'context', startedAt: current?.startedAt ?? Date.now() }))
      const userMessage: Message = {
        id: `local-${Date.now()}`,
        conversationId: id,
        role: 'user',
        content,
        citations: [],
        createdAt: new Date().toISOString()
      }
      optimisticMessageId = userMessage.id
      setMessages((current) => [...current, userMessage])

      setSendProgress((current) => ({ step: 'dify', startedAt: current?.startedAt ?? Date.now() }))
      const assistant = await desktopApi.conversations.sendMessage(
        id,
        content,
        progressRequestId ? { progressRequestId } : undefined
      )
      setSendProgress((current) => ({ step: 'save', startedAt: current?.startedAt ?? Date.now() }))
      setStreamingAnswer(null)
      setMessages((current) => [...current, assistant])
      if (createdConversation) onConversationCreated?.(createdConversation)
    } catch (error) {
      setStreamingAnswer(null)
      if (optimisticMessageId) {
        setMessages((current) => current.filter((message) => message.id !== optimisticMessageId))
      }
      setDraft(content)
      setSendError(userFacingSendError(error))
    } finally {
      unsubscribeProgress?.()
      setActiveProgressRequestId(null)
      setSending(false)
      setSendProgress(null)
    }
  }

  const composer = (
    <Composer
      draft={draft}
      sending={sending}
      error={sendError}
      selectedContext={selectedContext}
      contextOptions={contextOptions}
      onContextChange={handleContextChange}
      onDraftChange={(value) => {
        setDraft(value)
        if (sendError) setSendError(null)
      }}
      onSend={() => void send()}
      onCancel={() => {
        if (activeProgressRequestId) void desktopApi.conversations.cancelSend?.(activeProgressRequestId)
      }}
      onRetry={() => void send()}
    />
  )

  const hasTimeline = messages.length > 0 || sending

  return (
    <main className={hasTimeline ? 'chat-page has-messages' : 'chat-page'}>
      {hasTimeline ? (
        <>
        {conversationId ? (
          <button className="chat-export-button" type="button" aria-label="导出 Markdown 对话" title="导出 Markdown" onClick={() => void exportConversation()}>
            <Download size={15} aria-hidden="true" />
          </button>
        ) : null}
        <section ref={messageListRef} className="message-list" aria-label="对话消息" onScroll={handleMessageListScroll}>
          {messages.map((message) => (
            <article key={message.id} className={`message ${message.role}`}>
              {message.role === 'assistant' ? (
                <img className="message-avatar" src={researchNotionMark} alt="" aria-hidden="true" />
              ) : null}
              <div className={message.role === 'assistant' ? 'message-body' : ''}>
                <div className="markdown-content">
                  <AcademicMarkdown>{message.content}</AcademicMarkdown>
                </div>
                {message.role === 'assistant' ? (
                  <>
                    <CitationStatus messageId={message.id} citations={message.citations} onOpenCitation={onOpenCitation} />
                    <div className="message-actions">
                      <button
                        type="button"
                        aria-label={copiedMessageId === message.id ? '已复制' : '复制回答'}
                        onClick={() => void copyAnswer(message)}
                      >
                        {copiedMessageId === message.id ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </article>
          ))}
          {streamingAnswer?.content ? (
            <article className="message assistant streaming" aria-live="polite">
              <img className="message-avatar" src={researchNotionMark} alt="" aria-hidden="true" />
              <div className="message-body">
                <div className="markdown-content">
                  <AcademicMarkdown>{streamingAnswer.content}</AcademicMarkdown>
                </div>
              </div>
            </article>
          ) : null}
          {sending ? (
            <div className="timeline-progress">
              <AgentProgress progress={sendProgress} />
            </div>
          ) : null}
          <div className="message-list-end" aria-hidden="true" />
        </section>
        </>
      ) : (
        <section className="chat-hero">
          <div className="empty-avatar" aria-hidden="true">
            <img src={researchNotionMark} alt="" />
          </div>
          <h1>今天研究点什么？</h1>
          <Suggestions onSelect={setDraft} />
          {composer}
        </section>
      )}

      {hasTimeline ? (
        <section className="chat-dock">
          {contextSwitchNotice ? <div className="context-switch-notice">{contextSwitchNotice}</div> : null}
          {sending && activeProgressRequestId ? (
            <div className="dock-stop-row">
              <button
                type="button"
                className="stop-generate-pill"
                onClick={() => {
                  if (activeProgressRequestId) void desktopApi.conversations.cancelSend?.(activeProgressRequestId)
                }}
              >
                <Square size={12} aria-hidden="true" fill="currentColor" />
                停止生成
              </button>
            </div>
          ) : null}
          {composer}
        </section>
      ) : null}
      {showJumpToLatest ? (
        <button className="jump-to-latest" type="button" aria-label="跳到最新回答" onClick={() => scrollToLatest()}>
          <ArrowDown size={16} aria-hidden="true" />
        </button>
      ) : null}
    </main>
  )
}

type ComposerProps = {
  draft: string
  sending: boolean
  error: string | null
  selectedContext: ChatContext
  contextOptions: {
    folderOptions: ContextOption[]
    paperOptions: ContextOption[]
  }
  onContextChange: (context: ChatContext) => void
  onDraftChange: (value: string) => void
  onSend: () => void
  onCancel: () => void
  onRetry: () => void
}

function Composer({
  draft,
  sending,
  error,
  selectedContext,
  contextOptions,
  onContextChange,
  onDraftChange,
  onSend,
  onCancel,
  onRetry
}: ComposerProps): JSX.Element {
  const options = [...contextOptions.folderOptions, ...contextOptions.paperOptions]
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = 'auto'
    const height = Math.min(180, Math.max(72, textarea.scrollHeight))
    textarea.style.height = `${height}px`
    textarea.style.overflowY = textarea.scrollHeight > 180 ? 'auto' : 'hidden'
  }, [draft])

  return (
    <div className="composer" aria-label="研究问答输入区">
      <label className="composer-context">
        <LibraryBig size={14} aria-hidden="true" />
        <span>上下文</span>
        <select
          aria-label="问答上下文"
          value={contextValue(selectedContext)}
          onChange={(event) => {
            onContextChange(options.find((option) => option.value === event.target.value)?.context ?? freeContext)
          }}
        >
          <option value="free">不限定</option>
          {contextOptions.folderOptions.length ? (
            <optgroup label="论文库">
              {contextOptions.folderOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ) : null}
          {contextOptions.paperOptions.length ? (
            <optgroup label="论文">
              {contextOptions.paperOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </label>

      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey) return
          event.preventDefault()
          onSend()
        }}
        placeholder="询问论文、比较方法、提取创新点、解释术语..."
      />
      {error ? (
        <div className="composer-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={onRetry} disabled={sending || !draft.trim()}>
            <RotateCcw size={13} aria-hidden="true" />
            重新发送
          </button>
        </div>
      ) : null}
      <div className="quick-actions">
        <button type="button" onClick={() => onDraftChange(quickActionTemplates.summary)}>
          <BookOpen size={15} aria-hidden="true" />
          摘要
        </button>
        <button type="button" onClick={() => onDraftChange(quickActionTemplates.terms)}>
          <Quote size={15} aria-hidden="true" />
          术语解释
        </button>
        <button type="button" onClick={() => onDraftChange(quickActionTemplates.novelty)}>
          <Lightbulb size={15} aria-hidden="true" />
          创新点
        </button>
        <button type="button" onClick={() => onDraftChange(quickActionTemplates.compare)}>
          <GitCompare size={15} aria-hidden="true" />
          方法对比
        </button>
        <button type="button" onClick={() => onDraftChange(quickActionTemplates.outline)}>
          <ListChecks size={15} aria-hidden="true" />
          综述提纲
        </button>
        <button
          className="send-button"
          type="button"
          aria-label={sending ? '停止' : '发送'}
          disabled={!sending && !draft.trim()}
          onClick={sending ? onCancel : onSend}
        >
          {sending ? <Square size={15} aria-hidden="true" /> : <ArrowUp size={17} aria-hidden="true" />}
        </button>
      </div>
      <p className="composer-disclaimer">AI 可能出错。请核实重要信息。</p>
    </div>
  )
}

function AgentProgress({ progress }: { progress: SendProgress }): JSX.Element {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!progress) return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [progress])

  const activeIndex = Math.max(
    0,
    progressSteps.findIndex((item) => item.step === progress?.step)
  )
  const elapsedSeconds = progress ? Math.max(0, Math.floor((now - progress.startedAt) / 1000)) : 0
  const detail =
    progress?.detail ??
    (progress?.step === 'dify' && elapsedSeconds >= 8
      ? 'Dify 仍在等待模型和知识库返回'
      : progressSteps[activeIndex]?.label ?? '处理中')

  return (
    <div className="agent-progress" role="status" aria-live="polite">
      <div className="agent-progress-header">
        <span className="agent-progress-dot" />
        <strong>{detail}</strong>
        <em>{elapsedSeconds}s</em>
      </div>
      <div className="agent-progress-steps" aria-hidden="true">
        {progressSteps.map((item, index) => (
          <span key={item.step} className={index < activeIndex ? 'done' : index === activeIndex ? 'active' : ''}>
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}

type SuggestionsProps = {
  onSelect: (prompt: string) => void
}

const suggestions = [
  { title: '总结论文', desc: '梳理研究问题、方法、结论和局限性' },
  { title: '术语解释', desc: '用初学者能理解的中文说明关键术语' },
  { title: '方法对比', desc: '比较主要方法的适用场景、优势和局限' },
  { title: '发现创新点', desc: '提取当前上下文中的创新点与差异' }
]

function Suggestions({ onSelect }: SuggestionsProps): JSX.Element {
  return (
    <div className="suggestion-cards" aria-label="示例研究方向">
      {suggestions.map((card) => (
        <button
          key={card.title}
          type="button"
          className="suggestion-card"
          onClick={() => onSelect(card.desc)}
        >
          <span className="suggestion-card-title">{card.title}</span>
          <span className="suggestion-card-desc">{card.desc}</span>
        </button>
      ))}
    </div>
  )
}
