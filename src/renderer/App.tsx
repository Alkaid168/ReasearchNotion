import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { X } from 'lucide-react'
import { AppShell, type AppTab } from './components/AppShell'
import { Sidebar } from './components/Sidebar'
import { WorkspaceSearch } from './components/WorkspaceSearch'
import { ToastRegion, type ToastItem } from './components/ToastRegion'
import { desktopApi } from './api/desktopApi'
import { ChatPage } from './pages/ChatPage'
import { KnowledgePage } from './pages/KnowledgePage'
import { SettingsPage } from './pages/SettingsPage'
import { readWorkspacePreferences, updateWorkspacePreferences } from './state/workspacePreferences'
import type { AppSettings, Conversation, ModelProfile, StreamSpeed } from '../shared/types'

type DifyStatus = {
  label: string
  tone: 'neutral' | 'ready' | 'error'
}

function hasDifyConfig(settings: AppSettings): boolean {
  return Boolean(settings.difyBaseUrl && settings.difyAppApiKey && settings.difyKnowledgeApiKey)
}

function statusFromSettings(settings: AppSettings): DifyStatus {
  return hasDifyConfig(settings)
    ? { label: 'Dify 已配置', tone: 'neutral' }
    : { label: 'Dify 未配置', tone: 'neutral' }
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [knowledgeRequest, setKnowledgeRequest] = useState<{ paperId?: string; folderId?: string; page?: number; nonce: number } | null>(null)
  const [difyStatus, setDifyStatus] = useState<DifyStatus>({ label: 'Dify 未配置', tone: 'neutral' })
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [modelProfiles, setModelProfiles] = useState<ModelProfile[]>([])
  const activeModelProfile = modelProfiles.find((profile) => profile.isActive) ?? null
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

  const reloadModelProfiles = useCallback(async () => {
    setModelProfiles(await desktopApi.modelProfiles.list())
  }, [])

  const handleActivateModel = useCallback(
    async (id: string) => {
      await desktopApi.modelProfiles.setActive(id)
      await reloadModelProfiles()
      notify('已切换模型，新对话将使用所选模型。')
    },
    [notify, reloadModelProfiles]
  )

  const handleStreamSpeedChange = useCallback((streamSpeed: StreamSpeed) => {
    setSettings((current) => {
      if (!current) return current
      // save 收全量对象:只传速度字段会把其余设置覆盖为空。
      const merged = { ...current, streamSpeed }
      void desktopApi.settings.save(merged)
      return merged
    })
  }, [])

  useEffect(() => {
    let alive = true
    void Promise.all([desktopApi.settings.get(), desktopApi.modelProfiles.list()]).then(([loaded, profiles]) => {
      if (!alive) return
      setSettings(loaded)
      setDifyStatus(statusFromSettings(loaded))
      setModelProfiles(profiles)
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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      const inEditor = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable
      if (inEditor || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key !== '?' && event.key !== '/') return
      event.preventDefault()
      setShortcutsOpen(true)
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
          onNotify={notify}
          modelProfiles={modelProfiles}
          activeModelProfile={activeModelProfile}
          onActivateModel={handleActivateModel}
          streamSpeed={settings?.streamSpeed ?? 'normal'}
          onStreamSpeedChange={handleStreamSpeedChange}
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
          modelProfiles={modelProfiles}
          activeModelProfile={activeModelProfile}
          onActivateModel={handleActivateModel}
        />
      ) : null}
      {activeTab === 'settings' ? (
        <SettingsPage
          onSettingsSaved={(saved) => {
            setSettings(saved)
            setDifyStatus(statusFromSettings(saved))
          }}
          onConnectionTested={(result) =>
            setDifyStatus(
              result.ok
                ? { label: 'Dify 连接正常', tone: 'ready' }
                : { label: 'Dify 连接失败', tone: 'error' }
            )
          }
          onModelProfilesChanged={reloadModelProfiles}
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
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <ToastRegion items={toasts} onDismiss={dismissToast} />
    </>
  )
}

type ShortcutsModalProps = {
  open: boolean
  onClose: () => void
}

const shortcutGroups = [
  {
    title: '通用',
    items: [
      { keys: ['Ctrl', 'K'], label: '搜索对话 / 论文 / 文件夹' },
      { keys: ['Ctrl', 'B'], label: '收起 / 展开侧栏（对话页）' },
      { keys: ['?'], label: '打开本快捷键面板' },
      { keys: ['Esc'], label: '关闭弹层 / 通知' }
    ]
  },
  {
    title: '对话',
    items: [
      { keys: ['Enter'], label: '发送消息' },
      { keys: ['Shift', 'Enter'], label: '输入框换行' }
    ]
  },
  {
    title: '知识库 / 阅读',
    items: [
      { keys: ['Ctrl', 'I'], label: '打开 / 关闭 AI 抽屉（阅读时）' },
      { keys: ['←', '→'], label: '上一页 / 下一页' }
    ]
  }
]

function ShortcutsModal({ open, onClose }: ShortcutsModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="shortcuts-backdrop" onClick={onClose}>
      <div className="shortcuts-modal" role="dialog" aria-label="快捷键速查" onClick={(event) => event.stopPropagation()}>
        <div className="shortcuts-header">
          <h2>快捷键</h2>
          <button type="button" aria-label="关闭" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="shortcuts-body">
          {shortcutGroups.map((group) => (
            <section key={group.title} className="shortcuts-group">
              <h3>{group.title}</h3>
              <dl>
                {group.items.map((item) => (
                  <div key={item.label} className="shortcuts-row">
                    <dt>{item.label}</dt>
                    <dd>
                      {item.keys.map((key, index) => (
                        <kbd key={`${key}-${index}`}>{key}</kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
