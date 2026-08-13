import { describe, expect, it } from 'vitest'
import { guardPaperFactAnswer, requestsWholePaperSummary, verifyWholePaperRead } from '../../src/main/dify/answerGrounding'
import type { Citation } from '../../src/shared/types'

const paperContext = { type: 'paper', paperId: 'paper-1', paperTitle: 'Grounded Research' } as const
const localCitation: Citation = {
  paperId: 'paper-1',
  paperTitle: 'Grounded Research',
  snippet: 'The experiment reports the measured result.',
  score: null,
  pageNumber: 4
}

describe('paper answer grounding guard', () => {
  it('only treats an explicit whole-paper request as requiring complete coverage', () => {
    expect(requestsWholePaperSummary('请总结全文。', paperContext)).toBe(true)
    expect(requestsWholePaperSummary('请总结整篇论文。', paperContext)).toBe(true)
    expect(requestsWholePaperSummary('请通读后概括。', paperContext)).toBe(true)
    expect(requestsWholePaperSummary('请总结这篇论文中的 scenario。', paperContext)).toBe(false)
    expect(requestsWholePaperSummary('概括主要方法和实验结果。', paperContext)).toBe(false)
  })

  it('blocks a paper fact answer when no original-paper evidence was returned', () => {
    const result = guardPaperFactAnswer({
      question: '这篇论文的作者和主要方法是什么？',
      context: paperContext,
      answer: '作者是某某，方法是某某。',
      citations: []
    })

    expect(result.blocked).toBe(true)
    expect(result.answer).toContain('没有取得《Grounded Research》的可定位原文证据')
    expect(result.answer).toContain('作者是某某')
  })

  it('does not accept evidence from a different paper', () => {
    const result = guardPaperFactAnswer({
      question: '总结这篇论文的实验结果。',
      context: paperContext,
      answer: '实验结果很好。',
      citations: [{ ...localCitation, paperId: 'paper-2', paperTitle: 'Another Paper' }]
    })

    expect(result.blocked).toBe(true)
  })

  it('keeps a paper fact answer when the selected paper supplied evidence', () => {
    const result = guardPaperFactAnswer({
      question: '总结这篇论文的实验结果。',
      context: paperContext,
      answer: '实验结果由第 4 页支持。',
      citations: [localCitation],
      wholePaperReadCompleted: true
    })

    expect(result).toEqual({ answer: '实验结果由第 4 页支持。', blocked: false })
  })

  it('allows a general concept explanation without requiring paper evidence', () => {
    const result = guardPaperFactAnswer({
      question: '什么是知识蒸馏？',
      context: paperContext,
      answer: '知识蒸馏是一种模型压缩方法。',
      citations: []
    })

    expect(result.blocked).toBe(false)
  })

  it('requires citations from the selected library for a library comparison', () => {
    const result = guardPaperFactAnswer({
      question: '比较这些论文的方法差异。',
      context: { type: 'folder', folderId: 'folder-1', folderName: '毕业设计' },
      answer: '它们的方法不同。',
      citations: [{ ...localCitation, paperId: 'paper-outside' }],
      allowedPaperIds: ['paper-1', 'paper-2']
    })

    expect(result.blocked).toBe(true)
    expect(result.answer).toContain('论文库「毕业设计」')
  })

  it('blocks a whole-paper summary even with a citation when the final text chunk was not verified', () => {
    const result = guardPaperFactAnswer({
      question: '请总结全文。',
      context: paperContext,
      answer: '这是不完整的总结。',
      citations: [localCitation],
      wholePaperReadCompleted: false
    })

    expect(result.blocked).toBe(true)
    expect(result.answer).toContain('从第一文本块到最后一页')
    expect(result.answer).toContain('这是不完整的总结。')
  })

  it('verifies continuous text chunks through the document final page', async () => {
    const readChunk = async () => ({
      ok: true,
      chunkIndex: 3,
      totalChunks: 3,
      documentPageCount: 8,
      pageEnd: 8,
      nextChunkIndex: null
    })
    const base = { operationId: 'get_paper_text_chunk', paperId: 'paper-1', maxChars: 8000 }

    await expect(
      verifyWholePaperRead({
        paperId: 'paper-1',
        invocations: [
          { ...base, chunkIndex: 1 },
          { ...base, chunkIndex: 2 },
          { ...base, chunkIndex: 3 }
        ],
        readChunk
      })
    ).resolves.toBe(true)

    await expect(
      verifyWholePaperRead({
        paperId: 'paper-1',
        invocations: [{ ...base, chunkIndex: 1 }, { ...base, chunkIndex: 3 }],
        readChunk
      })
    ).resolves.toBe(false)
  })
})
