import { describe, expect, it } from 'vitest'
import { readingStatePatchForConversationContext } from '../../src/main/dify/conversationRuntime'

describe('conversation runtime helpers', () => {
  it('syncs a locked paper context into the agent reading state', () => {
    expect(
      readingStatePatchForConversationContext({
        context: { type: 'paper', paperId: 'paper-1', paperTitle: 'Attention Is All You Need' },
        paperFolderId: 'folder-rag',
        emphasisContext: 'Scaled dot-product attention.'
      })
    ).toEqual({
      activeFolderId: 'folder-rag',
      activePaperId: 'paper-1',
      selectedText: 'Scaled dot-product attention.'
    })
  })

  it('syncs a locked folder context without pretending a paper is open', () => {
    expect(
      readingStatePatchForConversationContext({
        context: { type: 'folder', folderId: 'folder-rag', folderName: 'RAG papers' }
      })
    ).toEqual({
      activeFolderId: 'folder-rag',
      activePaperId: null,
      selectedText: null
    })
  })

  it('clears stale paper scope for free conversations', () => {
    expect(
      readingStatePatchForConversationContext({
        context: { type: 'free' },
        emphasisContext: 'Do not clear this selection.'
      })
    ).toEqual({
      activeFolderId: null,
      activePaperId: null,
      selectedText: null
    })
  })
})
