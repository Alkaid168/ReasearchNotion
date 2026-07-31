import type { ChatContext } from './types'

export function getContextLabel(context: ChatContext): string {
  if (context.type === 'folder') return context.folderName
  if (context.type === 'paper') return context.paperTitle
  return '未选择知识库'
}

export function isContextReadyForChat(context: ChatContext): boolean {
  return context.type === 'folder' || context.type === 'paper'
}
