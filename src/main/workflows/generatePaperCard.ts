import type { PaperCard } from '../../shared/types'
import { buildPaperCardAgentInputs, buildPaperCardAgentQuery } from '../dify/researchAgent'

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
  const trimmed = answer.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fenced) return JSON.parse(fenced[1]) as Record<string, unknown>

  const jsonStart = trimmed.indexOf('{')
  const jsonEnd = trimmed.lastIndexOf('}')
  const json = jsonStart >= 0 && jsonEnd > jsonStart ? trimmed.slice(jsonStart, jsonEnd + 1) : trimmed
  return JSON.parse(json) as Record<string, unknown>
}

export async function generatePaperCard(
  input: GeneratePaperCardInput
): Promise<Omit<PaperCard, 'id' | 'updatedAt' | 'readingStatus'>> {
  const result = await input.dify.sendChatMessage({
    user: 'local-user',
    query: buildPaperCardAgentQuery(input.paperId, input.title),
    inputs: buildPaperCardAgentInputs(input.paperId)
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
