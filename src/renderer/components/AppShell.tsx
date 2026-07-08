import type { JSX, ReactNode } from 'react'
import { FileText, LibraryBig, MessageSquare, Settings } from 'lucide-react'
import { Sidebar } from './Sidebar'

export type AppTab = 'chat' | 'knowledge' | 'reports' | 'settings'

type AppShellProps = {
  activeTab: AppTab
  onTabChange: (tab: AppTab) => void
  children: ReactNode
}

const tabs: Array<{ id: AppTab; label: string; icon: typeof MessageSquare }> = [
  { id: 'chat', label: '对话', icon: MessageSquare },
  { id: 'knowledge', label: '知识库', icon: LibraryBig },
  { id: 'reports', label: '报告', icon: FileText },
  { id: 'settings', label: '设置', icon: Settings }
]

export function AppShell({ activeTab, onTabChange, children }: AppShellProps): JSX.Element {
  return (
    <div className="app-frame">
      <header className="topbar">
        <div className="topbar-title">ResearchNotion</div>
        <nav className="topbar-tabs" role="tablist" aria-label="主页面">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                className={activeTab === tab.id ? 'topbar-tab active' : 'topbar-tab'}
                type="button"
                onClick={() => onTabChange(tab.id)}
              >
                <Icon size={15} aria-hidden="true" />
                {tab.label}
              </button>
            )
          })}
        </nav>
        <span className="topbar-status">Dify 本地连接</span>
      </header>

      <div className="app-layout">
        <Sidebar />
        <section className="main-panel">{children}</section>
      </div>
    </div>
  )
}
