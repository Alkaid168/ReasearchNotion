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

function compactQuestion(question: string | undefined): string {
  const normalized = question?.replace(/\s+/g, ' ').trim() ?? ''
  if (!normalized) return '当前问题'
  return normalized.length > 90 ? `${normalized.slice(0, 90)}…` : normalized
}

function questionIntentNarrative(question: string | undefined): string {
  const compact = compactQuestion(question)
  const source = question ?? ''
  let reasoning: string

  if (/作者|通讯|共同一作|单位|邮箱/.test(source)) {
    reasoning = '这种问题看上去只要找个名字，其实最容易答错。姓名后的上标、脚注和单位经常挤在一起，我得回到首页一个个对上，不能凭位置猜。'
  } else if (/对比|比较|区别|差异|哪个更/.test(source)) {
    reasoning = '我先不急着列优缺点，因为对象和评价条件没对齐时，“谁更好”往往没有意义。得先把方法、数据和指标放到同一条线上，再看差异到底来自哪里。'
  } else if (/总结|概括|全文|整篇|通读/.test(source)) {
    reasoning = '这里要的不是把原文压短几倍。我更在意论文为什么提出这个问题、方法怎么回应它、实验又能不能撑住结论。这条线理顺了，总结才不会变成章节目录的复述。'
  } else if (/方法|模型|算法|怎么|如何/.test(source)) {
    reasoning = '我想先搞清它是在解决哪个具体卡点，然后再顺着输入、关键处理和输出往下走。只把模块名字翻译一遍不算解释，还得说明它为什么在这里有用。'
  } else if (/评价|判断|是否|合理|正确|可靠/.test(source)) {
    reasoning = '我注意到问题里已经带了一个可能的判断，但不能顺着它就往下写。先要问“我们用什么标准说它正确”，再去找支持和不支持的部分，结论才不会过头。'
  } else {
    reasoning = '我先想弄清用户此刻更想要一个可核对的事实，还是一个能帮助理解的解释。两者写法很不一样：前者得回到原文，后者则更重要的是把逻辑讲清楚。'
  }

  return `我重新看了一遍这个问题：“${compact}”。${reasoning}`
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

function answerNarrative(answer: string | undefined): string {
  const length = answer?.trim().length ?? 0
  if (!length) return '到这里思路已经比较清楚了，但模型还没有交出正文。这种情况不应该用一段过程文字冒充答案，更合适的做法是重新生成。'
  return '所以我最后会先把最直接的结论说出来，然后才是支撑它的解释和证据。写完后我还会回头看一遍：有没有把推测写成事实，有没有因为想答得完整就超出了手上的证据。'
}

function publicReasoningNarrative(input: {
  question?: string
  context: ChatContext
  events: ResearchProgressEvent[]
  citations: Citation[]
  answer?: string
}): string[] {
  const publicThoughts = visibleThoughts(input.events, input.answer)

  return [
    questionIntentNarrative(input.question),
    contextNarrative(input.context),
    ...publicThoughts,
    activityNarrative(input.events),
    evidenceNarrative(input.citations),
    answerNarrative(input.answer)
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
