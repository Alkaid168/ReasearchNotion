import { describe, expect, it } from 'vitest'
import { buildResearchProcess, researchPhaseForProgress } from '../../src/shared/researchProcess'

describe('research process', () => {
  it('maps actual research tools into stable user-facing phases', () => {
    expect(researchPhaseForProgress({ phase: 'tool', toolName: 'search_library', label: '检索论文库' })).toBe('search')
    expect(researchPhaseForProgress({ phase: 'tool', toolName: 'get_paper_text_chunk', label: '读取论文文本' })).toBe('read')
    expect(researchPhaseForProgress({ phase: 'delta', label: '生成回答' })).toBe('answer')
    expect(researchPhaseForProgress({ phase: 'done', label: '完成' })).toBe('verify')
  })

  it('summarizes repeated calls and keeps the evidence audit concise', () => {
    const process = buildResearchProcess({
      context: { type: 'paper', paperId: 'paper-1', paperTitle: 'RAG Survey' },
      durationMs: 2345,
      events: [
        { phase: 'tool', toolName: 'get_paper_outline', label: '读取论文大纲' },
        { phase: 'tool', toolName: 'get_paper_text_chunk', label: '读取论文文本' },
        { phase: 'tool', toolName: 'get_paper_text_chunk', label: '读取论文文本' },
        { phase: 'answer', label: '生成回答' },
        { phase: 'done', label: '完成' }
      ],
      citations: [
        {
          paperId: 'paper-1',
          paperTitle: 'RAG Survey',
          snippet: 'retrieval augmented generation',
          score: 0.91,
          pageNumber: 3
        }
      ]
    })

    expect(process.durationMs).toBe(2345)
    expect(process.steps[0]).toMatchObject({ phase: 'scope', detail: '已将证据范围锁定为《RAG Survey》' })
    expect(process.steps).toContainEqual(
      expect.objectContaining({ phase: 'read', label: '读取论文文本', detail: '实际调用 2 次' })
    )
    expect(process.steps.at(-1)?.detail).toContain('1 条出处')
    expect(process.steps.at(-1)?.detail).toContain('页码或章节')
  })

  it('keeps distinct public thought summaries and removes final-answer duplicates', () => {
    const process = buildResearchProcess({
      context: { type: 'free' },
      durationMs: 5000,
      answer: 'RAG 通过检索外部知识来增强生成。',
      events: [
        { phase: 'thought', label: '梳理问题与证据', thought: '先区分检索阶段与生成阶段。' },
        { phase: 'thought', label: '梳理问题与证据', thought: 'RAG 通过检索外部知识来增强生成。' }
      ],
      citations: []
    })

    expect(process.thoughts).toHaveLength(6)
    expect(process.thoughts?.join('\n')).toContain('先区分检索阶段与生成阶段。')
    expect(process.thoughts?.join('\n')).not.toContain('模型主动给出的公开思考摘要是：RAG 通过检索外部知识来增强生成。')
  })
})
