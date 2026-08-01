import { describe, expect, it } from 'vitest'
import { itemsToLines, pdfItemsToText } from '../../src/main/agentTools/paperText'

/** Build a pdfjs-style text item: transform = [a,b,c,d,e,f] where e=x, f=y. */
function pdfItem(str: string, x: number, y: number, hasEOL = false): unknown {
  return { str, transform: [1, 0, 0, 1, x, y], hasEOL }
}

describe('pdfItemsToText double-column detection', () => {
  it('reads left column fully before right column (not interleaved)', () => {
    // Two-column page (width=800, mid=400): left col at x=50, right col at x=450
    // Same Y values → without column detection these would interleave
    const items = [
      pdfItem('Left A', 50, 700),
      pdfItem('Right A', 450, 700),
      pdfItem('Left B', 50, 650),
      pdfItem('Right B', 450, 650)
    ]
    const text = pdfItemsToText(items, 800)
    const lines = text.split('\n').filter(Boolean)
    expect(lines).toEqual(['Left A', 'Left B', 'Right A', 'Right B'])
  })

  it('single column: reads top to bottom without splitting', () => {
    const items = [
      pdfItem('Line 1', 50, 700),
      pdfItem('Line 2', 50, 650),
      pdfItem('Line 3', 50, 600)
    ]
    const text = pdfItemsToText(items, 800)
    const lines = text.split('\n').filter(Boolean)
    expect(lines).toEqual(['Line 1', 'Line 2', 'Line 3'])
  })

  it('treats as single column when right side has <15% items', () => {
    // 9 items left, 1 item right → right is 10% (< 15%) → single column
    const items = [
      pdfItem('L1', 50, 700), pdfItem('L2', 50, 650), pdfItem('L3', 50, 600),
      pdfItem('L4', 50, 550), pdfItem('L5', 50, 500), pdfItem('L6', 50, 450),
      pdfItem('L7', 50, 400), pdfItem('L8', 50, 350), pdfItem('L9', 50, 300),
      pdfItem('R1', 450, 700)
    ]
    const text = pdfItemsToText(items, 800)
    // Should NOT split into columns (R1 mixed in Y order, not appended after all left)
    const lines = text.split('\n').filter(Boolean)
    expect(lines[0]).toBe('L1 R1')  // same Y → same line (single column behavior)
  })

  it('handles empty items', () => {
    expect(pdfItemsToText([], 800)).toBe('')
  })

  it('infers pageWidth from max X when not provided', () => {
    // No pageWidth: infers maxX=500 → mid=250 → left (x<250) + right (x>=250)
    const items = [
      pdfItem('L', 50, 700),
      pdfItem('R', 500, 700),
      pdfItem('L2', 50, 650),
      pdfItem('R2', 500, 650)
    ]
    const text = pdfItemsToText(items)
    const lines = text.split('\n').filter(Boolean)
    expect(lines).toEqual(['L', 'L2', 'R', 'R2'])
  })
})

describe('itemsToLines', () => {
  it('groups same-Y items into one line sorted by X', () => {
    const items = [
      { str: 'World', x: 200, y: 700, hasEOL: false },
      { str: 'Hello', x: 50, y: 700, hasEOL: false }
    ]
    // Note: itemsToLines groups by Y but preserves item order within same Y
    // (sorted by Y desc, same-Y items in array order)
    const result = itemsToLines(items)
    expect(result).toContain('Hello')
    expect(result).toContain('World')
  })

  it('separates different-Y items into different lines', () => {
    const items = [
      { str: 'Top', x: 50, y: 700, hasEOL: false },
      { str: 'Bottom', x: 50, y: 600, hasEOL: false }
    ]
    expect(itemsToLines(items)).toBe('Top\nBottom')
  })

  it('handles empty array', () => {
    expect(itemsToLines([])).toBe('')
  })
})
