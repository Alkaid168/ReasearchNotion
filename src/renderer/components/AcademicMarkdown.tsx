import { isValidElement, useState, type JSX, type ReactNode } from 'react'
import { Check, Copy } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'

type AcademicMarkdownProps = {
  children: string
}

function textContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textContent).join('')
  if (isValidElement(node)) return textContent((node.props as { children?: ReactNode }).children)
  return ''
}

/** 从 react-markdown 渲染的 <code class="language-js"> 子节点中提取语言标签。 */
function extractLanguage(children: ReactNode): string {
  const codeElement = Array.isArray(children) ? children[0] : children
  if (!isValidElement(codeElement)) return ''
  const className = (codeElement.props as { className?: string }).className ?? ''
  const match = /language-([\w-]+)/.exec(className)
  return match ? match[1] : ''
}

function CodeBlock({ children, language }: { children?: ReactNode; language: string }): JSX.Element {
  const code = textContent(children).replace(/\n$/, '')
  const [copied, setCopied] = useState(false)
  const label = language || 'text'

  async function handleCopy(): Promise<void> {
    if (!navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-header">
        <span className="markdown-code-lang">{label}</span>
        <button
          type="button"
          aria-label={copied ? '已复制' : '复制代码'}
          title="复制代码"
          onClick={() => void handleCopy()}
        >
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  )
}

export function AcademicMarkdown({ children }: AcademicMarkdownProps): JSX.Element {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        table: ({ children: tableChildren }) => (
          <div className="markdown-table-scroll">
            <table>{tableChildren}</table>
          </div>
        ),
        pre: ({ children: codeChildren }) => (
          <CodeBlock language={extractLanguage(codeChildren)}>{codeChildren}</CodeBlock>
        ),
        a: ({ href, children: linkChildren }) => (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {linkChildren}
          </a>
        )
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
