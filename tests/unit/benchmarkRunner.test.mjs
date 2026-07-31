import { describe, expect, it } from 'vitest'
import { aggregateCaseRuns, computeRunScores, diffBaseline } from '../../scripts/benchmarkRunner.mjs'

describe('computeRunScores', () => {
  it('returns 1 across the board when every requirement is met', () => {
    const run = { tools: ['get_current_context', 'get_paper_outline'], evidencePaperIds: ['paper_a'], answer: 'Transformer 自注意力' }
    const benchmarkCase = { requiredTools: ['get_current_context', 'get_paper_outline'], requiredEvidencePaperIds: ['paper_a'], expected: /Transformer/ }
    const scores = computeRunScores(run, benchmarkCase)
    expect(scores.toolRecall).toBe(1)
    expect(scores.evidenceCoverage).toBe(1)
    expect(scores.answerQuality).toBe(1)
    expect(scores.score).toBe(1)
  })

  it('toolRecall reflects missing required tools', () => {
    const run = { tools: ['get_current_context'], evidencePaperIds: [], answer: '' }
    const benchmarkCase = { requiredTools: ['get_current_context', 'get_paper_outline'], requiredEvidencePaperIds: [], expected: /.?/ }
    expect(computeRunScores(run, benchmarkCase).toolRecall).toBe(0.5)
  })

  it('evidenceCoverage reflects missing required papers', () => {
    const run = { tools: [], evidencePaperIds: ['paper_a'], answer: '' }
    const benchmarkCase = { requiredTools: [], requiredEvidencePaperIds: ['paper_a', 'paper_b', 'paper_c'], expected: /.?/ }
    expect(computeRunScores(run, benchmarkCase).evidenceCoverage).toBeCloseTo(1 / 3)
  })

  it('omitted requirements default to 1 (not penalised)', () => {
    const scores = computeRunScores({ tools: [], evidencePaperIds: [], answer: '' }, {})
    expect(scores.toolRecall).toBe(1)
    expect(scores.evidenceCoverage).toBe(1)
    expect(scores.answerQuality).toBe(1)
  })

  it('answerQuality is 0 when the expected regex misses', () => {
    const scores = computeRunScores({ tools: [], evidencePaperIds: [], answer: 'no relevant content' }, { expected: /Transformer/ })
    expect(scores.answerQuality).toBe(0)
    expect(scores.score).toBeCloseTo(2 / 3)
  })
})

describe('aggregateCaseRuns', () => {
  it('all runs pass => pass^k true and pass^1 true', () => {
    const r = aggregateCaseRuns([{ passed: true, score: 1 }, { passed: true, score: 0.9 }])
    expect(r.passK).toBe(true)
    expect(r.pass1).toBe(true)
    expect(r.runCount).toBe(2)
    expect(r.scoreAvg).toBeCloseTo(0.95)
  })

  it('mixed runs => pass^1 true but pass^k false', () => {
    const r = aggregateCaseRuns([{ passed: true, score: 0.8 }, { passed: false, score: 0.3 }])
    expect(r.passK).toBe(false)
    expect(r.pass1).toBe(true)
  })

  it('all fail => both false', () => {
    const r = aggregateCaseRuns([{ passed: false, score: 0.1 }])
    expect(r.passK).toBe(false)
    expect(r.pass1).toBe(false)
  })

  it('empty runs => no pass (avoid vacuous truth)', () => {
    const r = aggregateCaseRuns([])
    expect(r.passK).toBe(false)
    expect(r.pass1).toBe(false)
    expect(r.scoreAvg).toBe(0)
  })
})

describe('diffBaseline', () => {
  const threshold = 0.1

  it('flags pass^k regression', () => {
    const baseline = [{ id: 'outline', passK: true, scoreAvg: 0.9 }]
    const current = [{ id: 'outline', passK: false, scoreAvg: 0.9 }]
    const regressions = diffBaseline(current, baseline, threshold)
    expect(regressions).toHaveLength(1)
    expect(regressions[0].id).toBe('outline')
    expect(regressions[0].reason).toMatch(/pass\^k/i)
  })

  it('flags score drop beyond threshold', () => {
    const baseline = [{ id: 'full-paper', passK: false, scoreAvg: 0.8 }]
    const current = [{ id: 'full-paper', passK: false, scoreAvg: 0.5 }]
    const regressions = diffBaseline(current, baseline, threshold)
    expect(regressions).toHaveLength(1)
    expect(regressions[0].reason).toMatch(/score/i)
  })

  it('does not flag small score wobble within threshold', () => {
    const baseline = [{ id: 'library', passK: true, scoreAvg: 0.9 }]
    const current = [{ id: 'library', passK: true, scoreAvg: 0.85 }]
    expect(diffBaseline(current, baseline, threshold)).toHaveLength(0)
  })

  it('does not flag improvement', () => {
    const baseline = [{ id: 'comparison', passK: false, scoreAvg: 0.5 }]
    const current = [{ id: 'comparison', passK: true, scoreAvg: 0.9 }]
    expect(diffBaseline(current, baseline, threshold)).toHaveLength(0)
  })

  it('ignores current cases missing from baseline (new cases)', () => {
    const baseline = [{ id: 'old', passK: true, scoreAvg: 1 }]
    const current = [{ id: 'new', passK: false, scoreAvg: 0.2 }]
    expect(diffBaseline(current, baseline, threshold)).toHaveLength(0)
  })
})
