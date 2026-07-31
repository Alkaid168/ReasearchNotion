import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppDatabase } from '../../src/main/db/database'
import { createDatabase } from '../../src/main/db/database'
import { createRepositories } from '../../src/main/db/repositories'
import { ensureFolderDataset } from '../../src/main/workflows/ensureFolderDataset'

let tempDir = ''
let databases: AppDatabase[] = []

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'rn-folder-dataset-'))
  databases = []
})

afterEach(() => {
  databases.forEach((db) => db.close())
  rmSync(tempDir, { recursive: true, force: true })
})

describe('ensure folder dataset workflow', () => {
  it('returns the existing dataset id without creating a duplicate dataset', async () => {
    const db = createDatabase(path.join(tempDir, 'existing.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)
    const folder = repos.folders.create({ name: 'RAG 论文库', parentId: null })
    repos.folders.setDifyDatasetId(folder.id, 'dataset-existing')
    const createDataset = vi.fn()

    await expect(
      ensureFolderDataset({
        folderId: folder.id,
        repos,
        dify: { createDataset }
      })
    ).resolves.toEqual({
      folder: expect.objectContaining({ id: folder.id }),
      datasetId: 'dataset-existing'
    })

    expect(createDataset).not.toHaveBeenCalled()
  })

  it('creates and persists a Dify dataset when the folder is missing one', async () => {
    const db = createDatabase(path.join(tempDir, 'missing.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)
    const folder = repos.folders.create({ name: '写作参考', parentId: null })
    const createDataset = vi.fn().mockResolvedValue({ id: 'dataset-created', name: folder.name })

    await expect(
      ensureFolderDataset({
        folderId: folder.id,
        repos,
        dify: { createDataset }
      })
    ).resolves.toEqual({
      folder: expect.objectContaining({ id: folder.id }),
      datasetId: 'dataset-created'
    })

    expect(createDataset).toHaveBeenCalledWith('写作参考')
    expect(repos.folders.getById(folder.id)?.difyDatasetId).toBe('dataset-created')
  })

  it('rejects when the paper folder does not exist', async () => {
    const db = createDatabase(path.join(tempDir, 'missing-folder.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)

    await expect(
      ensureFolderDataset({
        folderId: 'folder-missing',
        repos,
        dify: { createDataset: vi.fn() }
      })
    ).rejects.toThrow('论文文件夹不存在。')
  })
})
