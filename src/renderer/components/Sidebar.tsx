import type { JSX } from 'react'
import { Folder, MessageSquare, Plus, Search, Sparkles } from 'lucide-react'

const recentConversations = ['Notion 和模型功能介绍', 'RAG 评估指标讨论', '论文摘要草稿']
const conversationFolders = ['毕业设计', '创新实训']

export function Sidebar(): JSX.Element {
  return (
    <aside className="sidebar">
      <div className="workspace-title">
        <div className="workspace-mark">R</div>
        <span>科研工作空间</span>
      </div>

      <button className="sidebar-command" type="button">
        <Search size={15} aria-hidden="true" />
        搜索论文和对话
      </button>

      <nav className="sidebar-nav" aria-label="历史对话">
        <div className="sidebar-section-title">最近</div>
        {recentConversations.map((title, index) => (
          <button key={title} className={index === 0 ? 'sidebar-item active' : 'sidebar-item'} type="button">
            <MessageSquare size={15} aria-hidden="true" />
            <span>{title}</span>
          </button>
        ))}

        <div className="sidebar-section-title">文件夹</div>
        {conversationFolders.map((name) => (
          <button key={name} className="sidebar-item" type="button">
            <Folder size={15} aria-hidden="true" />
            <span>{name}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="sidebar-command compact" type="button">
          <Sparkles size={15} aria-hidden="true" />
          本地 Dify 未测试
        </button>
        <button className="new-chat-button" type="button">
          <Plus size={16} aria-hidden="true" />
          全新对话
        </button>
      </div>
    </aside>
  )
}
