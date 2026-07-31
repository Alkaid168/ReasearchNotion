export type WorkspaceTab = 'chat' | 'knowledge' | 'settings'

export type PaperViewPreference = {
  page: number
  scale: number
}

export type SidebarPreference = {
  width: number
  collapsed: boolean
}

export type WorkspacePreferences = {
  activeTab: WorkspaceTab
  selectedConversationId: string | null
  selectedConversationFolderId: string | null
  expandedConversationFolderIds: string[] | null
  conversationSidebar: SidebarPreference
  knowledge: {
    activeFolderId: string | null
    activePaperId: string | null
    expandedFolderIds: string[]
    paperViews: Record<string, PaperViewPreference>
    sidebarWidth: number
    sidebarCollapsed: boolean
  }
}

type StoredWorkspacePreferences = WorkspacePreferences & { version: 1 }

const storageKey = 'research-notion:workspace-preferences'
const conversationSidebarDefault: SidebarPreference = { width: 272, collapsed: false }
const knowledgeSidebarDefault: SidebarPreference = { width: 280, collapsed: false }

const defaults: WorkspacePreferences = {
  activeTab: 'chat',
  selectedConversationId: null,
  selectedConversationFolderId: null,
  expandedConversationFolderIds: null,
  conversationSidebar: conversationSidebarDefault,
  knowledge: {
    activeFolderId: null,
    activePaperId: null,
    expandedFolderIds: [],
    paperViews: {},
    sidebarWidth: knowledgeSidebarDefault.width,
    sidebarCollapsed: knowledgeSidebarDefault.collapsed
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

function sidebarWidth(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(360, Math.max(220, Math.round(value))) : fallback
}

function readSidebarPreference(value: unknown, fallback: SidebarPreference): SidebarPreference {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback
  const candidate = value as Partial<SidebarPreference>
  return {
    width: sidebarWidth(candidate.width, fallback.width),
    collapsed: typeof candidate.collapsed === 'boolean' ? candidate.collapsed : fallback.collapsed
  }
}

function readPaperViews(value: unknown): Record<string, PaperViewPreference> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value).flatMap(([paperId, view]) => {
      if (!view || typeof view !== 'object' || Array.isArray(view)) return []
      const candidate = view as Partial<PaperViewPreference>
      if (!Number.isFinite(candidate.page) || !Number.isFinite(candidate.scale)) return []
      return [[paperId, { page: Math.max(1, Math.round(candidate.page!)), scale: candidate.scale! }]]
    })
  )
}

export function readWorkspacePreferences(): WorkspacePreferences {
  const storage = safeStorage()
  if (!storage) return defaults

  try {
    const raw = storage.getItem(storageKey)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<StoredWorkspacePreferences>
    if (parsed.version !== 1) return defaults

    const tab = parsed.activeTab
    const activeTab: WorkspaceTab = tab === 'knowledge' || tab === 'settings' || tab === 'chat' ? tab : 'chat'
    const knowledge = parsed.knowledge && typeof parsed.knowledge === 'object' ? parsed.knowledge : defaults.knowledge
    const conversationSidebar = readSidebarPreference(parsed.conversationSidebar, conversationSidebarDefault)
    const knowledgeSidebar = readSidebarPreference(knowledge, knowledgeSidebarDefault)
    return {
      activeTab,
      selectedConversationId: stringOrNull(parsed.selectedConversationId),
      selectedConversationFolderId: stringOrNull(parsed.selectedConversationFolderId),
      expandedConversationFolderIds: Array.isArray(parsed.expandedConversationFolderIds)
        ? [...new Set(parsed.expandedConversationFolderIds.filter((id): id is string => typeof id === 'string' && Boolean(id)))]
        : null,
      conversationSidebar,
      knowledge: {
        activeFolderId: stringOrNull(knowledge.activeFolderId),
        activePaperId: stringOrNull(knowledge.activePaperId),
        expandedFolderIds: Array.isArray(knowledge.expandedFolderIds)
          ? [...new Set(knowledge.expandedFolderIds.filter((id): id is string => typeof id === 'string' && Boolean(id)))]
          : [],
        paperViews: readPaperViews(knowledge.paperViews),
        sidebarWidth: knowledgeSidebar.width,
        sidebarCollapsed: knowledgeSidebar.collapsed
      }
    }
  } catch {
    storage.removeItem(storageKey)
    return defaults
  }
}

export function updateWorkspacePreferences(
  patch:
    | Partial<Omit<WorkspacePreferences, 'knowledge'>>
    | { knowledge: Partial<WorkspacePreferences['knowledge']> }
): WorkspacePreferences {
  const current = readWorkspacePreferences()
  const next: WorkspacePreferences = 'knowledge' in patch
    ? { ...current, knowledge: { ...current.knowledge, ...patch.knowledge } }
    : { ...current, ...patch }

  const storage = safeStorage()
  try {
    storage?.setItem(storageKey, JSON.stringify({ version: 1, ...next } satisfies StoredWorkspacePreferences))
  } catch {
    // UI preferences are optional and must never block the workspace.
  }
  return next
}
