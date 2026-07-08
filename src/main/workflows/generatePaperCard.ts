import type { PaperCard } from '../../shared/types'

type GeneratePaperCardInput = {
  paperId: string
  title: string
  dify: {
    sendChatMessage(input: {
      query: string
      user: string
      inputs: Record<string, string>
    }): Promise<{ answer: string }>
  }
}

function parseList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

function parseJsonAnswer(answer: string): Record<string, unknown> {
  const trimmed = answer.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return JSON.parse(fenced?.[1] ?? trimmed) as Record<string, unknown>
}

export async function generatePaperCard(
  input: GeneratePaperCardInput
): Promise<Omit<PaperCard, 'id' | 'updatedAt' | 'readingStatus'>> {
  const result = await input.dify.sendChatMessage({
    user: 'local-user',
    query: `请为论文《${input.title}》生成论文卡片。只返回 JSON，字段包括 authors, year, oneSentenceSummary, researchProblem, methodSummary, contributions, keywords。`,
    inputs: {
      task: 'paper_card',
      paperId: input.paperId
    }
  })

  const parsed = parseJsonAnswer(result.answer)
  return {
    paperId: input.paperId,
    authors: String(parsed.authors ?? ''),
    year: String(parsed.year ?? ''),
    oneSentenceSummary: String(parsed.oneSentenceSummary ?? ''),
    researchProblem: String(parsed.researchProblem ?? ''),
    methodSummary: String(parsed.methodSummary ?? ''),
    contributions: parseList(parsed.contributions),
    keywords: parseList(parsed.keywords)
  }
}
