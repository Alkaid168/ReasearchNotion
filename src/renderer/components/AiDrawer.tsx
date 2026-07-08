import type { JSX } from 'react'
import { Lightbulb, MessageSquare, X } from 'lucide-react'

type AiDrawerProps = {
  open: boolean
  onClose: () => void
}

const suggestions = ['解释当前论文的核心创新点', '把 Method 部分转成中文阅读笔记', '分析实验指标和局限性']

export function AiDrawer({ open, onClose }: AiDrawerProps): JSX.Element | null {
  if (!open) return null

  return (
    <aside className="ai-drawer" aria-label="论文 AI 问答栏">
      <header className="ai-drawer-header">
        <div>
          <span>对当前论文提问</span>
          <small>Ctrl+J</small>
        </div>
        <button type="button" aria-label="关闭 AI 问答栏" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="ai-suggestions">
        {suggestions.map((suggestion) => (
          <button key={suggestion} type="button">
            <Lightbulb size={15} aria-hidden="true" />
            {suggestion}
          </button>
        ))}
      </div>

      <div className="drawer-composer">
        <MessageSquare size={16} aria-hidden="true" />
        <textarea placeholder="对当前论文提问..." />
      </div>
    </aside>
  )
}
