import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export const toolServiceTokenFileName = 'tool-service-token'

function normalizeToken(value: string | undefined): string | null {
  const token = value?.trim()
  return token && token.length >= 32 ? token : null
}

export async function resolveToolServiceToken(userDataDir: string, explicitToken?: string): Promise<string> {
  const configuredToken = normalizeToken(explicitToken ?? process.env.RESEARCH_NOTION_TOOL_TOKEN)
  if (configuredToken) return configuredToken

  const tokenPath = path.join(userDataDir, toolServiceTokenFileName)
  try {
    const existingToken = normalizeToken(await fs.readFile(tokenPath, 'utf8'))
    if (existingToken) return existingToken
  } catch {
    // The first desktop start has no token file yet.
  }

  const token = crypto.randomBytes(32).toString('base64url')
  await fs.mkdir(userDataDir, { recursive: true })
  await fs.writeFile(tokenPath, `${token}\n`, { encoding: 'utf8', mode: 0o600 })
  return token
}
