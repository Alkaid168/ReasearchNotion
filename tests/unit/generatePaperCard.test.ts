import { describe, expect, it, vi } from 'vitest'
import { generatePaperCard } from '../../src/main/workflows/generatePaperCard'

describe('generate paper card workflow', () => {
  it('asks Dify for structured paper metadata and parses JSON', async () => {
    const sendChatMessage = vi.fn().mockResolvedValue({
      answer: JSON.stringify({
        authors: 'Lewis et al.',
        year: '2020',
        oneSentenceSummary: 'RAG combines retrieval and generation.',
        researchProblem: 'Knowledge-intensive generation',
        methodSummary: 'Retrieve passages before generation.',
        contributions: ['Introduces retrieval-augmented generation'],
        keywords: ['RAG', 'retrieval']
      })
    })

    await expect(
      generatePaperCard({
        paperId: 'paper-1',
        title: 'RAG Survey',
        dify: { sendChatMessage }
      })
    ).resolves.toEqual({
      paperId: 'paper-1',
      authors: 'Lewis et al.',
      year: '2020',
      oneSentenceSummary: 'RAG combines retrieval and generation.',
      researchProblem: 'Knowledge-intensive generation',
      methodSummary: 'Retrieve passages before generation.',
      contributions: ['Introduces retrieval-augmented generation'],
      keywords: ['RAG', 'retrieval']
    })

    expect(sendChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'local-user',
        inputs: expect.objectContaining({ task: 'paper_card', paperId: 'paper-1' })
      })
    )
  })
})
