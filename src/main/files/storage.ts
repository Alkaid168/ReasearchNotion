import fs from 'node:fs/promises'
import path from 'node:path'

export function getPapersDir(userDataDir: string): string {
  return path.join(userDataDir, 'papers')
}

export async function ensurePapersDir(userDataDir: string): Promise<string> {
  const dir = getPapersDir(userDataDir)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

export async function copyPaperToStorage(input: {
  userDataDir: string
  sourcePath: string
  paperId: string
  extension: string
}): Promise<string> {
  const dir = await ensurePapersDir(input.userDataDir)
  const target = path.join(dir, `${input.paperId}${input.extension}`)
  await fs.copyFile(input.sourcePath, target)
  return target
}
