import { describe, expect, it } from 'vitest'
import { normalizedPaperTitle, supportedPaperFile } from '../../src/renderer/pages/paperImportUtils'

describe('paper import utilities', () => {
  it.each(['paper.pdf', 'paper.MD', 'paper.markdown'])('accepts supported paper file %s', (name) => {
    expect(supportedPaperFile({ name })).toBe(true)
  })

  it.each(['paper.txt', 'paper.docx', 'paper.pdf.tmp'])('rejects unsupported paper file %s', (name) => {
    expect(supportedPaperFile({ name })).toBe(false)
  })

  it('normalizes extensions, whitespace, and case for duplicate detection', () => {
    expect(normalizedPaperTitle('  A   Research Paper.PDF  ')).toBe('a research paper')
    expect(normalizedPaperTitle('Paper.markdown   ')).toBe('paper')
  })
})
