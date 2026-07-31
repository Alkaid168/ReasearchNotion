import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CitationStatus } from '../../src/renderer/components/CitationStatus'

describe('CitationStatus', () => {
  it('shows evidence metadata and opens a local paper citation', () => {
    const onOpenCitation = vi.fn()
    render(
      <CitationStatus
        messageId="message-1"
        citations={[
          {
            paperId: 'paper-attention',
            paperTitle: 'Attention Is All You Need',
            pageNumber: 4,
            snippet: 'Scaled dot-product attention computes a weighted sum.',
            score: 0.91,
            evidenceType: 'tool'
          }
        ]}
        onOpenCitation={onOpenCitation}
      />
    )

    const citation = screen.getByRole('button', { name: /Attention Is All You Need.*第 4 页/ })
    expect(citation).toHaveAttribute('title', expect.stringContaining('Scaled dot-product attention'))
    fireEvent.click(citation)
    expect(onOpenCitation).toHaveBeenCalledWith(expect.objectContaining({ paperId: 'paper-attention', pageNumber: 4 }))
  })
})
