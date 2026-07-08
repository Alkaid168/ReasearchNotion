import { useState, type JSX } from 'react'
import { ArrowUp, BookOpen, GitCompare, Lightbulb, ListChecks, Quote } from 'lucide-react'
import { AppShell, type AppTab } from './components/AppShell'
import { EmptyState } from './components/EmptyState'
import { KnowledgePage } from './pages/KnowledgePage'
import { SettingsPage } from './pages/SettingsPage'

export function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<AppTab>('chat')

  return (
    <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'chat' ? <ChatLanding /> : null}
      {activeTab === 'knowledge' ? <KnowledgePage /> : null}
      {activeTab === 'reports' ? (
        <EmptyState title="阅读报告" description="后续可以把论文卡片、问答记录和综述提纲整理成报告。" />
      ) : null}
      {activeTab === 'settings' ? <SettingsPage /> : null}
    </AppShell>
  )
}

function ChatLanding(): JSX.Element {
  return (
    <main className="chat-hero">
      <div className="empty-avatar">R</div>
      <h1>今天研究点什么？</h1>
      <div className="composer" aria-label="研究问答输入区">
        <div className="composer-notice">选择论文库后，回答会优先引用你上传的资料。</div>
        <textarea placeholder="询问论文、比较方法、提取创新点、解释术语..." />
        <div className="quick-actions">
          <button type="button">
            <BookOpen size={15} aria-hidden="true" />
            摘要
          </button>
          <button type="button">
            <Quote size={15} aria-hidden="true" />
            术语解释
          </button>
          <button type="button">
            <Lightbulb size={15} aria-hidden="true" />
            创新点
          </button>
          <button type="button">
            <GitCompare size={15} aria-hidden="true" />
            方法对比
          </button>
          <button type="button">
            <ListChecks size={15} aria-hidden="true" />
            综述提纲
          </button>
          <button className="send-button" type="button" aria-label="发送">
            <ArrowUp size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
    </main>
  )
}
