import { useLayoutEffect, useRef, type JSX } from 'react'
import { AcademicMarkdown } from './AcademicMarkdown'

/**
 * 从 `el` 出发,找到最后一个含非空文本的最深块级元素。
 * 流式光标只有 append 进这个元素内部,才能和文字共享内联上下文、跟在文字后。
 */
function findDeepestTextBlock(el: Element): Element | null {
  if (!el.textContent || !el.textContent.trim()) return null
  const children = Array.from(el.children)
  for (let i = children.length - 1; i >= 0; i--) {
    const deeper = findDeepestTextBlock(children[i])
    if (deeper) return deeper
  }
  return el
}

type StreamingMarkdownProps = {
  children: string
}

/**
 * 流式渲染的 markdown 正文 + GPT 式流式光标:光标始终跟在最后一个文字 token 之后。
 *
 * 纯 CSS `::after` 挂 `:last-child` 只在最后根元素是 <p> 时跟随文字;当流式输出
 * 以列表/代码块等块级容器结尾时,inline 伪元素会排在容器内块级子元素之后,
 * 落到新行开头。因此这里在每次渲染后,把一个原生 DOM 光标节点 append 到
 * "最后一个含文本的最深块元素"内部——节点不经过 React 渲染,避免 React 重渲染
 * 时把它当 diff 锚点、卸载时按原位置移除而抛 NotFoundError;闪烁动画仍由 CSS
 * 完成,不加 JS 定时器。
 */
export function StreamingMarkdown({ children }: StreamingMarkdownProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const target = findDeepestTextBlock(container)
    if (!target) return
    const cursor = document.createElement('span')
    cursor.className = 'streaming-cursor'
    cursor.setAttribute('aria-hidden', 'true')
    target.appendChild(cursor)
    return () => {
      cursor.remove()
    }
  })

  return (
    <div ref={containerRef} className="markdown-content">
      <AcademicMarkdown>{children}</AcademicMarkdown>
    </div>
  )
}
