import { mkdtempSync } from 'node:fs'
import { access, readFile, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { copyPaperToStorage, ensurePapersDir, getPapersDir } from '../../src/main/files/storage'

let tempDir = ''

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'rn-storage-'))
})

afterEach(() => {
  // tempDir 由系统 tmp 清理；这里不强制删（Windows 下偶尔占用）
})

describe('storage paths', () => {
  it('getPapersDir joins userDataDir with "papers"', () => {
    expect(getPapersDir(tempDir)).toBe(path.join(tempDir, 'papers'))
  })

  it('ensurePapersDir creates the papers directory (recursive)', async () => {
    const dir = await ensurePapersDir(tempDir)
    expect(dir).toBe(path.join(tempDir, 'papers'))
    const info = await stat(dir)
    expect(info.isDirectory()).toBe(true)
  })

  it('ensurePapersDir is idempotent (second call does not throw)', async () => {
    await ensurePapersDir(tempDir)
    await expect(ensurePapersDir(tempDir)).resolves.toBe(path.join(tempDir, 'papers'))
  })
})

describe('copyPaperToStorage', () => {
  it('copies the source file to papers/<paperId><extension>', async () => {
    const src = path.join(tempDir, 'upload.pdf')
    await writeFile(src, 'fake pdf bytes')

    const target = await copyPaperToStorage({
      userDataDir: tempDir,
      sourcePath: src,
      paperId: 'paper_123',
      extension: '.pdf'
    })

    expect(target).toBe(path.join(tempDir, 'papers', 'paper_123.pdf'))
    const content = await readFile(target, 'utf8')
    expect(content).toBe('fake pdf bytes')
  })

  it('preserves markdown extension', async () => {
    const src = path.join(tempDir, 'notes.md')
    await writeFile(src, '# notes')

    const target = await copyPaperToStorage({
      userDataDir: tempDir,
      sourcePath: src,
      paperId: 'p_md',
      extension: '.md'
    })

    expect(target.endsWith('p_md.md')).toBe(true)
    await expect(access(target)).resolves.toBeUndefined()
  })
})
