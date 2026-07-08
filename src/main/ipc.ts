import { ipcMain } from 'electron'
import type { AppSettings } from '../shared/types'

export type IpcServices = {
  settings: {
    get(): Promise<AppSettings>
    save(settings: AppSettings): Promise<AppSettings>
    testConnection(settings: AppSettings): Promise<{ ok: boolean; message: string }>
  }
}

export function registerIpc(services: IpcServices): void {
  ipcMain.handle('settings:get', () => services.settings.get())
  ipcMain.handle('settings:save', (_event, settings: AppSettings) => services.settings.save(settings))
  ipcMain.handle('settings:testConnection', (_event, settings: AppSettings) => services.settings.testConnection(settings))
}
