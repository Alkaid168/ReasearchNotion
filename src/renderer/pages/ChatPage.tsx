import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { ArrowDown, ArrowUp, BookOpen, BrainCircuit, Check, ChevronDown, ChevronUp, Copy, Download, ExternalLink, GitCompare, LibraryBig, Lightbulb, ListChecks, Quote, RotateCcw, Square, X } from 'lucide-react'
import { desktopApi } from '../api/desktopApi'
import researchNotionMark from '../assets/research-notion-mark.svg'
import { AcademicMarkdown } from '../components/AcademicMarkdown'
import { CitationStatus } from '../components/CitationStatus'
import { PaperReader } from '../components/PaperReader'
import { userFacingSendError } from '../utils/userFacingError'
import { buildResearchProcess, researchPhaseForProgress } from '../../shared/researchProcess'
import type { ConversationProgressEvent } from '../../shared/ipcTypes'
import type { ChatContext, Citation, Conversation, Folder, Message, Paper, ResearchProcess, ResearchProcessPhase } from '../../shared/types'

type ChatPageProps = {
  selectedConversationId?: string | null
  selectedConversationFolderId?: string | null
  onConversationCreated?: (conversation: Conversation) => void
  onStartNewConversation?: () => void
  onNotify?: (message: string, tone?: 'success' | 'error') => void
  onOpenCitation?: (citation: Citation) => void
}

type ContextOption = {
  value: string
  label: string
  context: ChatContext
}

type SendProgressStep = ResearchProcessPhase

type SendProgress = {
  step: SendProgressStep
  startedAt: number
  detail?: string
} | null

type StreamingAnswer = {
  requestId: string
  content: string
} | null

type LiveThinking = {
  requestId: string
  startedAt: number
  question: string
  context: ChatContext
  thoughts: string[]
  events: ConversationProgressEvent[]
} | null

type CitationPaperSource = Awaited<ReturnType<typeof desktopApi.papers.read>>

type CitationPanelState = {
  citation: Citation
  source: CitationPaperSource | null
  loading: boolean
  error: string | null
  nonce: number
} | null

const progressSteps: Array<{ step: SendProgressStep; label: string }> = [
  { step: 'scope', label: '确认论文范围' },
  { step: 'search', label: '检索论文' },
  { step: 'read', label: '读取原文与页码' },
  { step: 'answer', label: '生成回答' },
  { step: 'verify', label: '核对引用' }
]

function progressStepForEvent(event: ConversationProgressEvent): SendProgressStep {
  return researchPhaseForProgress(event)
}

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

function contextLabel(context: ChatContext): string {
  if (context.type === 'folder') return context.folderName || '论文库'
  if (context.type === 'paper') return context.paperTitle || '论文'
  return '不限资料'
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
  onStartNewConversation,
  onNotify,
  onOpenCitation
}: ChatPageProps): JSX.Element {
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendProgress, setSendProgress] = useState<SendProgress>(null)
  const [liveResearchEvents, setLiveResearchEvents] = useState<ConversationProgressEvent[]>([])
  const [streamingAnswer, setStreamingAnswer] = useState<StreamingAnswer>(null)
  const [liveThinking, setLiveThinking] = useState<LiveThinking>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [selectedContext, setSelectedContext] = useState<ChatContext>(freeContext)
  const [availableFolders, setAvailableFolders] = useState<Folder[]>([])
  const [availablePapers, setAvailablePapers] = useState<Paper[]>([])
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [expandedProcessIds, setExpandedProcessIds] = useState<Set<string>>(() => new Set())
  const [citationPanel, setCitationPanel] = useState<CitationPanelState>(null)
  const [activeProgressRequestId, setActiveProgressRequestId] = useState<string | null>(null)
  const [followLatest, setFollowLatest] = useState(true)
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const messageListRef = useRef<HTMLElement | null>(null)
  const citationRequestRef = useRef(0)

  const contextOptions = useMemo(() => {
    const folderOptions = availableFolders.map((folder) => ({
      value: contextValue(folderContext(folder)),
      label: folder.name,
      context: folderContext(folder)
    }))
    const folderNames = new Map(availableFolders.map((folder) => [folder.id, folder.name]))
    const paperOptions = availablePapers.map((paper) => ({
      value: contextValue(paperContext(paper)),
      label: `${folderNames.get(paper.folderId) ?? '知识库'} / ${paper.title}`,
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
      setLiveThinking(null)
      setLiveResearchEvents([])
      setExpandedProcessIds(new Set())
      setCitationPanel(null)
      setSelectedContext(freeContext)
      return
    }
    if (selectedConversationId === conversationId) return

    let alive = true
    void Promise.all([desktopApi.messages.list(selectedConversationId), desktopApi.conversations.list()]).then(
      ([rows, conversations]) => {
        if (!alive) return
        setConversationId(selectedConversationId)
        setMessages(rows)
        setDraft('')
        setSendError(null)
        setStreamingAnswer(null)
        setLiveThinking(null)
        setLiveResearchEvents([])
        const latestThinkingMessage = [...rows]
          .reverse()
          .find((message) => message.role === 'assistant' && message.researchProcess)
        setExpandedProcessIds(latestThinkingMessage ? new Set([latestThinkingMessage.id]) : new Set())
        setCitationPanel(null)
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
  }, [messages.length, streamingAnswer?.content, liveThinking?.thoughts.length, liveThinking?.events.length])

  async function copyAnswer(message: Message): Promise<void> {
    if (!navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(message.content)
    setCopiedMessageId(message.id)
    onNotify?.('回答已复制', 'success')
  }

  async function openCitationPanel(citation: Citation): Promise<void> {
    if (!citation.paperId) {
      onOpenCitation?.(citation)
      return
    }

    const requestId = citationRequestRef.current + 1
    citationRequestRef.current = requestId
    setCitationPanel({ citation, source: null, loading: true, error: null, nonce: requestId })

    try {
      const source = await desktopApi.papers.read(citation.paperId)
      if (citationRequestRef.current !== requestId) return
      setCitationPanel({ citation, source, loading: false, error: null, nonce: requestId })
    } catch (error) {
      if (citationRequestRef.current !== requestId) return
      setCitationPanel({
        citation,
        source: null,
        loading: false,
        error: error instanceof Error ? error.message : '无法读取论文原文',
        nonce: requestId
      })
    }
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

  async function send(regenerate?: { messageId: string; content: string }): Promise<void> {
    const content = (regenerate?.content ?? draft).trim()
    if (!content || sending) return

    const processStartedAt = Date.now()
    const observedProgressEvents: ConversationProgressEvent[] = []
    setSending(true)
    setSendProgress({ step: 'scope', startedAt: processStartedAt })
    setLiveResearchEvents([])
    setLiveThinking(null)
    setSendError(null)
    if (!regenerate) setDraft('')
    let id = conversationId
    let createdConversation: Conversation | null = null
    let optimisticMessageId: string | null = null
    const progressRequestId = desktopApi.conversations.onSendProgress ? createProgressRequestId() : null
    setActiveProgressRequestId(progressRequestId)
    if (progressRequestId) {
      setLiveThinking({
        requestId: progressRequestId,
        startedAt: processStartedAt,
        question: content,
        context: selectedContext,
        thoughts: [],
        events: []
      })
    }
    const unsubscribeProgress = progressRequestId
      ? desktopApi.conversations.onSendProgress?.((event) => {
          if (event.requestId !== progressRequestId) return
          observedProgressEvents.push(event)
          if (event.phase !== 'delta') setLiveResearchEvents((current) => [...current, event])
          if (event.phase === 'thought' || event.phase === 'tool') {
            setLiveThinking((current) => {
              if (!current || current.requestId !== progressRequestId) return current
              const thoughts = event.phase === 'thought' && event.thought?.trim()
                ? current.thoughts.includes(event.thought.trim())
                  ? current.thoughts
                  : [...current.thoughts, event.thought.trim()]
                : current.thoughts
              return { ...current, thoughts, events: [...current.events, event] }
            })
          }
          if (event.phase === 'delta') {
            setStreamingAnswer((current) => ({
              requestId: progressRequestId,
              content: event.replaceAnswer ? event.delta ?? '' : current?.requestId === progressRequestId ? `${current.content}${event.delta ?? ''}` : event.delta ?? ''
            }))
          }
          setSendProgress((current) => ({
            step: progressStepForEvent(event),
            startedAt: current?.startedAt ?? Date.now(),
            detail: event.label
          }))
        })
      : undefined
    try {
      if (!id) {
        setSendProgress((current) => ({ step: 'scope', startedAt: current?.startedAt ?? processStartedAt }))
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

      setSendProgress((current) => ({ step: 'scope', startedAt: current?.startedAt ?? processStartedAt }))
      if (!regenerate) {
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
      }

      setSendProgress((current) => ({ step: 'search', startedAt: current?.startedAt ?? processStartedAt }))
      const sendOptions = {
        ...(progressRequestId ? { progressRequestId } : {}),
        ...(regenerate ? { regenerateMessageId: regenerate.messageId } : {})
      }
      const assistant = await desktopApi.conversations.sendMessage(
        id,
        content,
        Object.keys(sendOptions).length ? sendOptions : undefined
      )
      setSendProgress((current) => ({ step: 'verify', startedAt: current?.startedAt ?? processStartedAt }))
      setStreamingAnswer(null)
      const assistantWithProcess: Message = assistant.researchProcess
        ? assistant
        : {
            ...assistant,
            researchProcess: buildResearchProcess({
              context: selectedContext,
              events: observedProgressEvents,
              citations: assistant.citations,
              durationMs: Date.now() - processStartedAt,
              question: content,
              answer: assistant.content
            })
          }
      setMessages((current) => regenerate
        ? current.map((message) => (message.id === regenerate.messageId ? assistantWithProcess : message))
        : [...current, assistantWithProcess]
      )
      if (assistantWithProcess.researchProcess) {
        setExpandedProcessIds((current) => new Set(current).add(assistantWithProcess.id))
      }
      if (createdConversation) onConversationCreated?.(createdConversation)
    } catch (error) {
      setStreamingAnswer(null)
      if (optimisticMessageId) {
        setMessages((current) => current.filter((message) => message.id !== optimisticMessageId))
      }
      if (!regenerate) setDraft(content)
      setSendError(userFacingSendError(error))
    } finally {
      unsubscribeProgress?.()
      setActiveProgressRequestId(null)
      setSending(false)
      setSendProgress(null)
      setLiveResearchEvents([])
      setLiveThinking(null)
    }
  }

  function regenerateAnswer(message: Message): void {
    if (sending || message.role !== 'assistant') return
    const messageIndex = messages.findIndex((candidate) => candidate.id === message.id)
    const previousUserMessage = messages
      .slice(0, messageIndex)
      .reverse()
      .find((candidate) => candidate.role === 'user')
    if (!previousUserMessage) {
      setSendError('找不到这条回答对应的问题，无法重新生成。')
      return
    }
    void send({ messageId: message.id, content: previousUserMessage.content })
  }

  const composer = (
    <Composer
      draft={draft}
      sending={sending}
      error={sendError}
      selectedContext={selectedContext}
      contextOptions={contextOptions}
      disabledContext={Boolean(conversationId)}
      onStartNewConversation={onStartNewConversation}
      onContextChange={setSelectedContext}
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
    <main className={`${hasTimeline ? 'chat-page has-messages' : 'chat-page'}${citationPanel ? ' citation-panel-open' : ''}`}>
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
                <>
                  {message.researchProcess ? (
                    <AnswerProcessDisclosure
                      record={message.researchProcess}
                      expanded={expandedProcessIds.has(message.id)}
                      onToggle={() => {
                        setExpandedProcessIds((current) => {
                          const next = new Set(current)
                          if (next.has(message.id)) next.delete(message.id)
                          else next.add(message.id)
                          return next
                        })
                      }}
                    />
                  ) : null}
                  <div className="markdown-content">
                    <AcademicMarkdown>{message.content}</AcademicMarkdown>
                  </div>
                  <CitationStatus
                    messageId={message.id}
                    citations={message.citations}
                    onOpenCitation={(citation) => void openCitationPanel(citation)}
                  />
                  <div className="message-actions">
                    {message.id === [...messages].reverse().find((candidate) => candidate.role === 'assistant')?.id ? (
                      <button
                        type="button"
                        aria-label="重新生成回答"
                        title="重新生成"
                        disabled={sending}
                        onClick={() => regenerateAnswer(message)}
                      >
                        <RotateCcw size={14} aria-hidden="true" />
                      </button>
                    ) : null}
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
              {message.role !== 'assistant' ? (
                <div className="markdown-content">
                  <AcademicMarkdown>{message.content}</AcademicMarkdown>
                </div>
              ) : null}
            </article>
          ))}
          {sending && liveThinking ? (
            <LiveThinkingDisclosure state={liveThinking} />
          ) : null}
          {streamingAnswer?.content ? (
            <article className="message assistant streaming" aria-live="polite">
              <div className="markdown-content">
                <AcademicMarkdown>{streamingAnswer.content}</AcademicMarkdown>
              </div>
            </article>
          ) : null}
          {sending && !liveThinking ? (
            <div className="timeline-progress">
              <AgentProgress progress={sendProgress} events={liveResearchEvents} />
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
          {composer}
        </section>
      )}

      {hasTimeline ? <section className="chat-dock">{composer}</section> : null}
      {showJumpToLatest ? (
        <button className="jump-to-latest" type="button" aria-label="跳到最新回答" onClick={() => scrollToLatest()}>
          <ArrowDown size={16} aria-hidden="true" />
        </button>
      ) : null}
      {citationPanel ? (
        <CitationSourcePanel
          state={citationPanel}
          onClose={() => {
            citationRequestRef.current += 1
            setCitationPanel(null)
          }}
          onOpenFull={onOpenCitation ? () => onOpenCitation(citationPanel.citation) : undefined}
        />
      ) : null}
    </main>
  )
}

function AnswerProcessDisclosure({
  record,
  expanded,
  onToggle
}: {
  record: ResearchProcess
  expanded: boolean
  onToggle: () => void
}): JSX.Element {
  const elapsedSeconds = Math.max(1, Math.round(record.durationMs / 1000))
  const thoughts = record.thoughts?.filter((thought) => thought.trim()) ?? []

  return (
    <section className="thinking-disclosure" aria-label="思考过程">
      <button type="button" aria-expanded={expanded} onClick={onToggle}>
        <BrainCircuit size={19} aria-hidden="true" />
        <strong>已思考（用时 {elapsedSeconds} 秒）</strong>
        {expanded ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
      </button>
      {expanded ? (
        <ThinkingContent paragraphs={thoughts} />
      ) : null}
    </section>
  )
}

function LiveThinkingDisclosure({ state }: { state: NonNullable<LiveThinking> }): JSX.Element {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [])

  const elapsedSeconds = Math.max(0, Math.floor((now - state.startedAt) / 1000))
  const activityLabels = state.events
    .filter((event) => event.phase === 'tool')
    .filter((event, index, events) => events.findIndex((candidate) => (candidate.toolName || candidate.label) === (event.toolName || event.label)) === index)
    .map((event) => event.label)
  const contextParagraph = state.context.type === 'paper'
    ? `我注意到上下文锁定了《${state.context.paperTitle}》。那么只要说到这篇论文的具体结论，就得回原文里对一遍，不能用我已经知道的一般知识顶上。`
    : state.context.type === 'folder'
      ? `这次可以查的是论文库“${state.context.folderName}”。我先看哪几篇真的正面谈到了这个问题，免得抓到一篇看起来相关的就急着下结论。`
      : '这个问题没有锁定单篇论文。我先分辨它要的是概念解释，还是某个需要回原文核对的事实；这一步会直接决定后面要不要查文献。'
  const liveParagraphs = [
    `我先重新看一遍这个问题：“${state.question.length > 90 ? `${state.question.slice(0, 90)}…` : state.question}”。先别急着生成答案，得看清它表面在问什么，真正需要解决的又是什么。`,
    contextParagraph,
    ...state.thoughts,
    activityLabels.length
      ? `我已经开始往原文里追了，目前走到：${activityLabels.join('、')}。接下来还要看这些内容是真正回答了问题，还是只是关键词看着很像。`
      : '我还在理这个问题的关键点。如果它牵涉具体论文事实，我会停下来读原文；如果本质上是概念问题，就不为了显得“查过”而堆检索步骤。'
  ]

  return (
    <section className="thinking-disclosure live" role="status" aria-label="正在思考" aria-live="polite">
      <div className="thinking-live-header">
        <BrainCircuit size={19} aria-hidden="true" />
        <strong>正在思考（用时 {elapsedSeconds} 秒）</strong>
        <span className="thinking-pulse" aria-hidden="true" />
      </div>
      <ThinkingContent paragraphs={liveParagraphs} live />
    </section>
  )
}

function ThinkingContent({
  paragraphs,
  live = false
}: {
  paragraphs: string[]
  live?: boolean
}): JSX.Element {
  return (
    <div className="thinking-content">
      {paragraphs.length ? (
        <div className="thinking-summaries">
          {paragraphs.map((paragraph, index) => (
            <div key={`${paragraph.slice(0, 40)}-${index}`} className="markdown-content">
              <AcademicMarkdown>{paragraph}</AcademicMarkdown>
            </div>
          ))}
        </div>
      ) : (
        <p className="thinking-placeholder">正在理解问题并规划可核对的研究路径…</p>
      )}
      {!live ? <small>这是可展开的研究过程记录：包括我怎样理解问题、查了什么、哪些证据能用；不是模型隐藏推理的逐字记录。</small> : null}
    </div>
  )
}

function CitationSourcePanel({
  state,
  onClose,
  onOpenFull
}: {
  state: NonNullable<CitationPanelState>
  onClose: () => void
  onOpenFull?: () => void
}): JSX.Element {
  const { citation, source, loading, error, nonce } = state
  const pageNumber = citation.pageNumber ? Math.max(1, citation.pageNumber) : 1

  return (
    <aside className="citation-source-panel" aria-label="论文原文侧边栏">
      <header className="citation-source-header">
        <div>
          <small>回答引用原文</small>
          <strong>{citation.paperTitle}</strong>
          <span>{citation.pageNumber ? `第 ${citation.pageNumber} 页` : citation.section || '原文位置'}</span>
        </div>
        <div className="citation-source-actions">
          {onOpenFull ? (
            <button type="button" aria-label="在知识库完整打开" title="在知识库完整打开" onClick={onOpenFull}>
              <ExternalLink size={15} aria-hidden="true" />
            </button>
          ) : null}
          <button type="button" aria-label="关闭论文原文侧边栏" title="关闭" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      {citation.snippet ? (
        <blockquote className="citation-source-snippet">
          <small>回答所依据的原文片段</small>
          <p>{citation.snippet}</p>
        </blockquote>
      ) : null}

      <div className="citation-source-reader">
        {loading ? <p className="citation-source-state">正在打开论文原文...</p> : null}
        {!loading && error ? <p className="citation-source-state error">{error}</p> : null}
        {!loading && !error && source ? (
          <PaperReader
            key={`${source.paper.id}-${pageNumber}-${nonce}`}
            paper={source.paper}
            markdownText={source.markdownText}
            plainText={source.plainText}
            previewUrl={source.previewUrl}
            pdfData={source.pdfData}
            initialPage={pageNumber}
          />
        ) : null}
      </div>
    </aside>
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
  disabledContext: boolean
  onStartNewConversation?: () => void
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
  disabledContext,
  onStartNewConversation,
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
        <span>从知识库选择论文</span>
        {disabledContext ? (
          <>
            <input aria-label="当前论文范围" value={contextLabel(selectedContext)} readOnly />
            <button
              className="context-change-button"
              type="button"
              onClick={onStartNewConversation}
              disabled={!onStartNewConversation}
            >
              新建对话并更换
            </button>
          </>
        ) : (
          <select
            aria-label="从知识库选择论文"
            value={contextValue(selectedContext)}
            onChange={(event) => {
              onContextChange(options.find((option) => option.value === event.target.value)?.context ?? freeContext)
            }}
          >
            <option value="free">暂不选择（可搜索全部论文）</option>
            {contextOptions.folderOptions.length ? (
              <optgroup label="选择整个论文库">
                {contextOptions.folderOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {contextOptions.paperOptions.length ? (
              <optgroup label="选择单篇论文（严格限定）">
                {contextOptions.paperOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        )}
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
          aria-label={sending ? '停止生成' : '发送'}
          disabled={!sending && !draft.trim()}
          onClick={sending ? onCancel : onSend}
        >
          {sending ? <Square size={15} aria-hidden="true" /> : <ArrowUp size={17} aria-hidden="true" />}
        </button>
      </div>
    </div>
  )
}

function AgentProgress({ progress, events }: { progress: SendProgress; events: ConversationProgressEvent[] }): JSX.Element {
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
    (progress?.step === 'answer' && elapsedSeconds >= 8
      ? 'Dify 仍在等待模型和知识库返回'
      : progressSteps[activeIndex]?.label ?? '处理中')
  const toolActivities = Array.from(
    events
      .filter((event) => event.phase === 'tool')
      .reduce((activities, event) => {
        const key = event.toolName || event.label
        const existing = activities.get(key)
        if (existing) existing.count += 1
        else activities.set(key, { label: event.label, count: 1 })
        return activities
      }, new Map<string, { label: string; count: number }>())
      .values()
  ).slice(-4)

  return (
    <div className="agent-progress" role="status" aria-live="polite">
      <div className="agent-progress-header">
        <BrainCircuit size={15} aria-hidden="true" />
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
      <div className="live-research-trace">
        {toolActivities.length ? (
          toolActivities.map((activity) => (
            <span key={activity.label}>
              <i aria-hidden="true" />
              {activity.label}
              {activity.count > 1 ? <small>×{activity.count}</small> : null}
            </span>
          ))
        ) : (
          <span>
            <i className="planning" aria-hidden="true" />
            正在规划可核对的研究路径
          </span>
        )}
      </div>
    </div>
  )
}
