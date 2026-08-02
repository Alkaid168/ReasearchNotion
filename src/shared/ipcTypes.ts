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
  ReadingStatus,
  UserMemory,
  UserMemoryInput
} from './types'

export type SendMessageOptions = {
  emphasisContext?: string | null
  progressRequestId?: string | null
}

export type ConversationProgressEvent = {
  requestId: string
  phase: 'tool' | 'answer' | 'delta' | 'done'
  label: string
  toolName?: string
  delta?: string
  replaceAnswer?: boolean
}

export type ConversationExportResult = {
  canceled: boolean
  filePath: string | null
}

export type ConnectionTestResult =
  | { ok: true; message: string }
  | { ok: false; message: string }

export type ConversationListOptions = {
  conversationFolderId?: string | null
}

export type CreateConversationInput = Pick<Conversation, 'title' | 'folderId' | 'context'> & {
  conversationFolderId?: string | null
}

export type EnvironmentStatus = {
  appVersion: string
  electronVersion: string
  nodeVersion: string
  userDataDir: string
  databasePath: string
  difyConfigured: boolean
  difyAppName: string | null
  difyAppMode: string | null
  agentToolServiceUrl: string | null
  agentToolOperationCount: number
  folderCount: number
  paperCount: number
  pdfPaperCount: number
  indexedPaperCount: number
  cardCount: number
  conversationCount: number
}

export type DesktopApi = {
  app: {
    getEnvironmentStatus(): Promise<EnvironmentStatus>
  }
  settings: {
    get(): Promise<AppSettings>
    save(settings: AppSettings): Promise<AppSettings>
    testConnection(settings: AppSettings): Promise<ConnectionTestResult>
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
    importFiles(folderId: string, files: File[]): Promise<Paper[]>
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
      pdfData: Uint8Array | null
    }>
  }
  conversations: {
    list(options?: ConversationListOptions): Promise<Conversation[]>
    create(input: CreateConversationInput): Promise<Conversation>
    rename(conversationId: string, title: string): Promise<Conversation>
    delete(conversationId: string): Promise<Conversation>
    moveToFolder(conversationId: string, conversationFolderId: string | null): Promise<Conversation>
    reorder(conversationIds: string[]): Promise<Conversation[]>
    sendMessage(conversationId: string, content: string, options?: SendMessageOptions): Promise<Message>
    cancelSend?(requestId: string): Promise<boolean>
    exportMarkdown?(conversationId: string): Promise<ConversationExportResult>
    onSendProgress?(listener: (event: ConversationProgressEvent) => void): () => void
  }
  messages: {
    list(conversationId: string): Promise<Message[]>
  }
}
