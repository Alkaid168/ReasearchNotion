import type { Folder } from '../../shared/types'
import type { createRepositories } from '../db/repositories'

type EnsureFolderDatasetInput = {
  folderId: string
  repos: ReturnType<typeof createRepositories>
  dify: {
    createDataset(name: string): Promise<{ id: string; name: string }>
  }
}

type EnsureFolderDatasetResult = {
  folder: Folder
  datasetId: string
}

export async function ensureFolderDataset(input: EnsureFolderDatasetInput): Promise<EnsureFolderDatasetResult> {
  const folder = input.repos.folders.getById(input.folderId)
  if (!folder) throw new Error('论文文件夹不存在。')
  if (folder.difyDatasetId) return { folder, datasetId: folder.difyDatasetId }

  const dataset = await input.dify.createDataset(folder.name)
  input.repos.folders.setDifyDatasetId(folder.id, dataset.id)
  return {
    folder: input.repos.folders.getById(folder.id) ?? { ...folder, difyDatasetId: dataset.id },
    datasetId: dataset.id
  }
}
