import type {
  ConversationListOptions,
  CreateConversationInput,
  DesktopApi,
  SendMessageOptions
} from '../../shared/ipcTypes'
import type { AppSettings, ChatContext, ReadingStateUpdate, ReadingStatus, UserMemoryInput } from '../../shared/types'

declare global {
  interface Window {
    researchNotion: DesktopApi
  }
}

function getBridge(): DesktopApi {
  if (!window.researchNotion) {
    throw new Error('ResearchNotion desktop bridge is not available.')
  }
  return window.researchNotion
}

export const desktopApi: DesktopApi = {
  app: {
    getEnvironmentStatus: () => getBridge().app.getEnvironmentStatus()
  },
  settings: {
    get: () => getBridge().settings.get(),
    save: (settings: AppSettings) => getBridge().settings.save(settings),
    testConnection: (settings: AppSettings) => getBridge().settings.testConnection(settings)
  },
  folders: {
    list: () => getBridge().folders.list(),
    create: (name: string, parentId: string | null) => getBridge().folders.create(name, parentId),
    rename: (folderId: string, name: string) => getBridge().folders.rename(folderId, name),
    delete: (folderId: string) => getBridge().folders.delete(folderId)
  },
  conversationFolders: {
    list: () => getBridge().conversationFolders.list(),
    create: (name: string) => getBridge().conversationFolders.create(name),
    rename: (folderId: string, name: string) => getBridge().conversationFolders.rename(folderId, name),
    reorder: (folderIds: string[]) => getBridge().conversationFolders.reorder(folderIds)
  },
  reading: {
    updateState: (input: ReadingStateUpdate) => getBridge().reading.updateState(input)
  },
  memories: {
    list: () => getBridge().memories.list(),
    save: (input: UserMemoryInput) => getBridge().memories.save(input),
    delete: (id: string) => getBridge().memories.delete(id)
  },
  papers: {
    list: (folderId: string) => getBridge().papers.list(folderId),
    import: (folderId: string) => getBridge().papers.import(folderId),
    importFiles: (folderId: string, files: File[]) => getBridge().papers.importFiles(folderId, files),
    updateReadingStatus: (paperId: string, readingStatus: ReadingStatus) =>
      getBridge().papers.updateReadingStatus(paperId, readingStatus),
    reindex: (paperId: string) => getBridge().papers.reindex(paperId),
    delete: (paperId: string) => getBridge().papers.delete(paperId),
    getOutline: (paperId: string) => getBridge().papers.getOutline(paperId),
    searchText: (paperId: string, query: string) => getBridge().papers.searchText(paperId, query),
    read: (paperId: string) => getBridge().papers.read(paperId)
  },
  conversations: {
    list: (options?: ConversationListOptions) =>
      options === undefined ? getBridge().conversations.list() : getBridge().conversations.list(options),
    create: (input: CreateConversationInput) => getBridge().conversations.create(input),
    rename: (conversationId: string, title: string) => getBridge().conversations.rename(conversationId, title),
    updateContext: (conversationId: string, context: ChatContext) =>
      getBridge().conversations.updateContext(conversationId, context),
    delete: (conversationId: string) => getBridge().conversations.delete(conversationId),
    moveToFolder: (conversationId: string, conversationFolderId: string | null) =>
      getBridge().conversations.moveToFolder(conversationId, conversationFolderId),
    reorder: (conversationIds: string[]) => getBridge().conversations.reorder(conversationIds),
    sendMessage: (conversationId: string, content: string, options?: SendMessageOptions) =>
      options === undefined
        ? getBridge().conversations.sendMessage(conversationId, content)
        : getBridge().conversations.sendMessage(conversationId, content, options),
    get cancelSend() {
      return getBridge().conversations.cancelSend
    },
    get exportMarkdown() {
      return getBridge().conversations.exportMarkdown
    },
    get onSendProgress() {
      return getBridge().conversations.onSendProgress
    }
  },
  messages: {
    list: (conversationId: string) => getBridge().messages.list(conversationId)
  }
}
