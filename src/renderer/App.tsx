import { useState, type JSX } from 'react'
import { AppShell, type AppTab } from './components/AppShell'
import { EmptyState } from './components/EmptyState'
import { ChatPage } from './pages/ChatPage'
import { KnowledgePage } from './pages/KnowledgePage'
import { SettingsPage } from './pages/SettingsPage'

export function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState<AppTab>('chat')

  return (
    <AppShell activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'chat' ? <ChatPage /> : null}
      {activeTab === 'knowledge' ? <KnowledgePage /> : null}
      {activeTab === 'reports' ? (
        <EmptyState title="阅读报告" description="后续可以把论文卡片、问答记录和综述提纲整理成报告。" />
      ) : null}
      {activeTab === 'settings' ? <SettingsPage /> : null}
    </AppShell>
  )
}
