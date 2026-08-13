import type { ChatContext, Citation, ResearchProcess, ResearchProcessPhase, ResearchProcessStep } from './types'

export type ResearchProgressEvent = {
  phase: 'thought' | 'tool' | 'answer' | 'delta' | 'done'
  label: string
  toolName?: string
  thought?: string
}

const toolPhases: Record<string, ResearchProcessPhase> = {
  get_current_context: 'scope',
  list_library_papers: 'search',
  search_current_paper: 'search',
  search_library: 'search',
  search_arxiv: 'search',
  search_semantic_scholar: 'search',
  search_openalex: 'search',
  get_paper_metadata: 'read',
  get_current_page_text: 'read',
  get_paper_page_text: 'read',
  get_paper_section: 'read',
  get_paper_outline: 'read',
  get_paper_text_chunk: 'read',
  investigate_paper: 'read',
  investigate_library: 'read',
  save_memory: 'verify'
}

export function researchPhaseForProgress(event: ResearchProgressEvent): ResearchProcessPhase {
  if (event.phase === 'done') return 'verify'
  if (event.phase === 'answer' || event.phase === 'delta') return 'answer'
  if (event.phase === 'thought') return 'scope'
  return event.toolName ? toolPhases[event.toolName] ?? 'search' : 'search'
}

function comparableText(value: string): string {
  return value.replace(/\s+/g, '').replace(/[\p{P}\p{S}]/gu, '').toLocaleLowerCase()
}

function visibleThoughts(events: ResearchProgressEvent[], answer: string | undefined): string[] {
  const answerText = answer ? comparableText(answer) : ''
  const seen = new Set<string>()

  return events
    .filter((event) => event.phase === 'thought' && event.thought?.trim())
    .map((event) => event.thought!.trim())
    .filter((thought) => {
      const comparable = comparableText(thought)
      if (!comparable || seen.has(comparable)) return false
      seen.add(comparable)
      if (!answerText) return true
      return comparable !== answerText && !answerText.includes(comparable) && !comparable.includes(answerText)
    })
}

function contextNarrative(context: ChatContext): string {
  if (context.type === 'paper') {
    return `这次的上下文是《${context.paperTitle}》。这一点得时刻记着：我可以用常识帮着解释，但只要说“这篇论文认为”，就必须能在它自己的原文里找到依据。`
  }
  if (context.type === 'folder') {
    return `可用的范围是论文库“${context.folderName}”。我不想一上来就抓住某一篇论文，那样很可能把局部观点当成整个资料库的共识。先看看谁真正在回答这个问题，再逐篇核对会更稳妥。`
  }
  return '这个问题没有锁定某一篇论文。这反而让我多停了一下：如果它只是在问一个概念，直接讲清楚就好；如果暗含了某篇论文的事实，那就不能用通用知识顶替原文。'
}

function naturalToolAction(event: ResearchProgressEvent): string {
  const descriptions: Record<string, string> = {
    get_current_context: '确认当前选中的论文和页面',
    list_library_papers: '先看看库里到底有哪些候选论文',
    search_current_paper: '换着与问题更接近的词在当前论文里找',
    search_library: '在论文库里缩小可能相关的范围',
    search_arxiv: '去 arXiv 核对可能相关的资料',
    search_semantic_scholar: '去 Semantic Scholar 查找相关文献',
    search_openalex: '去 OpenAlex 补查相关文献',
    get_paper_metadata: '先把论文的基本信息对上',
    get_current_page_text: '读一遍当前页的原文',
    get_paper_page_text: '回到相关页看原文是怎么说的',
    get_paper_section: '把相关章节连起来读',
    get_paper_outline: '先顺着大纲找到问题可能落在哪里',
    get_paper_text_chunk: '继续往后读原文，免得只看到前面一小段',
    investigate_paper: '围绕这个问题把论文里的相关证据串起来',
    investigate_library: '逐篇看哪些论文真正能回答它'
  }
  return event.toolName ? descriptions[event.toolName] ?? event.label.trim() : event.label.trim()
}

function activityNarrative(events: ResearchProgressEvent[]): string {
  const toolEvents = events
    .filter((event) => event.phase === 'tool')
    .filter((event, index, list) => list.findIndex((candidate) => (candidate.toolName || candidate.label) === (event.toolName || event.label)) === index)

  if (!toolEvents.length) {
    return '我本来也可以去搜一圈资料，但这次看起来主要是在理清概念和逻辑，加上一堆不必要的检索反而会打断回答。所以我把重心放在解释本身，遇到具体论文事实时再停下来核对。'
  }

  const activities = toolEvents.map(naturalToolAction)
  const activityText = activities.map((activity, index) => {
    if (index === 0) return activity.startsWith('先') ? `我${activity}` : `我先${activity}`
    if (index === activities.length - 1) return `然后${activity}`
    return `接着${activity}`
  }).join('；')
  return `${activityText}。这几步不是为了让过程看起来复杂，而是在一步步排除“看着相关、其实没回答问题”的内容。`
}

function evidenceNarrative(citations: Citation[]): string {
  if (!citations.length) {
    return '查到这里，我手上还没有能够直接指到某一页、某一节的原文。这并不等于什么都不能说，但意味着接下来只能老实地把内容当作一般分析；如果涉及某篇论文的具体结论，我会明确说这一点还没核实。'
  }

  const paperCount = new Set(citations.map((citation) => citation.paperId || citation.paperTitle)).size
  const locatedCount = citations.filter((citation) => citation.pageNumber || citation.section).length
  return `读下来后，真正能抓住的是 ${citations.length} 处依据，来自 ${paperCount} 篇论文${locatedCount ? `，其中 ${locatedCount} 处能直接回到页码或章节` : ''}。这让我心里大概有了条线：原文明确说到的，可以答得肯定些；只是间接支持的，就得留一点余地；没有依据的地方，不替论文把话补完。`
}

function publicReasoningNarrative(input: {
  question?: string
  context: ChatContext
  events: ResearchProgressEvent[]
  citations: Citation[]
  answer?: string
}): string[] {
  const publicThoughts = visibleThoughts(input.events, input.answer)

  // 仅保留基于实际数据的叙事 + 真实 thoughts；移除 questionIntentNarrative / answerNarrative
  // 这类与具体问题无关的固定模板文本（实测反馈"思维链像预设模板"）。
  return [
    contextNarrative(input.context),
    ...publicThoughts,
    activityNarrative(input.events),
    evidenceNarrative(input.citations)
  ]
}

function contextDetail(context: ChatContext): string {
  if (context.type === 'paper') return `已将证据范围锁定为《${context.paperTitle}》`
  if (context.type === 'folder') return `已将证据范围锁定为论文库“${context.folderName}”`
  return '本轮未限定单篇论文，可按问题检索本地论文库或通用知识'
}

function toolSteps(events: ResearchProgressEvent[]): ResearchProcessStep[] {
  const orderedKeys: string[] = []
  const grouped = new Map<string, { event: ResearchProgressEvent; count: number }>()

  for (const event of events) {
    if (event.phase !== 'tool') continue
    const key = event.toolName || event.label
    const existing = grouped.get(key)
    if (existing) {
      existing.count += 1
      continue
    }
    orderedKeys.push(key)
    grouped.set(key, { event, count: 1 })
  }

  return orderedKeys.map((key) => {
    const { event, count } = grouped.get(key)!
    return {
      phase: researchPhaseForProgress(event),
      label: event.label,
      detail: count > 1 ? `实际调用 ${count} 次` : '已完成一次实际工具调用',
      toolName: event.toolName
    }
  })
}

function citationDetail(citations: Citation[]): string {
  if (!citations.length) return '本轮没有返回可定位的论文出处，回答按通用分析展示'

  const paperCount = new Set(citations.map((citation) => citation.paperId || citation.paperTitle)).size
  const locatedCount = citations.filter((citation) => citation.pageNumber || citation.section).length
  return `已匹配 ${citations.length} 条出处，覆盖 ${paperCount} 篇论文${locatedCount ? `，其中 ${locatedCount} 条可定位到页码或章节` : ''}`
}

export function buildResearchProcess(input: {
  context: ChatContext
  events: ResearchProgressEvent[]
  citations: Citation[]
  durationMs: number
  question?: string
  answer?: string
}): ResearchProcess {
  return {
    durationMs: Math.max(1, Math.round(input.durationMs)),
    thoughts: publicReasoningNarrative(input),
    steps: [
      {
        phase: 'scope',
        label: '确认论文范围',
        detail: contextDetail(input.context)
      },
      ...toolSteps(input.events),
      {
        phase: 'answer',
        label: '生成回答',
        detail: '已根据本轮检索结果和原文证据组织回答'
      },
      {
        phase: 'verify',
        label: '核对引用',
        detail: citationDetail(input.citations)
      }
    ]
  }
}
