import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  ConversationListOptions,
  ConversationProgressEvent,
  CreateConversationInput,
  DesktopApi,
  SendMessageOptions
} from '../shared/ipcTypes'
import type { AppSettings, ReadingStateUpdate, ReadingStatus, UserMemoryInput } from '../shared/types'

const api: DesktopApi = {
  app: {
    getEnvironmentStatus: () => ipcRenderer.invoke('app:getEnvironmentStatus')
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    save: (settings: AppSettings) => ipcRenderer.invoke('settings:save', settings),
    testConnection: (settings: AppSettings) => ipcRenderer.invoke('settings:testConnection', settings),
    switchDifyApp: (mode: 'workflow' | 'agent') => ipcRenderer.invoke('settings:switchDifyApp', { mode })
  },
  folders: {
    list: () => ipcRenderer.invoke('folders:list'),
    create: (name: string, parentId: string | null) => ipcRenderer.invoke('folders:create', { name, parentId }),
    rename: (folderId: string, name: string) => ipcRenderer.invoke('folders:rename', { folderId, name }),
    delete: (folderId: string) => ipcRenderer.invoke('folders:delete', { folderId })
  },
  conversationFolders: {
    list: () => ipcRenderer.invoke('conversationFolders:list'),
    create: (name: string) => ipcRenderer.invoke('conversationFolders:create', { name }),
    rename: (folderId: string, name: string) => ipcRenderer.invoke('conversationFolders:rename', { folderId, name }),
    reorder: (folderIds: string[]) => ipcRenderer.invoke('conversationFolders:reorder', { folderIds })
  },
  reading: {
    updateState: (input: ReadingStateUpdate) => ipcRenderer.invoke('reading:updateState', input)
  },
  memories: {
    list: () => ipcRenderer.invoke('memories:list'),
    save: (input: UserMemoryInput) => ipcRenderer.invoke('memories:save', input),
    delete: (id: string) => ipcRenderer.invoke('memories:delete', { id })
  },
  papers: {
    list: (folderId: string) => ipcRenderer.invoke('papers:list', { folderId }),
    import: (folderId: string) => ipcRenderer.invoke('papers:import', { folderId }),
    importFiles: (folderId: string, files: File[]) =>
      ipcRenderer.invoke('papers:importFiles', {
        folderId,
        filePaths: files.map((file) => webUtils.getPathForFile(file)).filter(Boolean)
      }),
    updateReadingStatus: (paperId: string, readingStatus: ReadingStatus) =>
      ipcRenderer.invoke('papers:updateReadingStatus', { paperId, readingStatus }),
    reindex: (paperId: string) => ipcRenderer.invoke('papers:reindex', { paperId }),
    delete: (paperId: string) => ipcRenderer.invoke('papers:delete', { paperId }),
    getOutline: (paperId: string) => ipcRenderer.invoke('papers:getOutline', { paperId }),
    searchText: (paperId: string, query: string) => ipcRenderer.invoke('papers:searchText', { paperId, query }),
    read: (paperId: string) => ipcRenderer.invoke('papers:read', { paperId })
  },
  conversations: {
    list: (options?: ConversationListOptions) =>
      options === undefined ? ipcRenderer.invoke('conversations:list') : ipcRenderer.invoke('conversations:list', options),
    create: (input: CreateConversationInput) => ipcRenderer.invoke('conversations:create', input),
    rename: (conversationId: string, title: string) => ipcRenderer.invoke('conversations:rename', { conversationId, title }),
    delete: (conversationId: string) => ipcRenderer.invoke('conversations:delete', { conversationId }),
    moveToFolder: (conversationId: string, conversationFolderId: string | null) =>
      ipcRenderer.invoke('conversations:moveToFolder', { conversationId, conversationFolderId }),
    reorder: (conversationIds: string[]) => ipcRenderer.invoke('conversations:reorder', { conversationIds }),
    sendMessage: (conversationId: string, content: string, options?: SendMessageOptions) =>
      ipcRenderer.invoke(
        'conversations:sendMessage',
        options === undefined ? { conversationId, content } : { conversationId, content, options }
      ),
    cancelSend: (requestId: string) => ipcRenderer.invoke('conversations:cancelSend', { requestId }),
    exportMarkdown: (conversationId: string) => ipcRenderer.invoke('conversations:exportMarkdown', { conversationId }),
    onSendProgress: (listener: (event: ConversationProgressEvent) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: ConversationProgressEvent) => listener(progress)
      ipcRenderer.on('conversations:sendProgress', handler)
      return () => ipcRenderer.off('conversations:sendProgress', handler)
    }
  },
  messages: {
    list: (conversationId: string) => ipcRenderer.invoke('messages:list', { conversationId })
  }
}

contextBridge.exposeInMainWorld('researchNotion', api)
