import { app, BrowserWindow, dialog, net, protocol, shell } from 'electron'
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
import { guardPaperFactAnswer, requestsWholePaperSummary, verifyWholePaperRead } from './dify/answerGrounding'
import { mapCitationsToLocalPapers, mergeCitationsWithToolInvocations } from './dify/citations'
import { DifyApiError } from './dify/errors'
import { readingStatePatchForConversationContext } from './dify/conversationRuntime'
import { buildResearchAgentInputs, buildResearchAgentQuery, formatConversationHistory } from './dify/researchAgent'
import { readPaperMarkdown } from './files/importPaper'
import { registerIpc } from './ipc'
import { applyModelProfile } from './settings/modelKeySync'
import { createElectronSecretBox } from './settings/secretBox'
import { createSettingsService } from './settings/settingsService'
import { createMemoriesService } from './settings/memoriesService'
import { ensureFolderDataset } from './workflows/ensureFolderDataset'
import { copyPaperToFolder, importAndIndexPaper, reindexPaper } from './workflows/importAndIndexPaper'
import { buildResearchProcess, type ResearchProgressEvent } from '../shared/researchProcess'
import type { AppSettings, ChatContext, ModelProfile, ModelProfileInput, Paper } from '../shared/types'

const isolatedUserDataDir = process.env.RESEARCH_NOTION_USER_DATA_DIR?.trim()
if (isolatedUserDataDir) app.setPath('userData', isolatedUserDataDir)
if (process.platform === 'win32') app.setAppUserModelId('com.researchnotion.desktop')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'research-notion-paper',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
  }
])

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

  mainWindow.webContents.on('did-start-loading', () => {
    console.log(`[renderer] loading ${mainWindow.webContents.getURL() || '(pending URL)'}`)
  })
  mainWindow.webContents.on('did-finish-load', () => {
    console.log(`[renderer] loaded ${mainWindow.webContents.getURL()}`)
  })
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[renderer] failed to load ${validatedURL}: ${errorCode} ${errorDescription}`)
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[renderer] process exited: ${details.reason} (code ${details.exitCode})`)
  })
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level < 2) return
    console.error(`[renderer] ${message} (${sourceId}:${line})`)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    if (process.env.RESEARCH_NOTION_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(async () => {
  const userDataDir = app.getPath('userData')
  const databasePath = path.join(userDataDir, 'research-notion.sqlite')
  const db = createDatabase(databasePath)
  const repos = createRepositories(db)
  protocol.handle('research-notion-paper', (request) => {
    const requestUrl = new URL(request.url)
    const paperId = decodeURIComponent(requestUrl.pathname.replace(/^\//, ''))
    const paper = repos.papers.getById(paperId)
    if (!paper || paper.fileType !== 'pdf') {
      return new Response('Paper not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(paper.filePath).toString(), {
      headers: request.headers
    })
  })
  const readingState = createReadingStateStore()
  const toolServiceToken = await resolveToolServiceToken(userDataDir)
  const settingsService = createSettingsService(db, createElectronSecretBox())
  const memoriesService = createMemoriesService(db)
  const agentTools = createAgentToolHandlers({ repos, readingState, memories: memoriesService })
  const agentToolService = createOpenApiToolService({
    tools: agentTools,
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
      knowledgeApiKey: settings.difyKnowledgeApiKey,
      preferredResponseMode: 'streaming'
    })
  }

  function buildContextInventory(conversationContext: ChatContext): string | null {
    const describePaper = (paper: ReturnType<typeof repos.papers.listAll>[number], index: number) => {
      const card = paper.card
      const details = [
        `paperId=${paper.id}`,
        `folderId=${paper.folderId}`,
        `type=${paper.fileType}`,
        `index=${paper.indexStatus}`
      ].join('；')
      // Automatically generated card metadata is useful for navigation, but
      // authorship must never be injected as primary-source evidence.
      const lines = [`${index + 1}. ${paper.title}`, `   ${details}`]
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
    // 同步到 Dify：改 provider credentials + Tool Agent app 的 model 配置 + 清 Redis 缓存
    try {
      applyModelProfile(profile.provider, profile.llmApiKey, profile.modelName)
    } catch (error) {
      console.error('[modelProfile] sync to Dify failed (best-effort):', error)
    }
    // 切 provider 后历史是旧模型生成，清 dify 线程避免续接错乱
    repos.conversations.clearDifyConversationIds()
    const current = await settingsService.get()
    await settingsService.save({ ...current, activeModelProfileId: profile.id })
    return profile
  }

  // 首次启动：把现有 DeepSeek LLM key 导入为默认档，保证向后兼容。
  // Dify 端仍用原 DeepSeek 配置，无需 sync。
  if (repos.modelProfiles.list().length === 0) {
    const seedSettings = await settingsService.get()
    if (seedSettings.deepseekApiKey) {
      const seeded = repos.modelProfiles.create({
        provider: 'deepseek',
        modelName: 'deepseek-v4-flash',
        displayName: 'DeepSeek V4 Flash',
        llmApiKey: seedSettings.deepseekApiKey,
        contextWindowTokens: 1048576
      })
      repos.modelProfiles.setActive(seeded.id)
      await settingsService.save({ ...seedSettings, activeModelProfileId: seeded.id })
    }
  }

  async function copyPaperIntoFolder(paperId: string, targetFolderId: string) {
    const settings = await settingsService.get()
    const hasDifyConfig = Boolean(settings.difyBaseUrl && settings.difyAppApiKey && settings.difyKnowledgeApiKey)
    if (!hasDifyConfig) {
      return copyPaperToFolder({ paperId, targetFolderId, userDataDir, repos })
    }

    const dify = createConfiguredDifyClient(settings)
    let datasetId: string | null = null
    try {
      const dataset = await ensureFolderDataset({ folderId: targetFolderId, repos, dify })
      datasetId = dataset.datasetId
    } catch {
      datasetId = null
    }

    return copyPaperToFolder({
      paperId,
      targetFolderId,
      folderDatasetId: datasetId,
      userDataDir,
      repos,
      dify
    })
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
      copyToFolder: async (paperId, targetFolderId) => copyPaperIntoFolder(paperId, targetFolderId),
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
          // PDF.js renders the document directly. Extracting every page here
          // duplicated the reader work and blocked the first visible page.
          plainText: null,
          previewUrl: paper.fileType === 'pdf' ? `research-notion-paper://paper/${encodeURIComponent(paper.id)}` : null,
          // Stream PDF bytes through a local protocol instead of copying the
          // complete file through Electron IPC whenever the paper is opened.
          pdfData: null
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

        const existingMessages = repos.messages.listByConversation(conversationId)
        const regenerateMessageId = options?.regenerateMessageId?.trim() || null
        const regenerateIndex = regenerateMessageId
          ? existingMessages.findIndex((message) => message.id === regenerateMessageId)
          : -1
        const regenerateTarget = regenerateIndex >= 0 ? existingMessages[regenerateIndex] : null
        if (regenerateMessageId && (!regenerateTarget || regenerateTarget.role !== 'assistant')) {
          throw new Error('只能重新生成已有的助手回答。')
        }
        if (regenerateTarget) {
          const latestAssistant = [...existingMessages].reverse().find((message) => message.role === 'assistant')
          if (latestAssistant?.id !== regenerateTarget.id) throw new Error('只能重新生成最新一条回答。')
        }
        const previousUserMessage = regenerateTarget
          ? existingMessages.slice(0, regenerateIndex).reverse().find((message) => message.role === 'user')
          : null
        if (regenerateTarget && !previousUserMessage) throw new Error('找不到这条回答对应的问题。')
        const promptContent = previousUserMessage?.content ?? content

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
        const conversationHistory = formatConversationHistory(
          regenerateTarget
            ? existingMessages.filter(
                (message) => message.id !== regenerateTarget.id && message.id !== previousUserMessage?.id
              )
            : existingMessages
        )
        const toolInvocationCursor = agentToolService.getInvocationCursor()
        const researchStartedAt = Date.now()
        const researchEvents: ResearchProgressEvent[] = []

        try {
          const result = await createConfiguredDifyClient(settings).sendChatMessage({
            query: buildResearchAgentQuery({
              content: promptContent,
              context: conversation.context,
              emphasisContext: options?.emphasisContext,
              contextInventory: buildContextInventory(conversation.context),
              conversationHistory,
              memoriesPrefix: memoriesService.buildInjectionPrefix()
            }),
            user: 'local-user',
            inputs: buildResearchAgentInputs(conversation.context, options),
            // A regeneration starts a fresh remote branch so the previous answer
            // cannot bias its replacement. Local history is still provided above.
            conversationId: regenerateTarget ? undefined : conversation.difyConversationId ?? undefined,
            signal: abortController?.signal,
            onProgress: (progress) => {
              // researchProcess 只表达思考/工具/回答/完成叙事；usage 是 token 计量，单独走 emitProgress
              if (progress.phase !== 'usage') {
                researchEvents.push(progress as ResearchProgressEvent)
              }
              if (progressRequestId && emitProgress) emitProgress({ requestId: progressRequestId, ...progress })
            }
          })

          if (result.difyConversationId) {
            repos.conversations.setDifyConversationId(conversationId, result.difyConversationId)
          }

          if (!regenerateTarget) {
            repos.messages.create({
              conversationId,
              role: 'user',
              content: promptContent,
              citations: []
            })
          }

          const mappedCitations = mapCitationsToLocalPapers(
            result.citations,
            repos.papers.getByDifyDocumentId,
            repos.papers.getByTitle,
            repos.papers.getById
          )
          const toolInvocations = agentToolService.getInvocationsAfter(toolInvocationCursor)
          const citations = mergeCitationsWithToolInvocations(
            mappedCitations,
            toolInvocations,
            repos.papers.getById
          )
          const wholePaperReadCompleted =
            conversation.context.type === 'paper' && requestsWholePaperSummary(promptContent, conversation.context)
              ? await verifyWholePaperRead({
                  paperId: conversation.context.paperId,
                  invocations: toolInvocations,
                  readChunk: (chunkInput) => agentTools.getPaperTextChunk(chunkInput)
                })
              : undefined
          const grounded = guardPaperFactAnswer({
            question: promptContent,
            context: conversation.context,
            answer: result.answer,
            citations,
            wholePaperReadCompleted,
            allowedPaperIds:
              conversation.context.type === 'folder'
                ? repos.papers.listByFolder(conversation.context.folderId).map((candidate) => candidate.id)
                : undefined
          })

          const answerCitations = grounded.blocked ? [] : citations
          const researchProcess = buildResearchProcess({
              context: conversation.context,
              events: researchEvents,
              citations: answerCitations,
              durationMs: Date.now() - researchStartedAt,
              question: promptContent,
              answer: grounded.answer
            })
          if (regenerateTarget) {
            return repos.messages.update(regenerateTarget.id, {
              content: grounded.answer,
              citations: answerCitations,
              researchProcess
            })
          }
          return repos.messages.create({
            conversationId,
            role: 'assistant',
            content: grounded.answer,
            citations: answerCitations,
            tokenUsage: result.usage,
            researchProcess
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
      },
      compressContext: async (conversationId) => {
        const conversation = repos.conversations.getById(conversationId)
        if (!conversation) throw new Error('对话不存在。')

        const history = repos.messages.listByConversation(conversationId)
        if (history.length === 0) throw new Error('对话无历史消息可压缩。')

        const settings = await settingsService.get()
        const dify = createConfiguredDifyClient(settings)
        const formatted = history
          .map((message) => `${message.role === 'user' ? '用户' : '助手'}：${message.content}`)
          .join('\n\n')
        const summaryQuery = `请将以下对话历史总结为简洁的上下文摘要，保留关键研究事实、用户意图、已得结论，便于后续对话延续。直接输出摘要正文，不要前言或致歉：\n\n${formatted}`

        // 在新 Dify 线程发总结请求（不带 conversationId，开新线程）
        const result = await dify.sendChatMessage({
          query: summaryQuery,
          user: 'local-user',
          inputs: {}
        })

        // 把新 Dify 线程 id 挂到当前对话，后续基于摘要线程延续
        if (result.difyConversationId) {
          repos.conversations.setDifyConversationId(conversationId, result.difyConversationId)
        }

        return repos.messages.create({
          conversationId,
          role: 'assistant',
          content: `【上下文摘要】\n${result.answer}`,
          citations: [],
          tokenUsage: result.usage
        })
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
