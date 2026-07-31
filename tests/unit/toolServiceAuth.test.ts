import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveToolServiceToken, toolServiceTokenFileName } from '../../src/main/agentTools/toolServiceAuth'

const temporaryDirectories: string[] = []

async function temporaryUserDataDir(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'research-notion-tool-token-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

describe('tool service authentication token', () => {
  it('creates a durable opaque token in the desktop user-data directory', async () => {
    const userDataDir = await temporaryUserDataDir()

    const first = await resolveToolServiceToken(userDataDir)
    const second = await resolveToolServiceToken(userDataDir)

    expect(first).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    expect(second).toBe(first)
    expect(await fs.readFile(path.join(userDataDir, toolServiceTokenFileName), 'utf8')).toBe(`${first}\n`)
  })

  it('uses an explicit process token without replacing the persisted token', async () => {
    const userDataDir = await temporaryUserDataDir()
    const persisted = await resolveToolServiceToken(userDataDir)
    const explicit = 'explicit-tool-service-token-for-test-123456789'

    expect(await resolveToolServiceToken(userDataDir, explicit)).toBe(explicit)
    expect(await resolveToolServiceToken(userDataDir)).toBe(persisted)
  })
})
