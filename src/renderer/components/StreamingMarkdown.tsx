import { useLayoutEffect, useRef, type JSX } from 'react'
import { AcademicMarkdown } from './AcademicMarkdown'

/**
 * 找到根容器内最后一个非空文本节点。
 *
 * 光标必须紧跟在"最后一个文字 token"之后;块级容器(ul/pre 等)或行内元素
 * (strong/code 等)的 append 位置都会错位——块级容器会把光标排到新行开头,
 * 行内元素会漏掉其后的兄弟文本节点,把光标插进文字中间。文本节点才是
 * 唯一可靠的内联锚点。
 */
function findLastTextNode(root: Element): Text | null {
  let last: Text | null = null
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let current = walker.nextNode()
  while (current) {
    if (current.textContent?.trim()) last = current as Text
    current = walker.nextNode()
  }
  return last
}

type StreamingMarkdownProps = {
  children: string
}

/**
 * 流式渲染的 markdown 正文 + GPT 式流式光标:光标始终跟在最后一个文字 token 之后。
 *
 * 纯 CSS `::after` 挂 `:last-child` 只在最后根元素是 <p> 时跟随文字;当流式输出
 * 以列表/代码块等块级容器结尾时,inline 伪元素会排在容器内块级子元素之后,
 * 落到新行开头。因此这里在每次渲染后,把一个原生 DOM 光标节点插到最后一个
 * 非空文本节点之后——节点不经过 React 渲染,避免 React 重渲染时把它当 diff
 * 锚点、卸载时按原位置移除而抛 NotFoundError;闪烁动画仍由 CSS 完成,
 * 不加 JS 定时器。
 */
export function StreamingMarkdown({ children }: StreamingMarkdownProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const lastText = findLastTextNode(container)
    if (!lastText) return
    const cursor = document.createElement('span')
    cursor.className = 'streaming-cursor'
    cursor.setAttribute('aria-hidden', 'true')
    lastText.after(cursor)
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
