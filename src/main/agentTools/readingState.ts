import type { ReadingState, ReadingStateUpdate } from '../../shared/types'

export type ReadingStateStore = {
  get(): ReadingState
  update(patch: ReadingStateUpdate): ReadingState
}

function normalizePage(page: number | undefined): number | undefined {
  if (page === undefined) return undefined
  if (!Number.isFinite(page)) return 1
  return Math.max(1, Math.floor(page))
}

export function createReadingStateStore(): ReadingStateStore {
  let state: ReadingState = {
    activeFolderId: null,
    activePaperId: null,
    currentPage: 1,
    selectedText: null,
    updatedAt: new Date().toISOString()
  }

  return {
    get: () => state,
    update: (patch) => {
      const currentPage = normalizePage(patch.currentPage)
      state = {
        ...state,
        ...patch,
        currentPage: currentPage ?? state.currentPage,
        selectedText: patch.selectedText?.trim() || patch.selectedText === null ? patch.selectedText : state.selectedText,
        updatedAt: new Date().toISOString()
      }
      return state
    }
  }
}
