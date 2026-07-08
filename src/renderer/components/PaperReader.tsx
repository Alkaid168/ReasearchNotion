import type { JSX } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Paper } from '../../shared/types'

type PaperReaderProps = {
  paper: Paper | null
  markdownText: string | null
}

export function PaperReader({ paper, markdownText }: PaperReaderProps): JSX.Element {
  if (!paper) {
    return (
      <div className="reader-empty">
        <h1>选择一篇论文开始阅读</h1>
        <p>支持 PDF 和 Markdown。LaTeX 暂不在 MVP 范围内。</p>
      </div>
    )
  }

  if (paper.fileType === 'markdown') {
    return (
      <article className="paper-page">
        <ReactMarkdown>{markdownText ?? ''}</ReactMarkdown>
      </article>
    )
  }

  return (
    <article className="paper-page pdf-preview">
      <h1>{paper.title}</h1>
      <p>PDF 阅读器将在导入流程接通后显示本地文件预览。</p>
    </article>
  )
}
