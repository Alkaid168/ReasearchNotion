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

  it('parses paper-card JSON when the model includes reasoning tags', async () => {
    const sendChatMessage = vi.fn().mockResolvedValue({
      answer: `<think>drafting fields</think>
{
  "authors": "",
  "year": "",
  "oneSentenceSummary": "RAG improves factual grounding.",
  "researchProblem": "Hallucination in generation-only models",
  "methodSummary": "Retrieve relevant passages before generation.",
  "contributions": ["Uses external knowledge before generation"],
  "keywords": ["RAG"]
}`
    })

    await expect(
      generatePaperCard({
        paperId: 'paper-1',
        title: 'RAG Survey',
        dify: { sendChatMessage }
      })
    ).resolves.toMatchObject({
      oneSentenceSummary: 'RAG improves factual grounding.',
      contributions: ['Uses external knowledge before generation'],
      keywords: ['RAG']
    })
  })

  it('retries once with a repair prompt when the first answer is malformed, then succeeds', async () => {
    const sendChatMessage = vi
      .fn()
      .mockResolvedValueOnce({ answer: '这不是一段 JSON' })
      .mockResolvedValueOnce({
        answer: JSON.stringify({
          authors: 'X',
          year: '2020',
          oneSentenceSummary: '摘要',
          researchProblem: '问题',
          methodSummary: '方法',
          contributions: ['贡献'],
          keywords: ['关键词']
        })
      })

    await expect(
      generatePaperCard({ paperId: 'p1', title: 'T', dify: { sendChatMessage } })
    ).resolves.toMatchObject({ authors: 'X', year: '2020' })

    expect(sendChatMessage).toHaveBeenCalledTimes(2)
    expect(sendChatMessage.mock.calls[1][0].query).toContain('校验失败')
  })

  it('throws when both the first and the repair answers are malformed', async () => {
    const sendChatMessage = vi.fn().mockResolvedValue({ answer: '完全不是 JSON 的纯文本' })

    await expect(
      generatePaperCard({ paperId: 'p1', title: 'T', dify: { sendChatMessage } })
    ).rejects.toThrow(/论文卡片生成失败/)

    expect(sendChatMessage).toHaveBeenCalledTimes(2)
  })
})
