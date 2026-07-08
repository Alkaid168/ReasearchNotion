import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('researchNotion', {
  version: '0.1.0'
})
