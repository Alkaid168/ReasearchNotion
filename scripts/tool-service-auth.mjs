import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const toolServiceTokenFileName = 'tool-service-token'
export const toolServiceTokenHeader = 'X-ResearchNotion-Tool-Token'

function candidateUserDataDirectories() {
  const appDataDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  return [
    process.env.RESEARCH_NOTION_USER_DATA_DIR,
    path.join(appDataDir, 'research-notion'),
    path.join(appDataDir, 'ResearchNotion')
  ].filter(Boolean)
}

export function readToolServiceToken() {
  const configured = process.env.RESEARCH_NOTION_TOOL_TOKEN?.trim()
  if (configured && configured.length >= 32) return configured

  for (const directory of candidateUserDataDirectories()) {
    const tokenPath = path.join(directory, toolServiceTokenFileName)
    try {
      const token = fs.readFileSync(tokenPath, 'utf8').trim()
      if (token.length >= 32) return token
    } catch {
      // Try the next user-data location.
    }
  }

  throw new Error('ResearchNotion tool service token was not found. Start the desktop app once before importing or testing Dify tools.')
}

export function toolServiceHeaders() {
  return { [toolServiceTokenHeader]: readToolServiceToken() }
}
