import { ipcMain } from 'electron'
import type { AppSettings, Conversation, Folder, Message, Paper, PaperCard } from '../shared/types'

export type IpcServices = {
  settings: {
    get(): Promise<AppSettings>
    save(settings: AppSettings): Promise<AppSettings>
    testConnection(settings: AppSettings): Promise<{ ok: boolean; message: string }>
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
  conversations?: {
    list(): Promise<Conversation[]>
    create(input: Pick<Conversation, 'title' | 'folderId' | 'context'>): Promise<Conversation>
    sendMessage(conversationId: string, content: string): Promise<Message>
  }
}

export function registerIpc(services: IpcServices): void {
  ipcMain.handle('settings:get', () => services.settings.get())
  ipcMain.handle('settings:save', (_event, settings: AppSettings) => services.settings.save(settings))
  ipcMain.handle('settings:testConnection', (_event, settings: AppSettings) => services.settings.testConnection(settings))
  ipcMain.handle('folders:list', () => services.folders.list())
  ipcMain.handle('folders:create', (_event, input: { name: string; parentId: string | null }) =>
    services.folders.create(input.name, input.parentId)
  )
  ipcMain.handle('papers:list', (_event, input: { folderId: string }) => services.papers.list(input.folderId))
  ipcMain.handle('papers:import', (_event, input: { folderId: string }) => services.papers.import(input.folderId))
  ipcMain.handle('papers:read', (_event, input: { paperId: string }) => services.papers.read(input.paperId))
}
