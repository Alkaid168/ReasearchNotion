import type { ChatContext, Citation } from '../../shared/types'

const paperFactQuestion = /(?:作者|通讯作者|共同一作|第一作者|单位|邮箱|标题|doi|摘要|总结|概括|综述|全文|核心内容|主要内容|研究问题|方法|模型|框架|数据集|实验|结果|指标|结论|贡献|创新|局限|未来工作|第\s*\d+\s*页|页码|章节|图\s*\d+|表\s*\d+|讲了什么|说了什么|author|affiliation|abstract|summar(?:y|ize)|overview|method|model|framework|dataset|experiment|result|conclusion|contribution|novelty|limitation|future work)/i
const scopedPaperReference = /(?:这篇|该篇|当前|所选|本文|文中|论文|文章|它|paper|article|study)/i
const folderEvidenceQuestion = /(?:比较|对比|差异|共同点|综述|归纳|这些论文|哪些论文|论文库|compare|contrast|difference|survey|review|papers)/i

export function requestsWholePaperSummary(question: string, context: ChatContext): boolean {
  return (
    context.type === 'paper' &&
    /(?:全文|全篇|整篇(?:论文|文章)?|通读|从头到尾|逐页|whole\s+(?:paper|article|document)|entire\s+(?:paper|article|document)|read\s+(?:the\s+)?(?:whole|full|entire)\s+(?:paper|article|document))/i.test(question)
  )
}

function requiresOriginalEvidence(question: string, context: ChatContext): boolean {
  const normalized = question.replace(/\s+/g, ' ').trim()
  if (!normalized || context.type === 'free') return false
  if (context.type === 'folder') return folderEvidenceQuestion.test(normalized) || paperFactQuestion.test(normalized)
  return paperFactQuestion.test(normalized) || scopedPaperReference.test(normalized)
}

function normalizedTitle(title: string): string {
  return title.trim().replace(/\.(pdf|md|markdown)$/i, '').replace(/\s+/g, ' ').toLocaleLowerCase()
}

function hasAllowedEvidence(input: {
  context: ChatContext
  citations: Citation[]
  allowedPaperIds?: string[]
}): boolean {
  if (input.context.type === 'free') return true
  if (input.context.type === 'paper') {
    const targetPaperId = input.context.paperId
    const targetTitle = normalizedTitle(input.context.paperTitle)
    return input.citations.some(
      (citation) =>
        citation.paperId === targetPaperId ||
        (!citation.paperId && normalizedTitle(citation.paperTitle) === targetTitle)
    )
  }

  const allowedPaperIds = new Set(input.allowedPaperIds ?? [])
  return input.citations.some((citation) => Boolean(citation.paperId && allowedPaperIds.has(citation.paperId)))
}

export type GroundedAnswer = {
  answer: string
  blocked: boolean
}

function preserveAnswerWithWarning(warning: string, answer: string): GroundedAnswer {
  const generatedAnswer = answer.trim()
  return {
    answer: [`> ⚠️ ${warning}`, generatedAnswer || '模型本轮没有返回可显示的正文，请重新生成。'].join('\n\n'),
    // Keep citations hidden because the selected source was not verified, but
    // do not discard the model's actual response.
    blocked: true
  }
}

export function guardPaperFactAnswer(input: {
  question: string
  context: ChatContext
  answer: string
  citations: Citation[]
  allowedPaperIds?: string[]
  wholePaperReadCompleted?: boolean
}): GroundedAnswer {
  if (requestsWholePaperSummary(input.question, input.context) && input.wholePaperReadCompleted !== true) {
    const paperTitle = input.context.type === 'paper' ? input.context.paperTitle : '当前论文'
    return preserveAnswerWithWarning(
      `本轮没有完成《${paperTitle}》从第一文本块到最后一页的顺序读取。以下保留模型生成的回答供参考，但不能视为已经核对完整全文。`,
      input.answer
    )
  }
  if (!requiresOriginalEvidence(input.question, input.context)) return { answer: input.answer, blocked: false }
  if (hasAllowedEvidence(input)) return { answer: input.answer, blocked: false }

  const target =
    input.context.type === 'paper'
      ? `《${input.context.paperTitle}》`
      : input.context.type === 'folder'
        ? `论文库「${input.context.folderName}」`
        : '当前资料'
  return preserveAnswerWithWarning(
    `这次没有取得${target}的可定位原文证据。以下保留模型生成的回答供参考，其中的论文事实尚未由本地原文核实。`,
    input.answer
  )
}

type TextChunkInvocation = {
  operationId: string
  paperId: string | null
  chunkIndex?: number | null
  maxChars?: number | null
}

type TextChunkResult = {
  ok: boolean
  chunkIndex?: number
  totalChunks?: number
  documentPageCount?: number
  pageEnd?: number
  nextChunkIndex?: number | null
}

export async function verifyWholePaperRead(input: {
  paperId: string
  invocations: TextChunkInvocation[]
  readChunk: (input: { paperId: string; chunkIndex: number; maxChars: number }) => Promise<TextChunkResult>
}): Promise<boolean> {
  const calls = input.invocations.filter(
    (invocation) =>
      invocation.operationId === 'get_paper_text_chunk' &&
      invocation.paperId === input.paperId &&
      Number.isInteger(invocation.chunkIndex) &&
      Number.isFinite(invocation.maxChars)
  )
  const lastCall = calls.at(-1)
  if (!lastCall || !lastCall.chunkIndex || !lastCall.maxChars) return false

  const result = await input.readChunk({
    paperId: input.paperId,
    chunkIndex: lastCall.chunkIndex,
    maxChars: lastCall.maxChars
  })
  if (
    !result.ok ||
    !result.totalChunks ||
    result.chunkIndex !== result.totalChunks ||
    result.nextChunkIndex !== null ||
    result.pageEnd !== result.documentPageCount
  ) {
    return false
  }

  const readIndices = new Set(
    calls
      .filter((call) => call.maxChars === lastCall.maxChars)
      .map((call) => call.chunkIndex)
      .filter((chunkIndex): chunkIndex is number => typeof chunkIndex === 'number')
  )
  for (let chunkIndex = 1; chunkIndex <= result.totalChunks; chunkIndex += 1) {
    if (!readIndices.has(chunkIndex)) return false
  }
  return true
}
