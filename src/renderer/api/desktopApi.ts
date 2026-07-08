import type { DesktopApi } from '../../shared/ipcTypes'
import type { AppSettings, Conversation } from '../../shared/types'

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
  settings: {
    get: () => getBridge().settings.get(),
    save: (settings: AppSettings) => getBridge().settings.save(settings),
    testConnection: (settings: AppSettings) => getBridge().settings.testConnection(settings)
  },
  folders: {
    list: () => getBridge().folders.list(),
    create: (name: string, parentId: string | null) => getBridge().folders.create(name, parentId)
  },
  papers: {
    list: (folderId: string) => getBridge().papers.list(folderId),
    import: (folderId: string) => getBridge().papers.import(folderId),
    read: (paperId: string) => getBridge().papers.read(paperId)
  },
  conversations: {
    list: () => getBridge().conversations.list(),
    create: (input: Pick<Conversation, 'title' | 'folderId' | 'context'>) => getBridge().conversations.create(input),
    sendMessage: (conversationId: string, content: string) =>
      getBridge().conversations.sendMessage(conversationId, content)
  }
}
