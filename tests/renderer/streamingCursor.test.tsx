import '@testing-library/jest-dom/vitest'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StreamingMarkdown } from '../../src/renderer/components/StreamingMarkdown'

function renderStreaming(markdown: string): HTMLElement {
  const { container } = render(<StreamingMarkdown>{markdown}</StreamingMarkdown>)
  return container
}

describe('StreamingCursor', () => {
  it('sits inside the last paragraph, after its text', () => {
    const container = renderStreaming('第一段。\n\n第二段。')
    const cursor = container.querySelector('.streaming-cursor')
    const lastParagraph = [...container.querySelectorAll('p')].at(-1)
    expect(cursor).not.toBeNull()
    expect(cursor?.parentElement).toBe(lastParagraph)
  })

  it('sits inside the last list item when the answer ends with a list', () => {
    const container = renderStreaming('- 第一点\n- 第二点')
    const cursor = container.querySelector('.streaming-cursor')
    const lastItem = [...container.querySelectorAll('li')].at(-1)
    expect(cursor).not.toBeNull()
    expect(cursor?.parentElement).toBe(lastItem)
  })

  it('sits inside the code element when the answer ends with a code block', () => {
    const container = renderStreaming('```js\nconsole.log(1)\n```')
    const cursor = container.querySelector('.streaming-cursor')
    const code = container.querySelector('pre code')
    expect(cursor).not.toBeNull()
    expect(cursor?.parentElement).toBe(code)
  })

  it('follows the content when the stream continues', () => {
    const { container, rerender } = render(<StreamingMarkdown>{'第一段。'}</StreamingMarkdown>)
    rerender(<StreamingMarkdown>{'第一段。\n\n- 新列表项'}</StreamingMarkdown>)
    const cursor = container.querySelector('.streaming-cursor')
    const lastItem = [...container.querySelectorAll('li')].at(-1)
    expect(cursor?.parentElement).toBe(lastItem)
  })

  it('sticks to the very last text node after inline elements', () => {
    const container = renderStreaming('**加粗** 后面的文字')
    const cursor = container.querySelector('.streaming-cursor')
    expect(cursor).not.toBeNull()
    expect(cursor?.parentElement?.tagName).toBe('P')
    // 光标必须紧跟在最后一个文本节点之后,而不是插进 strong 内部。
    expect(cursor?.previousSibling?.textContent).toBe(' 后面的文字')
  })

  it('sticks to the trailing text after inline code', () => {
    const container = renderStreaming('前缀 `code` 尾部文字')
    const cursor = container.querySelector('.streaming-cursor')
    expect(cursor).not.toBeNull()
    expect(cursor?.previousSibling?.textContent).toBe(' 尾部文字')
  })
})
