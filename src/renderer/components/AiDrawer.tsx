import { useEffect, useState, type Dispatch, type FormEvent, type JSX, type MouseEvent as ReactMouseEvent, type SetStateAction } from 'react'
import { ArrowUp, Check, Copy, Lightbulb, MessageSquare, Square, X } from 'lucide-react'
import { desktopApi } from '../api/desktopApi'
import { AcademicMarkdown } from './AcademicMarkdown'
import { CitationStatus } from './CitationStatus'
import { userFacingSendError } from '../utils/userFacingError'
import type { Citation, Message, Paper } from '../../shared/types'

type AiDrawerProps = {
  open: boolean
  paper: Paper | null
  emphasisContext: string | null
  session: AiDrawerSession
  setSession: Dispatch<SetStateAction<AiDrawerSession>>
  width: number
  onWidthChange: (width: number) => void
  onClearEmphasisContext: () => void
  onClose: () => void
  onOpenCitation?: (citation: Citation) => void
}

export type AiDrawerSession = {
  conversationId: string | null
  messages: Message[]
  draft: string
}

export function createEmptyAiDrawerSession(): AiDrawerSession {
  return { conversationId: null, messages: [], draft: '' }
}

const suggestions = ['解释当前论文的核心创新点', '把 Method 部分转成中文阅读笔记', '分析实验指标和局限性']
const drawerProgressSteps = ['准备论文上下文', '发送选中文本', 'Dify 检索与生成', '写入回答']

/** 抽屉快捷操作：有选中文字时用 selection 集，否则用 full-paper 集。点击预填到输入框。 */
const drawerQuickActions = {
  selection: [
    { label: '解释这段', prompt: '请解释下面这段内容的含义、背景和关键概念：' },
    { label: '翻译这段', prompt: '请把下面这段内容翻译成通顺的中文：' },
    { label: '总结这段', prompt: '请用 3-5 个要点总结下面这段内容：' }
  ],
  full: [
    { label: '总结全文', prompt: '请总结这篇论文的核心内容，按研究问题、方法、结论和局限性组织。' },
    { label: '解释术语', prompt: '请解释这篇论文中的关键术语，给出适合初学者理解的中文说明。' },
    { label: '找创新点', prompt: '请提取这篇论文可能的创新点，并说明它们与已有工作的差异。' }
  ]
}

function createProgressRequestId(): string {
  return `progress-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function AiDrawer({
  open,
  paper,
  emphasisContext,
  session,
  setSession,
  width,
  onWidthChange,
  onClearEmphasisContext,
  onClose,
  onOpenCitation
}: AiDrawerProps): JSX.Element | null {
  const [sending, setSending] = useState(false)
  const [progressIndex, setProgressIndex] = useState(0)
  const [progressStartedAt, setProgressStartedAt] = useState<number | null>(null)
  const [progressDetail, setProgressDetail] = useState<string | null>(null)
  const [toolCalls, setToolCalls] = useState<Array<{ name: string; label: string; status: 'running' | 'done' }>>([])
  const [error, setError] = useState<string | null>(null)
  const [streamingAnswer, setStreamingAnswer] = useState('')
  const [activeProgressRequestId, setActiveProgressRequestId] = useState<string | null>(null)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const { conversationId, messages, draft } = session

  useEffect(() => {
    setError(null)
  }, [paper?.id])

  function updateDraft(value: string): void {
    setSession((current) => ({ ...current, draft: value }))
  }

  function startResize(event: ReactMouseEvent<HTMLButtonElement>): void {
    if (event.button !== 0) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = width

    const onMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.max(320, Math.min(560, startWidth + startX - moveEvent.clientX))
      onWidthChange(nextWidth)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  async function sendDraft(): Promise<void> {
    if (!paper || sending) return

    const content = draft.trim()
    if (!content) return

    setSending(true)
    setProgressIndex(0)
    setProgressStartedAt(Date.now())
    setProgressDetail(null)
    setError(null)
    setStreamingAnswer('')
    updateDraft('')
    setToolCalls([])
    let optimisticMessageId: string | null = null
    const progressRequestId = desktopApi.conversations.onSendProgress ? createProgressRequestId() : null
    setActiveProgressRequestId(progressRequestId)
    const unsubscribeProgress = progressRequestId
      ? desktopApi.conversations.onSendProgress?.((event) => {
          if (event.requestId !== progressRequestId) return
          if (event.phase === 'delta') {
            setStreamingAnswer((current) => (event.replaceAnswer ? event.delta ?? '' : `${current}${event.delta ?? ''}`))
          }
          if (event.phase === 'tool' && event.toolName) {
            const toolLabel = event.label || event.toolName
            setToolCalls((current) => {
              const completed = current.map((call) => (call.status === 'running' ? { ...call, status: 'done' as const } : call))
              return [...completed, { name: event.toolName!, label: toolLabel, status: 'running' as const }]
            })
          } else if (event.phase === 'answer' || event.phase === 'done') {
            setToolCalls((current) => current.map((call) => (call.status === 'running' ? { ...call, status: 'done' as const } : call)))
          }
          setProgressIndex(event.phase === 'done' ? 3 : 2)
          setProgressDetail(event.label)
        })
      : undefined

    try {
      let activeConversationId = conversationId
      if (!activeConversationId) {
        setProgressIndex(0)
        const conversation = await desktopApi.conversations.create({
          title: content.slice(0, 24),
          folderId: paper.folderId,
          context: { type: 'paper', paperId: paper.id, paperTitle: paper.title }
        })
        activeConversationId = conversation.id
        setSession((current) => ({ ...current, conversationId: activeConversationId }))
      }

      setProgressIndex(1)
      const userMessage: Message = {
        id: `local-${Date.now()}`,
        conversationId: activeConversationId,
        role: 'user',
        content,
        citations: [],
        createdAt: new Date().toISOString()
      }
      optimisticMessageId = userMessage.id
      setSession((current) => ({ ...current, messages: [...current.messages, userMessage] }))

      setProgressIndex(2)
      const sendOptions =
        emphasisContext || progressRequestId
          ? {
              ...(emphasisContext ? { emphasisContext } : {}),
              ...(progressRequestId ? { progressRequestId } : {})
            }
          : undefined
      const assistant = await desktopApi.conversations.sendMessage(
        activeConversationId,
        content,
        sendOptions
      )
      setProgressIndex(3)
      setStreamingAnswer('')
      setSession((current) => ({ ...current, messages: [...current.messages, assistant] }))
    } catch (sendError) {
      setStreamingAnswer('')
      setSession((current) => ({
        ...current,
        draft: content,
        messages: optimisticMessageId
          ? current.messages.filter((message) => message.id !== optimisticMessageId)
          : current.messages
      }))
      setError(userFacingSendError(sendError))
    } finally {
      unsubscribeProgress?.()
      setActiveProgressRequestId(null)
      setSending(false)
      setProgressStartedAt(null)
      setProgressDetail(null)
    }
  }

  async function send(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    await sendDraft()
  }

  async function copyAnswer(message: Message): Promise<void> {
    if (!navigator.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(message.content)
      setCopiedMessageId(message.id)
    } catch {
      // Clipboard access can be denied by the operating system; keep the answer available to select manually.
    }
  }

  if (!open) return null

  return (
    <aside className="ai-drawer" aria-label="论文 AI 问答栏" style={{ width: `${width}px` }}>
      <button
        className="ai-drawer-resize-handle"
        type="button"
        aria-label="调整 AI 问答栏宽度"
        title="调整宽度"
        onMouseDown={startResize}
      />
      <header className="ai-drawer-header">
        <MessageSquare size={17} aria-hidden="true" />
        <button type="button" aria-label="关闭 AI 问答栏" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      {emphasisContext ? (
        <section className="emphasis-context" aria-label="选中文本">
          <button type="button" aria-label="移除选中文本" title="移除选中文本" onClick={onClearEmphasisContext}>
            <X size={14} aria-hidden="true" />
          </button>
          <p>{emphasisContext}</p>
        </section>
      ) : null}

      {!messages.length && !streamingAnswer && !sending ? (
        <div className="ai-suggestions">
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => updateDraft(suggestion)}>
              <Lightbulb size={15} aria-hidden="true" />
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      {messages.length ? (
        <section className="ai-thread" aria-label="论文问答消息">
          {messages.map((message) => (
            <article key={message.id} className={`ai-message ${message.role}`}>
              <div className="markdown-content">
                <AcademicMarkdown>{message.content}</AcademicMarkdown>
              </div>
              {message.role === 'assistant' ? (
                <>
                  <CitationStatus messageId={message.id} citations={message.citations} onOpenCitation={onOpenCitation} />
                  <div className="ai-message-actions">
                    <button
                      type="button"
                      aria-label={copiedMessageId === message.id ? '已复制' : '复制回答'}
                      title={copiedMessageId === message.id ? '已复制' : '复制回答'}
                      onClick={() => void copyAnswer(message)}
                    >
                      {copiedMessageId === message.id ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                    </button>
                  </div>
                </>
              ) : null}
            </article>
          ))}
          {streamingAnswer ? (
            <article className="ai-message assistant streaming" aria-live="polite">
              <div className="markdown-content">
                <AcademicMarkdown>{streamingAnswer}</AcademicMarkdown>
              </div>
            </article>
          ) : null}
        </section>
      ) : streamingAnswer ? (
        <section className="ai-thread" aria-label="论文问答消息">
          <article className="ai-message assistant streaming" aria-live="polite">
            <div className="markdown-content">
              <AcademicMarkdown>{streamingAnswer}</AcademicMarkdown>
            </div>
          </article>
        </section>
      ) : null}

      {error ? (
        <p className="drawer-error" role="alert">
          {error}
        </p>
      ) : null}
      {sending ? <DrawerProgress activeIndex={progressIndex} startedAt={progressStartedAt} detail={progressDetail} toolCalls={toolCalls} /> : null}

      <div className="drawer-quick-actions" aria-label="快捷操作">
        {(emphasisContext ? drawerQuickActions.selection : drawerQuickActions.full).map((action) => (
          <button
            key={action.label}
            type="button"
            className="drawer-chip"
            onClick={() => {
              updateDraft(action.prompt)
              if (error) setError(null)
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
      <form className="drawer-composer" onSubmit={(event) => void send(event)}>
        <MessageSquare size={16} aria-hidden="true" />
        <textarea
          aria-label="论文提问输入"
          value={draft}
          onChange={(event) => {
            updateDraft(event.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return
            event.preventDefault()
            void sendDraft()
          }}
          placeholder="输入问题..."
        />
        <button
          type="button"
          aria-label={sending ? '停止生成' : '发送问题'}
          disabled={!sending && (!draft.trim() || !paper)}
          onClick={() => {
            if (sending) {
              if (activeProgressRequestId) void desktopApi.conversations.cancelSend?.(activeProgressRequestId)
            } else {
              void sendDraft()
            }
          }}
        >
          {sending ? <Square size={14} aria-hidden="true" /> : <ArrowUp size={16} aria-hidden="true" />}
        </button>
      </form>
    </aside>
  )
}

function DrawerProgress({
  activeIndex,
  startedAt,
  detail: liveDetail,
  toolCalls
}: {
  activeIndex: number
  startedAt: number | null
  detail: string | null
  toolCalls: Array<{ name: string; label: string; status: 'running' | 'done' }>
}): JSX.Element {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!startedAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [startedAt])

  const elapsedSeconds = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0
  const detail =
    liveDetail ??
    (activeIndex === 2 && elapsedSeconds >= 8
      ? 'Dify 仍在等待模型和知识库返回'
      : drawerProgressSteps[activeIndex] ?? '处理中')

  return (
    <div className="drawer-progress" role="status" aria-live="polite">
      <div className="agent-progress-header">
        <span className="agent-progress-dot" />
        <strong>{detail}</strong>
        <em>{elapsedSeconds}s</em>
      </div>
      <div className="agent-progress-steps" aria-hidden="true">
        {drawerProgressSteps.map((step, index) => {
          const isActive = index === activeIndex
          const isDifyCell = index === 2
          const runningTool = toolCalls.find((call) => call.status === 'running')
          const cellLabel =
            isDifyCell && isActive && runningTool
              ? `${runningTool.label}…`
              : isDifyCell && toolCalls.length
                ? `Dify · ${toolCalls.length} 工具`
                : step
          return (
            <span
              key={step}
              className={index < activeIndex ? 'done' : isActive ? (isDifyCell && runningTool ? 'active running' : 'active') : ''}
            >
              {cellLabel}
            </span>
          )
        })}
      </div>
      {toolCalls.length ? (
        <div className="agent-progress-tools" aria-label="工具调用轨迹">
          {toolCalls.map((call, index) => (
            <span key={`${call.name}-${index}`} className={`tool-call-chip ${call.status}`}>
              {call.status === 'done' ? <Check size={11} aria-hidden="true" /> : null}
              {call.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}
