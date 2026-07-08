import type { DesktopApi } from '../../shared/ipcTypes'

declare global {
  interface Window {
    researchNotion: DesktopApi
  }
}

export const desktopApi: DesktopApi = window.researchNotion
