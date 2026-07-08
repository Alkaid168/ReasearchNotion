import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from '../shared/ipcTypes'
import type { AppSettings, Conversation } from '../shared/types'

const api: DesktopApi = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (settings: AppSettings) => ipcRenderer.invoke('settings:save', settings),
    testConnection: (settings: AppSettings) => ipcRenderer.invoke('settings:testConnection', settings)
  },
  folders: {
    list: () => ipcRenderer.invoke('folders:list'),
    create: (name: string, parentId: string | null) => ipcRenderer.invoke('folders:create', { name, parentId })
  },
  papers: {
    list: (folderId: string) => ipcRenderer.invoke('papers:list', { folderId }),
    import: (folderId: string) => ipcRenderer.invoke('papers:import', { folderId }),
    read: (paperId: string) => ipcRenderer.invoke('papers:read', { paperId })
  },
  conversations: {
    list: () => ipcRenderer.invoke('conversations:list'),
    create: (input: Pick<Conversation, 'title' | 'folderId' | 'context'>) => ipcRenderer.invoke('conversations:create', input),
    sendMessage: (conversationId: string, content: string) =>
      ipcRenderer.invoke('conversations:sendMessage', { conversationId, content })
  }
}

contextBridge.exposeInMainWorld('researchNotion', api)
