import { app, BrowserWindow, dialog, shell } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createDatabase } from './db/database'
import { createRepositories } from './db/repositories'
import { createOpenApiToolService } from './agentTools/openApiService'
import { createReadingStateStore } from './agentTools/readingState'
import { createAgentToolHandlers } from './agentTools/toolHandlers'
import { resolveToolServiceToken } from './agentTools/toolServiceAuth'
import { extractOutline, readPaperPages, searchPages } from './agentTools/paperText'
import { createDifyClient } from './dify/client'
import { conversationExportFilename, formatConversationMarkdown } from './conversations/exportMarkdown'
import { mapCitationsToLocalPapers, mergeCitationsWithToolInvocations } from './dify/citations'
import { DifyApiError } from './dify/errors'
import { readingStatePatchForConversationContext } from './dify/conversationRuntime'
import { buildResearchAgentInputs, buildResearchAgentQuery, formatConversationHistory } from './dify/researchAgent'
import { readPaperMarkdown, readPaperPlainText } from './files/importPaper'
import { registerIpc } from './ipc'
import { createElectronSecretBox } from './settings/secretBox'
import { createSettingsService } from './settings/settingsService'
import { createMemoriesService } from './settings/memoriesService'
import { ensureFolderDataset } from './workflows/ensureFolderDataset'
import { importAndIndexPaper, reindexPaper } from './workflows/importAndIndexPaper'
import type { AppSettings, ChatContext, ModelProfile, ModelProfileInput, Paper } from '../shared/types'

const isolatedUserDataDir = process.env.RESEARCH_NOTION_USER_DATA_DIR?.trim()
if (isolatedUserDataDir) app.setPath('userData', isolatedUserDataDir)
if (process.platform === 'win32') app.setAppUserModelId('com.researchnotion.desktop')

function safeUrl(raw: string): URL | null {
  try {
    return new URL(raw)
  } catch {
    return null
  }
}

// Desktop apps must not navigate the main window to an external URL — once the
// renderer leaves the React app the user cannot get back. Open external links
// (arXiv, Semantic Scholar, DOIs, …) in the system default browser instead and
// keep the ResearchNotion window where it is.
function openExternalLinksInSystemBrowser(window: BrowserWindow): void {
  const openExternal = (rawUrl: string): void => {
    const parsed = safeUrl(rawUrl)
    if (parsed && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
      void shell.openExternal(parsed.href)
    }
  }
  // <a target="_blank"> / window.open → system browser, no in-app popup window
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  // <a> without target tries to navigate the current window — block that and
  // allow only same-origin navigation (dev server / packaged file:// app).
  window.webContents.on('will-navigate', (event, url) => {
    const current = safeUrl(window.webContents.getURL())
    const target = safeUrl(url)
    if (!target) {
      event.preventDefault()
      return
    }
    if (current && target.origin === current.origin) return
    event.preventDefault()
    openExternal(url)
  })
}

function createWindow(): void {
  const appIconPath = path.join(process.cwd(), 'resources', 'research-notion.ico')
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    title: 'ResearchNotion',
    backgroundColor: '#fbfaf8',
    icon: appIconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  openExternalLinksInSystemBrowser(mainWindow)

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(async () => {
  const userDataDir = app.getPath('userData')
  const databasePath = path.join(userDataDir, 'research-notion.sqlite')
  const db = createDatabase(databasePath)
  const repos = createRepositories(db)
  const readingState = createReadingStateStore()
  const toolServiceToken = await resolveToolServiceToken(userDataDir)
  const settingsService = createSettingsService(db, createElectronSecretBox())
  const memoriesService = createMemoriesService(db)
  const agentToolService = createOpenApiToolService({
    tools: createAgentToolHandlers({ repos, readingState, memories: memoriesService }),
    readingState,
    authToken: toolServiceToken
  })
  const activeSendControllers = new Map<string, AbortController>()

  await agentToolService.start()
  app.on('before-quit', () => {
    void agentToolService.stop()
  })

  function createConfiguredDifyClient(settings: AppSettings) {
    if (!settings.difyBaseUrl || !settings.difyAppApiKey) {
      throw new Error('请先在设置页填写 Dify 地址和 Tool Agent App API Key。')
    }
    return createDifyClient({
      baseUrl: settings.difyBaseUrl,
      appApiKey: settings.difyAppApiKey,
      knowledgeApiKey: settings.difyKnowledgeApiKey
    })
  }

  function buildContextInventory(conversationContext: ChatContext): string | null {
    const describePaper = (paper: ReturnType<typeof repos.papers.listAll>[number], index: number) => {
      const card = paper.card
      const meta = [card?.authors, card?.year].filter(Boolean).join(' · ')
      const details = [
        `paperId=${paper.id}`,
        `folderId=${paper.folderId}`,
        `type=${paper.fileType}`,
        `index=${paper.indexStatus}`
      ].join('；')
      const lines = [`${index + 1}. ${paper.title}${meta ? `（${meta}）` : ''}`, `   ${details}`]
      if (card?.oneSentenceSummary) lines.push(`   摘要：${card.oneSentenceSummary}`)
      if (card?.researchProblem) lines.push(`   研究问题：${card.researchProblem}`)
      if (card?.methodSummary) lines.push(`   方法：${card.methodSummary}`)
      if (card?.contributions.length) lines.push(`   贡献：${card.contributions.join('；')}`)
      if (card?.keywords.length) lines.push(`   关键词：${card.keywords.join('、')}`)
      return lines.join('\n')
    }

    if (conversationContext.type === 'folder') {
      const papers = repos.papers.listByFolder(conversationContext.folderId)
      if (papers.length === 0) return null
      return papers.slice(0, 20).map(describePaper).join('\n')
    }

    if (conversationContext.type === 'paper') {
      const paper = repos.papers.getById(conversationContext.paperId)
      const card = paper ? repos.papers.getCard(paper.id) : null
      if (!paper) return null
      return [
        `论文：${paper.title}`,
        `paperId：${paper.id}`,
        `folderId：${paper.folderId}`,
        `文件类型/索引状态：${paper.fileType} / ${paper.indexStatus}`,
        card?.authors || card?.year ? `作者/年份：${[card?.authors, card?.year].filter(Boolean).join(' · ')}` : null,
        card?.oneSentenceSummary ? `摘要：${card.oneSentenceSummary}` : null,
        card?.researchProblem ? `研究问题：${card.researchProblem}` : null,
        card?.methodSummary ? `方法：${card.methodSummary}` : null,
        card?.contributions.length ? `贡献：${card.contributions.join('；')}` : null,
        card?.keywords.length ? `关键词：${card.keywords.join('、')}` : null
      ]
        .filter((part): part is string => Boolean(part))
        .join('\n')
    }

    const papers = repos.papers.listAll()
    if (papers.length === 0) return null
    return ['未限定资料，以下是全部本地论文，可用 paperId 精确读取：', papers.slice(0, 20).map(describePaper).join('\n')].join('\n')
  }

  async function importPaperFromPath(folderId: string, sourcePath: string) {
    const settings = await settingsService.get()
    const hasDifyConfig = Boolean(settings.difyBaseUrl && settings.difyAppApiKey && settings.difyKnowledgeApiKey)
    if (!hasDifyConfig) {
      return importAndIndexPaper({ folderId, sourcePath, userDataDir, repos })
    }

    const dify = createConfiguredDifyClient(settings)
    let datasetId: string | null = null
    try {
      const dataset = await ensureFolderDataset({ folderId, repos, dify })
      datasetId = dataset.datasetId
    } catch {
      datasetId = null
    }

    return importAndIndexPaper({
      folderId,
      folderDatasetId: datasetId,
      sourcePath,
      userDataDir,
      repos,
      dify
    })
  }

  async function applyActiveProfile(profileId: string): Promise<ModelProfile> {
    const profile = repos.modelProfiles.setActive(profileId)
    const current = await settingsService.get()
    await settingsService.save({
      ...current,
      difyAppApiKey: profile.difyAppApiKey,
      activeModelProfileId: profile.id
    })
    // dify conversation_id 是 app-scoped，切档（换 Dify app）后旧线程会 404，必须清。
    repos.conversations.clearDifyConversationIds()
    return profile
  }

  // 首次启动：把现有 difyAppApiKey 导入为默认 DeepSeek 档，保证向后兼容。
  // key 未变，不清 dify 线程，保留历史连续性。
  if (repos.modelProfiles.list().length === 0) {
    const seedSettings = await settingsService.get()
    if (seedSettings.difyAppApiKey) {
      const seeded = repos.modelProfiles.create({
        provider: 'deepseek',
        modelName: 'deepseek-chat',
        displayName: 'DeepSeek Chat',
        difyAppApiKey: seedSettings.difyAppApiKey,
        contextWindowTokens: 64000
      })
      repos.modelProfiles.setActive(seeded.id)
      await settingsService.save({ ...seedSettings, activeModelProfileId: seeded.id })
    }
  }

  registerIpc({
    app: {
      getEnvironmentStatus: async () => {
        const settings = await settingsService.get()
        const counts = repos.stats.getEnvironmentCounts()
        const agentToolStatus = agentToolService.getStatus()
    const difyConfigured = Boolean(settings.difyBaseUrl && settings.difyAppApiKey)
        let difyAppName: string | null = null
        let difyAppMode: string | null = null

        if (difyConfigured) {
          try {
            const appInfo = await createConfiguredDifyClient(settings).getAppInfo()
            difyAppName = appInfo.name
            difyAppMode = appInfo.mode
          } catch {
            difyAppName = null
            difyAppMode = null
          }
        }

        return {
          appVersion: app.getVersion(),
          electronVersion: process.versions.electron ?? '',
          nodeVersion: process.versions.node,
          userDataDir,
          databasePath,
          difyConfigured,
          difyAppName,
          difyAppMode,
          agentToolServiceUrl: agentToolStatus.baseUrl,
          agentToolOperationCount: agentToolStatus.operationCount,
          ...counts
        }
      }
    },
    settings: {
      get: () => settingsService.get(),
      save: (settings) => settingsService.save(settings),
      testConnection: async (settings) => {
        if (!settings.difyBaseUrl || !settings.difyAppApiKey) {
          return { ok: false, message: '请填写 Dify 地址和 Tool Agent App API Key。' }
        }
        const client = createConfiguredDifyClient(settings)
        const maxRetries = 3
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const check = await client.testConnection()
            if (check.appMode !== 'agent-chat') {
              return {
                ok: false,
                message: '当前 App 不是 ResearchNotion Tool Agent。请在 Dify 中配置 agent-chat 应用后重试。'
              }
            }
            return { ok: true, message: 'Dify Tool Agent 连接正常。' }
          } catch (error) {
            const isTransient = error instanceof DifyApiError && (error.status === 502 || error.status === 503)
            if ((isTransient || !(error instanceof DifyApiError)) && attempt < maxRetries) {
              await new Promise((r) => setTimeout(r, 5000))
              continue
            }
            if (error instanceof DifyApiError) {
              return {
                ok: false,
                message: `Dify 返回 ${error.status}，请检查服务地址和 API Key。`
              }
            }
            return { ok: false, message: '无法连接 Dify，请确认本地 Dify 正在运行。' }
          }
        }
        return { ok: false, message: 'Dify 暂不可用，请确认服务已启动。' }
      },
    },
    folders: {
      list: async () => repos.folders.list(),
      create: async (name, parentId) => {
        const folder = repos.folders.create({ name, parentId })
        const settings = await settingsService.get()
        if (!settings.difyBaseUrl || !settings.difyAppApiKey || !settings.difyKnowledgeApiKey) {
          return folder
        }
        const dataset = await createConfiguredDifyClient(settings).createDataset(name)
        repos.folders.setDifyDatasetId(folder.id, dataset.id)
        return repos.folders.getById(folder.id) ?? { ...folder, difyDatasetId: dataset.id }
      },
      rename: async (folderId, name) => repos.folders.rename(folderId, name),
      delete: async (folderId) => {
        const folder = repos.folders.getById(folderId)
        if (!folder) throw new Error('论文库不存在。')
        if (folder.difyDatasetId) {
          const settings = await settingsService.get()
          await createConfiguredDifyClient(settings).deleteDataset(folder.difyDatasetId)
        } else if (repos.papers.listByFolder(folderId).some((paper) => Boolean(paper.difyDocumentId))) {
          throw new Error('该论文库仍关联 Dify 文档，但缺少 Dify 知识库标识。请先恢复 Dify 设置后再删除。')
        }
        const deleted = repos.folders.delete(folderId)
        await Promise.all(deleted.papers.map((paper) => fs.rm(paper.filePath, { force: true })))
        return deleted.folder
      }
    },
    conversationFolders: {
      list: async () => repos.conversationFolders.list(),
      create: async (name) => repos.conversationFolders.create(name),
      rename: async (folderId, name) => repos.conversationFolders.rename(folderId, name),
      reorder: async (folderIds) => repos.conversationFolders.reorder(folderIds)
    },
    reading: {
      updateState: async (input) => readingState.update(input)
    },
    memories: {
      list: async () => memoriesService.list(),
      save: async (input) => memoriesService.save(input),
      delete: async (id) => memoriesService.delete(id)
    },
    papers: {
      list: async (folderId) => repos.papers.listByFolder(folderId),
      import: async (folderId) => {
        const result = await dialog.showOpenDialog({
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: 'Papers', extensions: ['pdf', 'md', 'markdown'] }]
        })
        if (result.canceled || result.filePaths.length === 0) {
          throw new Error('已取消导入。')
        }

        const imported: Paper[] = []
        for (const sourcePath of result.filePaths) imported.push(await importPaperFromPath(folderId, sourcePath))
        return imported
      },
      importFiles: async (folderId, filePaths) => {
        if (filePaths.length === 0) throw new Error('没有可导入的本地文件。')
        const imported: Paper[] = []
        for (const sourcePath of filePaths) imported.push(await importPaperFromPath(folderId, sourcePath))
        return imported
      },
      updateReadingStatus: async (paperId, readingStatus) => repos.paperCards.updateReadingStatus(paperId, readingStatus),
      reindex: async (paperId) => {
        const paper = repos.papers.getById(paperId)
        if (!paper) throw new Error('论文不存在。')
        const settings = await settingsService.get()
        const dify = createConfiguredDifyClient(settings)
        const dataset = await ensureFolderDataset({
          folderId: paper.folderId,
          repos,
          dify
        })
        return reindexPaper({
          paperId,
          folderDatasetId: dataset.datasetId,
          repos,
          dify
        })
      },
      delete: async (paperId) => {
        const paper = repos.papers.getById(paperId)
        if (!paper) throw new Error('论文不存在。')
        if (paper.difyDocumentId) {
          const folder = repos.folders.getById(paper.folderId)
          if (!folder?.difyDatasetId) {
            throw new Error('该论文仍关联 Dify 文档，但找不到所属论文库的 Dify 知识库标识。请先恢复 Dify 设置后再删除。')
          }
          const settings = await settingsService.get()
          await createConfiguredDifyClient(settings).deleteDocument(folder.difyDatasetId, paper.difyDocumentId)
        }
        const deleted = repos.papers.delete(paperId)
        await fs.rm(deleted.filePath, { force: true })
        return deleted
      },
      getOutline: async (paperId) => {
        const paper = repos.papers.getById(paperId)
        if (!paper) throw new Error('论文不存在。')
        return extractOutline(await readPaperPages(paper))
      },
      searchText: async (paperId, query) => {
        const paper = repos.papers.getById(paperId)
        if (!paper) throw new Error('论文不存在。')
        const normalizedQuery = query.trim()
        if (!normalizedQuery) return []
        return searchPages(await readPaperPages(paper), normalizedQuery, 24)
      },
      read: async (paperId) => {
        const paper = repos.papers.getById(paperId)
        if (!paper) throw new Error('论文不存在。')
        return {
          paper,
          markdownText: await readPaperMarkdown(paper),
          plainText: await readPaperPlainText(paper),
          previewUrl: paper.fileType === 'pdf' ? pathToFileURL(paper.filePath).toString() : null,
          pdfData: paper.fileType === 'pdf' ? await fs.readFile(paper.filePath) : null
        }
      }
    },
    conversations: {
      list: async (options) => repos.conversations.list(options),
      create: async (input) => repos.conversations.create(input),
      rename: async (conversationId, title) => repos.conversations.rename(conversationId, title),
      updateContext: async (conversationId, context) => repos.conversations.updateContext(conversationId, context),
      delete: async (conversationId) => repos.conversations.delete(conversationId),
      moveToFolder: async (conversationId, conversationFolderId) =>
        repos.conversations.moveToFolder(conversationId, conversationFolderId),
      reorder: async (conversationIds) => repos.conversations.reorder(conversationIds),
      sendMessage: async (conversationId, content, options, emitProgress) => {
        const conversation = repos.conversations.getById(conversationId)
        if (!conversation) throw new Error('对话不存在。')

        const settings = await settingsService.get()
        const progressRequestId = options?.progressRequestId?.trim()
        const abortController = progressRequestId ? new AbortController() : null
        if (progressRequestId && abortController) activeSendControllers.set(progressRequestId, abortController)
        const paper = conversation.context.type === 'paper' ? repos.papers.getById(conversation.context.paperId) : null
        const readingPatch = readingStatePatchForConversationContext({
          context: conversation.context,
          paperFolderId: paper?.folderId ?? null,
          emphasisContext: options?.emphasisContext
        })
        if (readingPatch) readingState.update(readingPatch)
        const conversationHistory = formatConversationHistory(repos.messages.listByConversation(conversationId))
        const toolInvocationCursor = agentToolService.getInvocationCursor()

        try {
          const result = await createConfiguredDifyClient(settings).sendChatMessage({
            query: buildResearchAgentQuery({
              content,
              context: conversation.context,
              emphasisContext: options?.emphasisContext,
              contextInventory: buildContextInventory(conversation.context),
              conversationHistory,
              memoriesPrefix: memoriesService.buildInjectionPrefix()
            }),
            user: 'local-user',
            inputs: buildResearchAgentInputs(conversation.context, options),
            conversationId: conversation.difyConversationId ?? undefined,
            signal: abortController?.signal,
            onProgress:
              progressRequestId && emitProgress
                ? (progress) => {
                    emitProgress({ requestId: progressRequestId, ...progress })
                  }
                : undefined
          })

          if (result.difyConversationId) {
            repos.conversations.setDifyConversationId(conversationId, result.difyConversationId)
          }

          repos.messages.create({
            conversationId,
            role: 'user',
            content,
            citations: []
          })

          const mappedCitations = mapCitationsToLocalPapers(
            result.citations,
            repos.papers.getByDifyDocumentId,
            repos.papers.getByTitle,
            repos.papers.getById
          )
          const citations = mergeCitationsWithToolInvocations(
            mappedCitations,
            agentToolService.getInvocationsAfter(toolInvocationCursor),
            repos.papers.getById
          )

          return repos.messages.create({
            conversationId,
            role: 'assistant',
            content: result.answer,
            citations
          })
        } finally {
          if (progressRequestId && activeSendControllers.get(progressRequestId) === abortController) {
            activeSendControllers.delete(progressRequestId)
          }
        }
      },
      cancelSend: async (requestId) => {
        const controller = activeSendControllers.get(requestId)
        if (!controller || controller.signal.aborted) return false
        controller.abort()
        return true
      },
      exportMarkdown: async (conversationId) => {
        const conversation = repos.conversations.getById(conversationId)
        if (!conversation) throw new Error('对话不存在。')
        const result = await dialog.showSaveDialog({
          title: '导出 Markdown 对话',
          defaultPath: conversationExportFilename(conversation.title),
          filters: [{ name: 'Markdown', extensions: ['md'] }]
        })
        if (result.canceled || !result.filePath) return { canceled: true, filePath: null }
        await fs.writeFile(result.filePath, formatConversationMarkdown(conversation, repos.messages.listByConversation(conversationId)), 'utf8')
        return { canceled: false, filePath: result.filePath }
      }
    },
    messages: {
      list: async (conversationId) => repos.messages.listByConversation(conversationId)
    },
    modelProfiles: {
      list: async () => repos.modelProfiles.list(),
      save: async (input: ModelProfileInput) => (input.id ? repos.modelProfiles.update(input) : repos.modelProfiles.create(input)),
      delete: async (id: string) => {
        const existing = repos.modelProfiles.getById(id)
        const wasActive = existing?.isActive ?? false
        repos.modelProfiles.delete(id)
        if (!wasActive) return
        const remaining = repos.modelProfiles.list()
        if (remaining.length > 0) {
          await applyActiveProfile(remaining[0].id)
        } else {
          const current = await settingsService.get()
          await settingsService.save({ ...current, activeModelProfileId: null })
        }
      },
      setActive: async (id: string) => applyActiveProfile(id)
    }
  })

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
