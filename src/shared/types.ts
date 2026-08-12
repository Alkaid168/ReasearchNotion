export type FileType = 'pdf' | 'markdown'
export type IndexStatus = 'local-only' | 'indexing' | 'indexed' | 'failed'
export type ReadingStatus = 'unread' | 'reading' | 'finished'

export type Folder = {
  id: string
  name: string
  parentId: string | null
  difyDatasetId: string | null
  createdAt: string
  updatedAt: string
}

export type ConversationFolder = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export type Paper = {
  id: string
  folderId: string
  title: string
  fileType: FileType
  filePath: string
  difyDocumentId: string | null
  indexStatus: IndexStatus
  createdAt: string
  updatedAt: string
}

export type PaperCard = {
  id: string
  paperId: string
  authors: string
  year: string
  oneSentenceSummary: string
  researchProblem: string
  methodSummary: string
  contributions: string[]
  keywords: string[]
  readingStatus: ReadingStatus
  updatedAt: string
}

export type PaperOutlineItem = {
  level: number
  heading: string
  pageNumber: number
  preview: string
}

export type PaperSearchResult = {
  pageNumber: number
  snippet: string
  score: number
}

export type ChatContext =
  | { type: 'free' }
  | { type: 'folder'; folderId: string; folderName: string }
  | { type: 'paper'; paperId: string; paperTitle: string }

export type Conversation = {
  id: string
  title: string
  folderId: string | null
  conversationFolderId: string | null
  difyConversationId: string | null
  context: ChatContext
  createdAt: string
  updatedAt: string
}

export type Citation = {
  paperId: string | null
  paperTitle: string
  snippet: string
  score: number | null
  sourceDocumentId?: string | null
  pageNumber?: number | null
  section?: string | null
  evidenceType?: 'retrieval' | 'tool' | 'metadata'
}

export type TokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type Message = {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  citations: Citation[]
  tokenUsage?: TokenUsage
  createdAt: string
}

export type AppSettings = {
  difyBaseUrl: string
  difyAppApiKey: string
  difyKnowledgeApiKey: string
  deepseekApiKey: string
  defaultFolderId: string | null
  activeModelProfileId: string | null
}

export type ModelProvider = 'deepseek' | 'qwen' | 'zhipu'

export type ModelProfile = {
  id: string
  provider: ModelProvider
  modelName: string
  displayName: string
  difyAppApiKey: string
  contextWindowTokens: number
  isActive: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type ModelProfileInput = {
  id?: string
  provider: ModelProvider
  modelName: string
  displayName: string
  difyAppApiKey: string
  contextWindowTokens: number
}

export type UserMemoryType = 'user' | 'preference' | 'feedback' | 'project' | 'reference'

export type UserMemory = {
  id: string
  type: UserMemoryType
  name: string
  description: string
  body: string
  createdAt: string
  updatedAt: string
}

export type UserMemoryInput = {
  id?: string
  type: UserMemoryType
  name: string
  description: string
  body: string
}

export type ReadingState = {
  activeFolderId: string | null
  activePaperId: string | null
  currentPage: number
  selectedText: string | null
  updatedAt: string
}

export type ReadingStateUpdate = Partial<Pick<ReadingState, 'activeFolderId' | 'activePaperId' | 'currentPage' | 'selectedText'>>
