import type { AppSettings, Conversation, Folder, Message, Paper, PaperCard } from './types'

export type ConnectionTestResult =
  | { ok: true; message: string }
  | { ok: false; message: string }

export type DesktopApi = {
  settings: {
    get(): Promise<AppSettings>
    save(settings: AppSettings): Promise<AppSettings>
    testConnection(settings: AppSettings): Promise<ConnectionTestResult>
  }
  folders: {
    list(): Promise<Folder[]>
    create(name: string, parentId: string | null): Promise<Folder>
  }
  papers: {
    list(folderId: string): Promise<Array<Paper & { card: PaperCard | null }>>
    import(folderId: string): Promise<Paper>
    read(paperId: string): Promise<{ paper: Paper; markdownText: string | null }>
  }
  conversations: {
    list(): Promise<Conversation[]>
    create(input: Pick<Conversation, 'title' | 'folderId' | 'context'>): Promise<Conversation>
    sendMessage(conversationId: string, content: string): Promise<Message>
  }
}
