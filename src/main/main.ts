import { app, BrowserWindow, dialog } from 'electron'
import path from 'node:path'
import { createDatabase } from './db/database'
import { createRepositories } from './db/repositories'
import { createDifyClient } from './dify/client'
import { readPaperMarkdown } from './files/importPaper'
import { registerIpc } from './ipc'
import { createElectronSecretBox } from './settings/secretBox'
import { createSettingsService } from './settings/settingsService'
import { importAndIndexPaper } from './workflows/importAndIndexPaper'
import type { AppSettings } from '../shared/types'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    title: 'ResearchNotion',
    backgroundColor: '#fbfaf8',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  const db = createDatabase(path.join(app.getPath('userData'), 'research-notion.sqlite'))
  const repos = createRepositories(db)
  const settingsService = createSettingsService(db, createElectronSecretBox())
  const userDataDir = app.getPath('userData')

  function createConfiguredDifyClient(settings: AppSettings) {
    if (!settings.difyBaseUrl || !settings.difyAppApiKey || !settings.difyKnowledgeApiKey) {
      throw new Error('请先在设置页填写 Dify 地址、App API Key 和 Knowledge API Key。')
    }
    return createDifyClient({
      baseUrl: settings.difyBaseUrl,
      appApiKey: settings.difyAppApiKey,
      knowledgeApiKey: settings.difyKnowledgeApiKey
    })
  }

  registerIpc({
    settings: {
      get: () => settingsService.get(),
      save: (settings) => settingsService.save(settings),
      testConnection: async (settings) => {
        if (!settings.difyBaseUrl || !settings.difyAppApiKey || !settings.difyKnowledgeApiKey) {
          return { ok: false, message: '请填写 Dify 地址、App API Key 和 Knowledge API Key。' }
        }
        return { ok: true, message: '配置格式完整。下一步将连接 Dify API。' }
      }
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
      }
    },
    papers: {
      list: async (folderId) => repos.papers.listByFolder(folderId),
      import: async (folderId) => {
        const result = await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [{ name: 'Papers', extensions: ['pdf', 'md', 'markdown'] }]
        })
        if (result.canceled || result.filePaths.length === 0) {
          throw new Error('已取消导入。')
        }

        const folder = repos.folders.getById(folderId)
        if (!folder) throw new Error('论文文件夹不存在。')
        if (!folder.difyDatasetId) throw new Error('当前文件夹还没有关联 Dify dataset。')

        const settings = await settingsService.get()
        return importAndIndexPaper({
          folderId,
          folderDatasetId: folder.difyDatasetId,
          sourcePath: result.filePaths[0],
          userDataDir,
          repos,
          dify: createConfiguredDifyClient(settings)
        })
      },
      read: async (paperId) => {
        const paper = repos.papers.getById(paperId)
        if (!paper) throw new Error('论文不存在。')
        return {
          paper,
          markdownText: await readPaperMarkdown(paper)
        }
      }
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
