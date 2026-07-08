import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '../../src/renderer/App'

describe('App shell', () => {
  it('opens on the chat page with a research prompt', () => {
    render(<App />)

    expect(screen.getByText('科研工作空间')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '对话' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('今天研究点什么？')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('询问论文、比较方法、提取创新点、解释术语...')).toBeInTheDocument()
  })

  it('switches between top-level workspace pages', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('tab', { name: '知识库' }))

    expect(screen.getByRole('tab', { name: '知识库' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: '知识库' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: '设置' }))

    expect(screen.getByRole('tab', { name: '设置' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: '连接 Dify' })).toBeInTheDocument()
  })
})
