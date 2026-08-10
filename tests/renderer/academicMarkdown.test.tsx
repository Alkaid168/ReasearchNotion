import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AcademicMarkdown } from '../../src/renderer/components/AcademicMarkdown'

describe('AcademicMarkdown', () => {
  it('opens external links in a new tab so the Electron app does not navigate away', () => {
    render(<AcademicMarkdown>{'[RAG 论文](http://arxiv.org/abs/2401.00001)'}</AcademicMarkdown>)
    const link = screen.getByRole('link', { name: 'RAG 论文' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(link).toHaveAttribute('href', 'http://arxiv.org/abs/2401.00001')
  })
})
