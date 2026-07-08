import { describe, expect, it } from 'vitest'
import { getContextLabel, isContextReadyForChat } from '../../src/shared/context'
import type { ChatContext } from '../../src/shared/types'

describe('chat context helpers', () => {
  it('labels free, folder, and paper contexts', () => {
    expect(getContextLabel({ type: 'free' })).toBe('未选择知识库')
    expect(getContextLabel({ type: 'folder', folderId: 'folder-1', folderName: '毕业设计' })).toBe('毕业设计')
    expect(getContextLabel({ type: 'paper', paperId: 'paper-1', paperTitle: 'RAG Survey' })).toBe('RAG Survey')
  })

  it('requires a Dify-backed context for chat', () => {
    const freeContext: ChatContext = { type: 'free' }
    const folderContext: ChatContext = { type: 'folder', folderId: 'folder-1', folderName: '毕业设计' }
    const paperContext: ChatContext = { type: 'paper', paperId: 'paper-1', paperTitle: 'RAG Survey' }

    expect(isContextReadyForChat(freeContext)).toBe(false)
    expect(isContextReadyForChat(folderContext)).toBe(true)
    expect(isContextReadyForChat(paperContext)).toBe(true)
  })
})
