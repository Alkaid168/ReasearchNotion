import { useEffect, useRef, type CSSProperties, type JSX, type PointerEvent, type ReactNode } from 'react'
import { LibraryBig, MessageSquare, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react'
import { Sidebar } from './Sidebar'

export type AppTab = 'chat' | 'knowledge' | 'settings'

type AppShellProps = {
  activeTab: AppTab
  onTabChange: (tab: AppTab) => void
  difyStatusLabel?: string
  difyStatusTone?: 'neutral' | 'ready' | 'error'
  onDifyStatusClick?: () => void
  showSidebar?: boolean
  sidebar?: ReactNode
  sidebarWidth?: number
  sidebarCollapsed?: boolean
  onSidebarWidthChange?: (width: number) => void
  onToggleSidebar?: () => void
  children: ReactNode
}

const tabs: Array<{ id: AppTab; label: string; icon: typeof MessageSquare }> = [
  { id: 'chat', label: '对话', icon: MessageSquare },
  { id: 'knowledge', label: '知识库', icon: LibraryBig },
  { id: 'settings', label: '设置', icon: Settings }
]

export function AppShell({
  activeTab,
  onTabChange,
  difyStatusLabel = 'Dify 未配置',
  difyStatusTone = 'neutral',
  onDifyStatusClick,
  showSidebar = true,
  sidebar,
  sidebarWidth = 272,
  sidebarCollapsed = false,
  onSidebarWidthChange,
  onToggleSidebar,
  children
}: AppShellProps): JSX.Element {
  const resizeCleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => () => resizeCleanupRef.current?.(), [])

  function resizeSidebar(event: PointerEvent<HTMLButtonElement>): void {
    if (!onSidebarWidthChange || event.button !== 0) return
    event.preventDefault()
    resizeCleanupRef.current?.()

    const onPointerMove = (moveEvent: globalThis.PointerEvent): void => {
      onSidebarWidthChange(Math.min(360, Math.max(220, Math.round(moveEvent.clientX))))
    }
    const stopResize = (): void => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stopResize)
      window.removeEventListener('pointercancel', stopResize)
      resizeCleanupRef.current = null
    }
    resizeCleanupRef.current = stopResize
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)
  }

  return (
    <div className="app-frame">
      <header className="topbar">
        <div className="topbar-title">ResearchNotion</div>
        {showSidebar ? (
          <button
            className="topbar-icon-button"
            type="button"
            aria-label={sidebarCollapsed ? '展开对话侧栏' : '收起对话侧栏'}
            title={sidebarCollapsed ? '展开对话侧栏 (Ctrl+B)' : '收起对话侧栏 (Ctrl+B)'}
            onClick={onToggleSidebar}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
          </button>
        ) : null}
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
        <button
          className={`topbar-status ${difyStatusTone}`}
          type="button"
          aria-label={`${difyStatusLabel}，打开设置`}
          onClick={onDifyStatusClick}
        >
          {difyStatusLabel}
        </button>
      </header>

      <div
        className={showSidebar ? `app-layout${sidebarCollapsed ? ' sidebar-collapsed' : ''}` : 'app-layout no-sidebar'}
        style={{ '--conversation-sidebar-width': `${sidebarWidth}px` } as CSSProperties}
      >
        {showSidebar ? (sidebar ?? <Sidebar />) : null}
        {showSidebar ? (
          <button
            className="sidebar-resize-handle"
            type="button"
            aria-label="调整对话侧栏宽度"
            title="拖动调整对话侧栏宽度"
            onPointerDown={resizeSidebar}
          />
        ) : null}
        <section className="main-panel">{children}</section>
      </div>
    </div>
  )
}
