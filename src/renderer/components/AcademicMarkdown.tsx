import { isValidElement, type JSX, type ReactNode } from 'react'
import { Copy } from 'lucide-react'
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

function CodeBlock({ children }: { children?: ReactNode }): JSX.Element {
  const code = textContent(children).replace(/\n$/, '')

  return (
    <div className="markdown-code-block">
      <button
        type="button"
        aria-label="复制代码"
        title="复制代码"
        onClick={() => void navigator.clipboard?.writeText(code)}
      >
        <Copy size={14} aria-hidden="true" />
      </button>
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
        pre: ({ children: codeChildren }) => <CodeBlock>{codeChildren}</CodeBlock>,
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
