import { ipcMain } from 'electron'
import { syncDeepseekApiKey } from './settings/modelKeySync'
import type { UserMemory, UserMemoryInput } from '../shared/types'
import type {
  ConversationListOptions,
  ConversationExportResult,
  ConversationProgressEvent,
  CreateConversationInput,
  EnvironmentStatus,
  SendMessageOptions
} from '../shared/ipcTypes'
import type {
  AppSettings,
  Conversation,
  ConversationFolder,
  Folder,
  Message,
  Paper,
  PaperCard,
  PaperOutlineItem,
  PaperSearchResult,
  ReadingState,
  ReadingStateUpdate,
  ReadingStatus
} from '../shared/types'

export type IpcServices = {
  app: {
    getEnvironmentStatus(): Promise<EnvironmentStatus>
  }
  settings: {
    get(): Promise<AppSettings>
    save(settings: AppSettings): Promise<AppSettings>
    testConnection(settings: AppSettings): Promise<{ ok: boolean; message: string }>
    switchDifyApp(mode: 'workflow' | 'agent'): Promise<{ ok: boolean; message: string; settings: AppSettings }>
  }
  folders: {
    list(): Promise<Folder[]>
    create(name: string, parentId: string | null): Promise<Folder>
    rename(folderId: string, name: string): Promise<Folder>
    delete(folderId: string): Promise<Folder>
  }
  conversationFolders: {
    list(): Promise<ConversationFolder[]>
    create(name: string): Promise<ConversationFolder>
    rename(folderId: string, name: string): Promise<ConversationFolder>
    reorder(folderIds: string[]): Promise<ConversationFolder[]>
  }
  reading: {
    updateState(input: ReadingStateUpdate): Promise<ReadingState>
  }
  memories: {
    list(): Promise<UserMemory[]>
    save(input: UserMemoryInput): Promise<UserMemory>
    delete(id: string): Promise<void>
  }
  papers: {
    list(folderId: string): Promise<Array<Paper & { card: PaperCard | null }>>
    import(folderId: string): Promise<Paper[]>
    importFiles(folderId: string, filePaths: string[]): Promise<Paper[]>
    updateReadingStatus(paperId: string, readingStatus: ReadingStatus): Promise<PaperCard>
    reindex(paperId: string): Promise<Paper>
    delete(paperId: string): Promise<Paper>
    getOutline(paperId: string): Promise<PaperOutlineItem[]>
    searchText(paperId: string, query: string): Promise<PaperSearchResult[]>
    read(paperId: string): Promise<{
      paper: Paper
      markdownText: string | null
      plainText: string | null
      previewUrl: string | null
    }>
  }
  conversations: {
    list(options?: ConversationListOptions): Promise<Conversation[]>
    create(input: CreateConversationInput): Promise<Conversation>
    rename(conversationId: string, title: string): Promise<Conversation>
    delete(conversationId: string): Promise<Conversation>
    moveToFolder(conversationId: string, conversationFolderId: string | null): Promise<Conversation>
    reorder(conversationIds: string[]): Promise<Conversation[]>
    sendMessage(
      conversationId: string,
      content: string,
      options?: SendMessageOptions,
      emitProgress?: (event: ConversationProgressEvent) => void
    ): Promise<Message>
    cancelSend(requestId: string): Promise<boolean>
    exportMarkdown(conversationId: string): Promise<ConversationExportResult>
  }
  messages: {
    list(conversationId: string): Promise<Message[]>
  }
}

export function registerIpc(services: IpcServices): void {
  ipcMain.handle('app:getEnvironmentStatus', () => services.app.getEnvironmentStatus())
  ipcMain.handle('settings:get', () => services.settings.get())
  ipcMain.handle('settings:save', async (_event, settings: AppSettings) => {
    const saved = await services.settings.save(settings)
    try {
      syncDeepseekApiKey(settings.deepseekApiKey)
    } catch (error) {
      console.error('[modelKey] sync to Dify failed (best-effort, ignored):', error)
    }
    return saved
  })
  ipcMain.handle('settings:testConnection', (_event, settings: AppSettings) => services.settings.testConnection(settings))
  ipcMain.handle('settings:switchDifyApp', (_event, input: { mode: 'workflow' | 'agent' }) => services.settings.switchDifyApp(input.mode))
  ipcMain.handle('folders:list', () => services.folders.list())
  ipcMain.handle('folders:create', (_event, input: { name: string; parentId: string | null }) =>
    services.folders.create(input.name, input.parentId)
  )
  ipcMain.handle('folders:rename', (_event, input: { folderId: string; name: string }) =>
    services.folders.rename(input.folderId, input.name)
  )
  ipcMain.handle('folders:delete', (_event, input: { folderId: string }) => services.folders.delete(input.folderId))
  ipcMain.handle('conversationFolders:list', () => services.conversationFolders.list())
  ipcMain.handle('conversationFolders:create', (_event, input: { name: string }) => services.conversationFolders.create(input.name))
  ipcMain.handle('conversationFolders:rename', (_event, input: { folderId: string; name: string }) =>
    services.conversationFolders.rename(input.folderId, input.name)
  )
  ipcMain.handle('conversationFolders:reorder', (_event, input: { folderIds: string[] }) =>
    services.conversationFolders.reorder(input.folderIds)
  )
  ipcMain.handle('reading:updateState', (_event, input: ReadingStateUpdate) => services.reading.updateState(input))
  ipcMain.handle('memories:list', () => Promise.resolve(services.memories.list()))
  ipcMain.handle('memories:save', (_event, input: UserMemoryInput) => Promise.resolve(services.memories.save(input)))
  ipcMain.handle('memories:delete', (_event, input: { id: string }) => {
    services.memories.delete(input.id)
    return Promise.resolve()
  })
  ipcMain.handle('papers:list', (_event, input: { folderId: string }) => services.papers.list(input.folderId))
  ipcMain.handle('papers:import', (_event, input: { folderId: string }) => services.papers.import(input.folderId))
  ipcMain.handle('papers:importFiles', (_event, input: { folderId: string; filePaths: string[] }) =>
    services.papers.importFiles(input.folderId, input.filePaths)
  )
  ipcMain.handle('papers:updateReadingStatus', (_event, input: { paperId: string; readingStatus: ReadingStatus }) =>
    services.papers.updateReadingStatus(input.paperId, input.readingStatus)
  )
  ipcMain.handle('papers:reindex', (_event, input: { paperId: string }) => services.papers.reindex(input.paperId))
  ipcMain.handle('papers:delete', (_event, input: { paperId: string }) => services.papers.delete(input.paperId))
  ipcMain.handle('papers:getOutline', (_event, input: { paperId: string }) => services.papers.getOutline(input.paperId))
  ipcMain.handle('papers:searchText', (_event, input: { paperId: string; query: string }) =>
    services.papers.searchText(input.paperId, input.query)
  )
  ipcMain.handle('papers:read', (_event, input: { paperId: string }) => services.papers.read(input.paperId))
  ipcMain.handle('conversations:list', (_event, input?: ConversationListOptions) => services.conversations.list(input))
  ipcMain.handle('conversations:create', (_event, input: CreateConversationInput) => services.conversations.create(input))
  ipcMain.handle('conversations:rename', (_event, input: { conversationId: string; title: string }) =>
    services.conversations.rename(input.conversationId, input.title)
  )
  ipcMain.handle('conversations:delete', (_event, input: { conversationId: string }) =>
    services.conversations.delete(input.conversationId)
  )
  ipcMain.handle(
    'conversations:moveToFolder',
    (_event, input: { conversationId: string; conversationFolderId: string | null }) =>
      services.conversations.moveToFolder(input.conversationId, input.conversationFolderId)
  )
  ipcMain.handle('conversations:reorder', (_event, input: { conversationIds: string[] }) =>
    services.conversations.reorder(input.conversationIds)
  )
  ipcMain.handle(
    'conversations:sendMessage',
    (event, input: { conversationId: string; content: string; options?: SendMessageOptions }) =>
      services.conversations.sendMessage(input.conversationId, input.content, input.options, (progress) => {
        event.sender.send('conversations:sendProgress', progress)
      })
  )
  ipcMain.handle('conversations:cancelSend', (_event, input: { requestId: string }) =>
    services.conversations.cancelSend(input.requestId)
  )
  ipcMain.handle('conversations:exportMarkdown', (_event, input: { conversationId: string }) =>
    services.conversations.exportMarkdown(input.conversationId)
  )
  ipcMain.handle('messages:list', (_event, input: { conversationId: string }) => services.messages.list(input.conversationId))
}
