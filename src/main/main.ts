import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import { createDatabase } from './db/database'
import { registerIpc } from './ipc'
import { createElectronSecretBox } from './settings/secretBox'
import { createSettingsService } from './settings/settingsService'

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
  const settingsService = createSettingsService(db, createElectronSecretBox())

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
