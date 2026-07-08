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

export type ChatContext =
  | { type: 'free' }
  | { type: 'folder'; folderId: string; folderName: string }
  | { type: 'paper'; paperId: string; paperTitle: string }

export type Conversation = {
  id: string
  title: string
  folderId: string | null
  context: ChatContext
  createdAt: string
  updatedAt: string
}

export type Citation = {
  paperId: string | null
  paperTitle: string
  snippet: string
  score: number | null
}

export type Message = {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  citations: Citation[]
  createdAt: string
}

export type AppSettings = {
  difyBaseUrl: string
  difyAppApiKey: string
  difyKnowledgeApiKey: string
  defaultFolderId: string | null
}
