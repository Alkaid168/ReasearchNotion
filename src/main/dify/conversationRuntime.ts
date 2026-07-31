import type { ChatContext, ReadingStateUpdate } from '../../shared/types'

export function readingStatePatchForConversationContext(input: {
  context: ChatContext
  paperFolderId?: string | null
  emphasisContext?: string | null
}): ReadingStateUpdate | null {
  const selectedText = input.emphasisContext?.trim() || null

  if (input.context.type === 'folder') {
    return {
      activeFolderId: input.context.folderId,
      activePaperId: null,
      selectedText
    }
  }

  if (input.context.type === 'paper') {
    return {
      activeFolderId: input.paperFolderId ?? null,
      activePaperId: input.context.paperId,
      selectedText
    }
  }

  return {
    activeFolderId: null,
    activePaperId: null,
    selectedText: null
  }
}
