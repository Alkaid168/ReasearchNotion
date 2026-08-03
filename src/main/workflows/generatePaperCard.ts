import type { PaperCard } from '../../shared/types'
import {
  buildPaperCardAgentInputs,
  buildPaperCardAgentQuery,
  buildPaperCardRepairQuery
} from '../dify/researchAgent'
import { parsePaperCardResponse, type PaperCardFields } from './paperCardSchema'

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

type GeneratedPaperCard = Omit<PaperCard, 'id' | 'updatedAt' | 'readingStatus'>

function withPaperId(paperId: string, fields: PaperCardFields): GeneratedPaperCard {
  return { paperId, ...fields }
}

async function requestCard(
  input: GeneratePaperCardInput,
  query: string
): Promise<ReturnType<typeof parsePaperCardResponse>> {
  const response = await input.dify.sendChatMessage({
    user: 'local-user',
    query,
    inputs: buildPaperCardAgentInputs(input.paperId)
  })
  return parsePaperCardResponse(response.answer)
}

/**
 * Generate a paper card via the Dify agent. The model answer is validated with
 * `PaperCardSchema`; on failure, exactly one repair attempt is made by feeding
 * the schema errors and the previous output back to the model (format-only,
 * no new facts). If the repair also fails, this throws and the caller writes a
 * placeholder card so the paper import is not rolled back.
 */
export async function generatePaperCard(input: GeneratePaperCardInput): Promise<GeneratedPaperCard> {
  const first = await requestCard(input, buildPaperCardAgentQuery(input.paperId, input.title))
  if (first.ok) return withPaperId(input.paperId, first.data)

  const second = await requestCard(
    input,
    buildPaperCardRepairQuery({
      paperId: input.paperId,
      title: input.title,
      errors: first.errors,
      previousOutput: first.rawForRepair
    })
  )
  if (second.ok) return withPaperId(input.paperId, second.data)

  throw new Error(
    `论文卡片生成失败（已尝试 repair）：${[...first.errors, ...second.errors].join('; ')}`
  )
}
