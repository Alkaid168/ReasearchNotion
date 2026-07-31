import { describe, expect, it } from 'vitest'
import { parsePaperCardResponse, type PaperCardFields } from '../../src/main/workflows/paperCardSchema'

const FULL = (overrides: Partial<Record<string, unknown>> = {}): string =>
  JSON.stringify({
    authors: 'Lewis et al.',
    year: '2020',
    oneSentenceSummary: 'RAG 结合检索与生成。',
    researchProblem: '知识密集型生成',
    methodSummary: '生成前检索段落',
    contributions: ['引入检索增强生成'],
    keywords: ['RAG', 'retrieval'],
    ...overrides
  })

describe('parsePaperCardResponse — happy path', () => {
  it('parses clean JSON', () => {
    const r = parsePaperCardResponse(FULL())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.authors).toBe('Lewis et al.')
      expect(r.data.year).toBe('2020')
      expect(r.data.contributions).toEqual(['引入检索增强生成'])
    }
  })

  it('fills defaults when optional fields are missing', () => {
    const r = parsePaperCardResponse(JSON.stringify({ authors: 'X' }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.year).toBe('')
      expect(r.data.contributions).toEqual([])
      expect(r.data.keywords).toEqual([])
    }
  })
})

describe('parsePaperCardResponse — pre-cleaning', () => {
  it('strips <think> reasoning tags', () => {
    const r = parsePaperCardResponse(`<think>drafting the card</think>\n${FULL()}`)
    expect(r.ok).toBe(true)
  })

  it('strips ```json code fences', () => {
    const r = parsePaperCardResponse('```json\n' + FULL() + '\n```')
    expect(r.ok).toBe(true)
  })
})

describe('parsePaperCardResponse — jsonrepair integration', () => {
  it('repairs truncated JSON (missing closing brace + bracket)', () => {
    const raw =
      '{"authors":"X","year":"2020","oneSentenceSummary":"s","researchProblem":"p","methodSummary":"m","contributions":["a"],"keywords":["b"'
    const r = parsePaperCardResponse(raw)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.keywords).toEqual(['b'])
  })

  it('repairs Chinese curly quotes “”', () => {
    const raw =
      '{“authors”:“X”,“year”:“2020”,“oneSentenceSummary”:“s”,“researchProblem”:“p”,“methodSummary”:“m”,“contributions”:[],“keywords”:[]}'
    const r = parsePaperCardResponse(raw)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.authors).toBe('X')
  })

  it('repairs Python constants None/True/False', () => {
    const raw =
      '{"authors":"X","year":None,"oneSentenceSummary":"s","researchProblem":"p","methodSummary":"m","contributions":[],"keywords":[]}'
    const r = parsePaperCardResponse(raw)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.year).toBe('')
  })

  it('strips trailing comma', () => {
    const raw = FULL({}).replace(/}$/, ',}')
    const r = parsePaperCardResponse(raw)
    expect(r.ok).toBe(true)
  })
})

describe('parsePaperCardResponse — field coercion', () => {
  it('splits a contributions string into an array', () => {
    const raw = FULL({
      contributions: '创新点1；创新点2、创新点3',
      keywords: 'RAG, retrieval'
    })
    const r = parsePaperCardResponse(raw)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.contributions).toEqual(['创新点1', '创新点2', '创新点3'])
      expect(r.data.keywords).toEqual(['RAG', 'retrieval'])
    }
  })

  it('drops non-string entries from arrays', () => {
    const raw = FULL({ contributions: ['valid', 42, null, { x: 1 }, true] })
    const r = parsePaperCardResponse(raw)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.contributions).toEqual(['valid'])
  })

  it('extracts a 4-digit year from a messy string', () => {
    const r = parsePaperCardResponse(FULL({ year: 'published in 2023' }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.year).toBe('2023')
  })

  it('coerces numeric year to string', () => {
    const r = parsePaperCardResponse(FULL({ year: 2018 }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.year).toBe('2018')
  })

  it('returns empty year when no 4-digit number is present', () => {
    const r = parsePaperCardResponse(FULL({ year: 'forthcoming' }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.year).toBe('')
  })

  it('trims whitespace on string fields', () => {
    const r = parsePaperCardResponse(FULL({ authors: '  Spaced  ' }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.authors).toBe('Spaced')
  })
})

describe('parsePaperCardResponse — failure modes feed repair', () => {
  it('returns structured errors when root is an array, not an object', () => {
    const r = parsePaperCardResponse('["not", "an", "object"]')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(0)
  })

  it('returns structured errors when content has no JSON object at all', () => {
    const r = parsePaperCardResponse('完全不是 JSON 的一段中文解释，没有任何大括号')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(0)
  })

  it('exposes the cleaned previous output for a repair prompt on failure', () => {
    const r = parsePaperCardResponse('```json\n["bad"]\n```')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(typeof r.rawForRepair).toBe('string')
  })
})

describe('PaperCardFields type surface', () => {
  it('produces a card-shaped object on success (compile-time shape)', () => {
    const r = parsePaperCardResponse(FULL())
    if (r.ok) {
      const card: PaperCardFields = r.data
      expect(card).toEqual(r.data)
    }
  })
})
