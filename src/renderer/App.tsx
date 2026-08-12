import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { AppShell, type AppTab } from './components/AppShell'
import { Sidebar } from './components/Sidebar'
import { WorkspaceSearch } from './components/WorkspaceSearch'
import { ToastRegion, type ToastItem } from './components/ToastRegion'
import { desktopApi } from './api/desktopApi'
import { ChatPage } from './pages/ChatPage'
import { KnowledgePage } from './pages/KnowledgePage'
import { SettingsPage } from './pages/SettingsPage'
import { readWorkspacePreferences, updateWorkspacePreferences } from './state/workspacePreferences'
import type { AppSettings, Conversation } from '../shared/types'

type DifyStatus = {
  label: string
  tone: 'neutral' | 'ready' | 'error'
}

function hasDifyConfig(settings: AppSettings): boolean {
  // Tool Agent chat only requires the service URL and App API key. The
  // Knowledge API key is optional and must not make a working chat look
  // unconfigured.
  return Boolean(settings.difyBaseUrl && settings.difyAppApiKey)
}

function statusFromSettings(settings: AppSettings): DifyStatus {
  return hasDifyConfig(settings)
    ? { label: 'Dify 配置已保存', tone: 'neutral' }
    : { label: 'Dify 未配置', tone: 'neutral' }
}

function statusFromConnection(result: { ok: boolean }): DifyStatus {
  return result.ok
    ? { label: 'Dify 已连接', tone: 'ready' }
    : { label: 'Dify 当前不可用', tone: 'error' }
}

export function App(): JSX.Element {
  const [initialPreferences] = useState(readWorkspacePreferences)
  const [activeTab, setActiveTab] = useState<AppTab>(initialPreferences.activeTab)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    initialPreferences.selectedConversationId
  )
  const [selectedConversationFolderId, setSelectedConversationFolderId] = useState<string | null>(
    initialPreferences.selectedConversationFolderId
  )
  const [conversationSidebar, setConversationSidebar] = useState(initialPreferences.conversationSidebar)
  const [conversationRefreshKey, setConversationRefreshKey] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  const [knowledgeRequest, setKnowledgeRequest] = useState<{ paperId?: string; folderId?: string; page?: number; nonce: number } | null>(null)
  const [difyStatus, setDifyStatus] = useState<DifyStatus>({ label: 'Dify 未配置', tone: 'neutral' })
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastSequence = useRef(0)

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id))
  }, [])

  const notify = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    const id = `toast-${Date.now()}-${toastSequence.current++}`
    setToasts((current) => [...current.slice(-2), { id, message, tone }])
    window.setTimeout(() => dismissToast(id), 4200)
  }, [dismissToast])

  useEffect(() => {
    let alive = true
    void desktopApi.settings.get().then(async (settings) => {
      if (!alive) return
      setDifyStatus(statusFromSettings(settings))
      if (!hasDifyConfig(settings)) return
      setDifyStatus({ label: 'Dify 正在检查', tone: 'neutral' })
      const result = await desktopApi.settings.testConnection(settings)
      if (alive) setDifyStatus(statusFromConnection(result))
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'b' || activeTab !== 'chat') return
      event.preventDefault()
      setConversationSidebar((current) => {
        const next = { ...current, collapsed: !current.collapsed }
        updateWorkspacePreferences({ conversationSidebar: next })
        return next
      })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeTab])

  useEffect(() => {
    if (!initialPreferences.selectedConversationId) return
    let alive = true
    void desktopApi.conversations.list().then((conversations) => {
      if (!alive || conversations.some((conversation) => conversation.id === initialPreferences.selectedConversationId)) return
      setSelectedConversationId(null)
      setSelectedConversationFolderId(null)
      updateWorkspacePreferences({ selectedConversationId: null, selectedConversationFolderId: null })
    })
    return () => {
      alive = false
    }
  }, [initialPreferences.selectedConversationId])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      setSearchOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function selectConversation(conversationId: string): void {
    setSelectedConversationId(conversationId)
    updateWorkspacePreferences({ selectedConversationId: conversationId })
  }

  function selectConversationFolder(folderId: string | null): void {
    setSelectedConversationFolderId(folderId)
    updateWorkspacePreferences({ selectedConversationFolderId: folderId })
  }

  function startNewConversation(): void {
    setSelectedConversationId(null)
    updateWorkspacePreferences({ selectedConversationId: null })
  }

  function onConversationCreated(conversation: Conversation): void {
    setSelectedConversationId(conversation.id)
    updateWorkspacePreferences({
      selectedConversationId: conversation.id,
      selectedConversationFolderId: conversation.conversationFolderId
    })
    setConversationRefreshKey((key) => key + 1)
  }

  const sidebar = (
    <Sidebar
      selectedConversationId={selectedConversationId}
      selectedConversationFolderId={selectedConversationFolderId}
      refreshKey={conversationRefreshKey}
      difyStatusLabel={difyStatus.label}
      difyStatusTone={difyStatus.tone}
      onSelectConversation={selectConversation}
      onSelectConversationFolder={selectConversationFolder}
      onNewConversation={startNewConversation}
      onOpenSearch={() => setSearchOpen(true)}
    />
  )

  return (
    <>
      <AppShell
      activeTab={activeTab}
      onTabChange={(tab) => {
        setActiveTab(tab)
        updateWorkspacePreferences({ activeTab: tab })
      }}
      difyStatusLabel={difyStatus.label}
      difyStatusTone={difyStatus.tone}
      onDifyStatusClick={() => {
        setActiveTab('settings')
        updateWorkspacePreferences({ activeTab: 'settings' })
      }}
      showSidebar={activeTab !== 'knowledge'}
      sidebar={sidebar}
      sidebarWidth={conversationSidebar.width}
      sidebarCollapsed={conversationSidebar.collapsed}
      onSidebarWidthChange={(width) => {
        const next = { ...conversationSidebar, width }
        setConversationSidebar(next)
        updateWorkspacePreferences({ conversationSidebar: next })
      }}
      onToggleSidebar={() => {
        const next = { ...conversationSidebar, collapsed: !conversationSidebar.collapsed }
        setConversationSidebar(next)
        updateWorkspacePreferences({ conversationSidebar: next })
      }}
    >
      {activeTab === 'chat' ? (
        <ChatPage
          selectedConversationId={selectedConversationId}
          selectedConversationFolderId={selectedConversationFolderId}
          onConversationCreated={onConversationCreated}
          onStartNewConversation={startNewConversation}
          onNotify={notify}
          onOpenCitation={(citation) => {
            if (!citation.paperId) return
            updateWorkspacePreferences({ activeTab: 'knowledge', knowledge: { activePaperId: citation.paperId } })
            setKnowledgeRequest({ paperId: citation.paperId, page: citation.pageNumber ?? undefined, nonce: Date.now() })
            setActiveTab('knowledge')
          }}
        />
      ) : null}
      {activeTab === 'knowledge' ? (
        <KnowledgePage
          requestedPaperId={knowledgeRequest?.paperId}
          requestedFolderId={knowledgeRequest?.folderId}
          requestedPage={knowledgeRequest?.page}
          requestNonce={knowledgeRequest?.nonce}
          onNotify={notify}
        />
      ) : null}
      {activeTab === 'settings' ? (
        <SettingsPage
          onSettingsSaved={(settings) => setDifyStatus(statusFromSettings(settings))}
          onConnectionTested={(result) => setDifyStatus(statusFromConnection(result))}
        />
      ) : null}
      </AppShell>
      <WorkspaceSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpenConversation={(conversationId) => {
          setActiveTab('chat')
          updateWorkspacePreferences({ activeTab: 'chat', selectedConversationId: conversationId })
          selectConversation(conversationId)
        }}
        onOpenFolder={(folderId) => {
          updateWorkspacePreferences({ activeTab: 'knowledge' })
          updateWorkspacePreferences({ knowledge: { activeFolderId: folderId, activePaperId: null } })
          if (activeTab === 'knowledge') setKnowledgeRequest({ folderId, nonce: Date.now() })
          setActiveTab('knowledge')
        }}
        onOpenPaper={(paperId, folderId) => {
          updateWorkspacePreferences({ activeTab: 'knowledge' })
          updateWorkspacePreferences({ knowledge: { activeFolderId: folderId, activePaperId: paperId } })
          if (activeTab === 'knowledge') setKnowledgeRequest({ paperId, folderId, nonce: Date.now() })
          setActiveTab('knowledge')
        }}
      />
      <ToastRegion items={toasts} onDismiss={dismissToast} />
    </>
  )
}
