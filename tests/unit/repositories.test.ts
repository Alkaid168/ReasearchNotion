import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDatabase } from '../../src/main/db/database'
import { createDatabase } from '../../src/main/db/database'
import { createRepositories } from '../../src/main/db/repositories'

let tempDir = ''
let databases: AppDatabase[] = []

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'rn-db-'))
  databases = []
})

afterEach(() => {
  databases.forEach((db) => db.close())
  rmSync(tempDir, { recursive: true, force: true })
})

describe('repositories', () => {
  it('creates folders and persists Dify dataset ids', () => {
    const db = createDatabase(path.join(tempDir, 'app.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)

    const folder = repos.folders.create({ name: '毕业设计', parentId: null })
    repos.folders.setDifyDatasetId(folder.id, 'dataset-123')

    const folders = repos.folders.list()
    expect(folders).toHaveLength(1)
    expect(folders[0]).toMatchObject({ name: '毕业设计', difyDatasetId: 'dataset-123' })
  })

  it('renames paper library folders', () => {
    const db = createDatabase(path.join(tempDir, 'rename-folder.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)
    const folder = repos.folders.create({ name: '旧论文库', parentId: null })

    const renamed = repos.folders.rename(folder.id, 'RAG 论文库')

    expect(renamed).toMatchObject({ id: folder.id, name: 'RAG 论文库' })
    expect(repos.folders.getById(folder.id)?.name).toBe('RAG 论文库')
    expect(repos.folders.list()[0].name).toBe('RAG 论文库')
  })

  it('deletes paper library folders and cascades papers and cards', () => {
    const db = createDatabase(path.join(tempDir, 'delete-folder.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)
    const folder = repos.folders.create({ name: '临时论文库', parentId: null })
    const paper = repos.papers.create({
      folderId: folder.id,
      title: 'Temporary Paper',
      fileType: 'markdown',
      filePath: path.join(tempDir, 'temporary.md')
    })
    repos.paperCards.upsert({
      paperId: paper.id,
      authors: 'Demo Author',
      year: '2026',
      oneSentenceSummary: 'Temporary paper.',
      researchProblem: 'Temporary problem.',
      methodSummary: 'Temporary method.',
      contributions: [],
      keywords: [],
      readingStatus: 'reading'
    })

    const deleted = repos.folders.delete(folder.id)

    expect(deleted.folder).toMatchObject({ id: folder.id, name: '临时论文库' })
    expect(deleted.papers).toHaveLength(1)
    expect(deleted.papers[0]).toMatchObject({ id: paper.id, filePath: paper.filePath })
    expect(repos.folders.getById(folder.id)).toBeNull()
    expect(repos.papers.getById(paper.id)).toBeNull()
    expect(repos.papers.getCard(paper.id)).toBeNull()
  })

  it('creates papers and paper cards', () => {
    const db = createDatabase(path.join(tempDir, 'app.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)
    const folder = repos.folders.create({ name: 'RAG', parentId: null })

    const paper = repos.papers.create({
      folderId: folder.id,
      title: 'RAG Survey',
      fileType: 'pdf',
      filePath: path.join(tempDir, 'rag.pdf')
    })
    repos.papers.setIndexStatus(paper.id, 'indexed', 'doc-1')
    repos.paperCards.upsert({
      paperId: paper.id,
      authors: 'Lewis et al.',
      year: '2020',
      oneSentenceSummary: 'A retrieval-augmented generation paper.',
      researchProblem: 'Knowledge-intensive generation',
      methodSummary: 'Retrieve passages before generation.',
      contributions: ['Combines retrieval and generation'],
      keywords: ['RAG', 'retrieval']
    })

    const rows = repos.papers.listByFolder(folder.id)
    expect(rows[0].indexStatus).toBe('indexed')
    expect(rows[0].card?.keywords).toEqual(['RAG', 'retrieval'])
    expect(repos.papers.getByDifyDocumentId('doc-1')).toMatchObject({
      id: paper.id,
      title: 'RAG Survey'
    })
    expect(repos.papers.getByTitle('rag survey')).toMatchObject({
      id: paper.id,
      title: 'RAG Survey'
    })
    expect(repos.papers.listAll()).toEqual([
      expect.objectContaining({
        id: paper.id,
        title: 'RAG Survey',
        card: expect.objectContaining({ oneSentenceSummary: 'A retrieval-augmented generation paper.' })
      })
    ])
  })

  it('counts local data for environment status', () => {
    const db = createDatabase(path.join(tempDir, 'stats.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)
    const folder = repos.folders.create({ name: 'RAG', parentId: null })
    const indexedPaper = repos.papers.create({
      folderId: folder.id,
      title: 'RAG Survey',
      fileType: 'pdf',
      filePath: path.join(tempDir, 'rag.pdf')
    })
    repos.papers.create({
      folderId: folder.id,
      title: 'Draft Notes',
      fileType: 'markdown',
      filePath: path.join(tempDir, 'notes.md')
    })
    repos.papers.setIndexStatus(indexedPaper.id, 'indexed', 'doc-1')
    repos.paperCards.upsert({
      paperId: indexedPaper.id,
      authors: 'Lewis et al.',
      year: '2020',
      oneSentenceSummary: 'A retrieval-augmented generation paper.',
      researchProblem: 'Knowledge-intensive generation',
      methodSummary: 'Retrieve passages before generation.',
      contributions: ['Combines retrieval and generation'],
      keywords: ['RAG']
    })
    repos.conversations.create({
      title: 'RAG 问答',
      folderId: null,
      context: { type: 'free' }
    })

    expect(repos.stats.getEnvironmentCounts()).toEqual({
      folderCount: 1,
      paperCount: 2,
      pdfPaperCount: 1,
      indexedPaperCount: 1,
      cardCount: 1,
      conversationCount: 1
    })
  })

  it('updates paper card reading status', () => {
    const db = createDatabase(path.join(tempDir, 'reading-status.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)
    const folder = repos.folders.create({ name: 'RAG', parentId: null })
    const paper = repos.papers.create({
      folderId: folder.id,
      title: 'RAG Survey',
      fileType: 'markdown',
      filePath: path.join(tempDir, 'rag.md')
    })
    repos.paperCards.upsert({
      paperId: paper.id,
      authors: 'Lewis et al.',
      year: '2020',
      oneSentenceSummary: 'A retrieval-augmented generation paper.',
      researchProblem: 'Knowledge-intensive generation',
      methodSummary: 'Retrieve passages before generation.',
      contributions: [],
      keywords: ['RAG'],
      readingStatus: 'unread'
    })

    const card = repos.paperCards.updateReadingStatus(paper.id, 'finished')

    expect(card.readingStatus).toBe('finished')
    expect(repos.papers.getCard(paper.id)?.readingStatus).toBe('finished')
  })

  it('deletes a paper and cascades its generated card', () => {
    const db = createDatabase(path.join(tempDir, 'delete-paper.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)
    const folder = repos.folders.create({ name: 'RAG', parentId: null })
    const paper = repos.papers.create({
      folderId: folder.id,
      title: 'RAG Survey',
      fileType: 'markdown',
      filePath: path.join(tempDir, 'rag.md')
    })
    repos.paperCards.upsert({
      paperId: paper.id,
      authors: 'Lewis et al.',
      year: '2020',
      oneSentenceSummary: 'A retrieval-augmented generation paper.',
      researchProblem: 'Knowledge-intensive generation',
      methodSummary: 'Retrieve passages before generation.',
      contributions: [],
      keywords: ['RAG'],
      readingStatus: 'reading'
    })

    const deleted = repos.papers.delete(paper.id)

    expect(deleted).toMatchObject({ id: paper.id, filePath: paper.filePath })
    expect(repos.papers.getById(paper.id)).toBeNull()
    expect(repos.papers.getCard(paper.id)).toBeNull()
    expect(repos.papers.listByFolder(folder.id)).toEqual([])
  })

  it('creates conversations and stores messages with citations', () => {
    const db = createDatabase(path.join(tempDir, 'chat.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)

    const conversation = repos.conversations.create({
      title: 'RAG 创新点',
      folderId: null,
      context: { type: 'paper', paperId: 'paper-1', paperTitle: 'RAG Survey' }
    })
    repos.messages.create({
      conversationId: conversation.id,
      role: 'assistant',
      content: '这篇论文提出了检索增强生成。',
      citations: [{ paperId: 'paper-1', paperTitle: 'RAG Survey', snippet: 'retrieval augmented generation', score: 0.91 }]
    })

    expect(repos.conversations.list()[0]).toMatchObject({
      title: 'RAG 创新点',
      context: { type: 'paper', paperId: 'paper-1', paperTitle: 'RAG Survey' }
    })
    expect(repos.conversations.getById(conversation.id)?.id).toBe(conversation.id)
    expect(repos.messages.listByConversation(conversation.id)[0].citations[0].paperTitle).toBe('RAG Survey')
  })

  it('persists the Dify conversation id for follow-up messages', () => {
    const db = createDatabase(path.join(tempDir, 'dify-conversation-id.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)

    const conversation = repos.conversations.create({
      title: 'Memory check',
      folderId: null,
      context: { type: 'free' }
    })

    expect(conversation.difyConversationId).toBeNull()

    repos.conversations.setDifyConversationId(conversation.id, 'dify-conv-123')

    expect(repos.conversations.getById(conversation.id)).toMatchObject({
      id: conversation.id,
      difyConversationId: 'dify-conv-123'
    })
    expect(repos.conversations.list()[0]).toMatchObject({
      id: conversation.id,
      difyConversationId: 'dify-conv-123'
    })
  })

  it('creates conversation folders and lists conversations by folder', () => {
    const db = createDatabase(path.join(tempDir, 'conversation-folders.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)

    const folder = repos.conversationFolders.create('综述讨论')
    const filedConversation = repos.conversations.create({
      title: 'RAG 综述',
      folderId: null,
      conversationFolderId: folder.id,
      context: { type: 'free' }
    })
    const looseConversation = repos.conversations.create({
      title: '临时问题',
      folderId: null,
      conversationFolderId: null,
      context: { type: 'free' }
    })

    expect(repos.conversationFolders.list()).toEqual([folder])
    expect(repos.conversations.list({ conversationFolderId: folder.id })).toEqual([filedConversation])
    expect(repos.conversations.list({ conversationFolderId: null })).toEqual([looseConversation])
  })

  it('moves an existing conversation into a conversation folder', () => {
    const db = createDatabase(path.join(tempDir, 'move-conversation.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)

    const folder = repos.conversationFolders.create('实验复现')
    const conversation = repos.conversations.create({
      title: '待整理对话',
      folderId: null,
      conversationFolderId: null,
      context: { type: 'free' }
    })

    const moved = repos.conversations.moveToFolder(conversation.id, folder.id)

    expect(moved).toMatchObject({ id: conversation.id, conversationFolderId: folder.id })
    expect(repos.conversations.list({ conversationFolderId: folder.id })[0].id).toBe(conversation.id)
    expect(repos.conversations.list({ conversationFolderId: null })).toEqual([])
  })

  it('renames conversations and conversation folders', () => {
    const db = createDatabase(path.join(tempDir, 'rename-conversation.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)

    const folder = repos.conversationFolders.create('临时分类')
    const conversation = repos.conversations.create({
      title: '临时标题',
      folderId: null,
      conversationFolderId: folder.id,
      context: { type: 'free' }
    })

    const renamedFolder = repos.conversationFolders.rename(folder.id, '综述讨论')
    const renamedConversation = repos.conversations.rename(conversation.id, 'RAG 综述规划')

    expect(renamedFolder).toMatchObject({ id: folder.id, name: '综述讨论' })
    expect(renamedConversation).toMatchObject({ id: conversation.id, title: 'RAG 综述规划' })
    expect(repos.conversationFolders.list()[0].name).toBe('综述讨论')
    expect(repos.conversations.getById(conversation.id)?.title).toBe('RAG 综述规划')
  })

  it('deletes conversations and their messages', () => {
    const db = createDatabase(path.join(tempDir, 'delete-conversation.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)
    const conversation = repos.conversations.create({
      title: '临时对话',
      folderId: null,
      context: { type: 'free' }
    })
    repos.messages.create({
      conversationId: conversation.id,
      role: 'user',
      content: '你好',
      citations: []
    })

    const deleted = repos.conversations.delete(conversation.id)

    expect(deleted.id).toBe(conversation.id)
    expect(repos.conversations.getById(conversation.id)).toBeNull()
    expect(repos.messages.listByConversation(conversation.id)).toEqual([])
  })

  it('reorders conversations and conversation folders', () => {
    const db = createDatabase(path.join(tempDir, 'reorder-conversations.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)

    const firstFolder = repos.conversationFolders.create('第一组')
    const secondFolder = repos.conversationFolders.create('第二组')
    const firstConversation = repos.conversations.create({
      title: '第一条',
      folderId: null,
      conversationFolderId: null,
      context: { type: 'free' }
    })
    const secondConversation = repos.conversations.create({
      title: '第二条',
      folderId: null,
      conversationFolderId: null,
      context: { type: 'free' }
    })

    repos.conversationFolders.reorder([secondFolder.id, firstFolder.id])
    repos.conversations.reorder([firstConversation.id, secondConversation.id])

    expect(repos.conversationFolders.list().map((folder) => folder.name)).toEqual(['第二组', '第一组'])
    expect(repos.conversations.list({ conversationFolderId: null }).map((conversation) => conversation.title)).toEqual([
      '第一条',
      '第二条'
    ])
  })

  it('places moved conversations at the top of the target folder', () => {
    const db = createDatabase(path.join(tempDir, 'move-conversation-order.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)

    const folder = repos.conversationFolders.create('综述讨论')
    const existingConversation = repos.conversations.create({
      title: '已有对话',
      folderId: null,
      conversationFolderId: folder.id,
      context: { type: 'free' }
    })
    const movedConversation = repos.conversations.create({
      title: '拖入对话',
      folderId: null,
      conversationFolderId: null,
      context: { type: 'free' }
    })

    repos.conversations.moveToFolder(movedConversation.id, folder.id)

    expect(repos.conversations.list({ conversationFolderId: folder.id }).map((conversation) => conversation.id)).toEqual([
      movedConversation.id,
      existingConversation.id
    ])
  })

  it('migrates older conversation tables before using conversation folders', () => {
    const dbPath = path.join(tempDir, 'old-chat.sqlite')
    const oldDb = new Database(dbPath)
    oldDb.exec(`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        folder_id TEXT,
        context_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
    oldDb.close()

    const db = createDatabase(dbPath)
    databases.push(db)
    const columns = db.pragma('table_info(conversations)') as Array<{ name: string }>
    expect(columns.map((column) => column.name)).toContain('conversation_folder_id')

    const repos = createRepositories(db)
    const folder = repos.conversationFolders.create('旧库讨论')
    const conversation = repos.conversations.create({
      title: '迁移后的对话',
      folderId: null,
      conversationFolderId: folder.id,
      context: { type: 'free' }
    })

    expect(repos.conversations.list({ conversationFolderId: folder.id })[0].id).toBe(conversation.id)
  })

  it('migrates older conversation ordering columns', () => {
    const db = createDatabase(path.join(tempDir, 'conversation-order-migration.sqlite'))
    databases.push(db)

    const conversationColumns = db.pragma('table_info(conversations)') as Array<{ name: string }>
    const folderColumns = db.pragma('table_info(conversation_folders)') as Array<{ name: string }>

    expect(conversationColumns.map((column) => column.name)).toContain('sort_order')
    expect(folderColumns.map((column) => column.name)).toContain('sort_order')
  })

  it('migrates older conversation tables before storing Dify conversation ids', () => {
    const dbPath = path.join(tempDir, 'old-chat-dify-memory.sqlite')
    const oldDb = new Database(dbPath)
    oldDb.exec(`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        folder_id TEXT,
        context_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
    oldDb.close()

    const db = createDatabase(dbPath)
    databases.push(db)
    const columns = db.pragma('table_info(conversations)') as Array<{ name: string }>

    expect(columns.map((column) => column.name)).toContain('dify_conversation_id')
  })

  it('manages model profiles with a single active flag', () => {
    const db = createDatabase(path.join(tempDir, 'model-profiles.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)

    expect(repos.modelProfiles.list()).toEqual([])
    expect(repos.modelProfiles.getActive()).toBeNull()

    const deepseek = repos.modelProfiles.create({
      provider: 'deepseek',
      modelName: 'deepseek-chat',
      displayName: 'DeepSeek Chat',
      difyAppApiKey: 'app-deepseek',
      contextWindowTokens: 64000
    })
    const qwen = repos.modelProfiles.create({
      provider: 'qwen',
      modelName: 'qwen-max',
      displayName: 'Qwen Max',
      difyAppApiKey: 'app-qwen',
      contextWindowTokens: 32000
    })

    expect(deepseek.isActive).toBe(false)
    expect(repos.modelProfiles.list().map((profile) => profile.id)).toEqual([deepseek.id, qwen.id])

    const activated = repos.modelProfiles.setActive(qwen.id)
    expect(activated.isActive).toBe(true)
    expect(repos.modelProfiles.getActive()?.id).toBe(qwen.id)
    expect(repos.modelProfiles.getById(deepseek.id)?.isActive).toBe(false)

    const updated = repos.modelProfiles.update({
      id: deepseek.id,
      provider: 'deepseek',
      modelName: 'deepseek-reasoner',
      displayName: 'DeepSeek Reasoner',
      difyAppApiKey: 'app-deepseek-v2',
      contextWindowTokens: 64000
    })
    expect(updated.modelName).toBe('deepseek-reasoner')
    expect(updated.difyAppApiKey).toBe('app-deepseek-v2')

    repos.modelProfiles.delete(qwen.id)
    expect(repos.modelProfiles.list().map((profile) => profile.id)).toEqual([deepseek.id])
    expect(repos.modelProfiles.getActive()).toBeNull()
  })

  it('persists and reads back token usage on assistant messages', () => {
    const db = createDatabase(path.join(tempDir, 'token-usage.sqlite'))
    databases.push(db)
    const repos = createRepositories(db)

    const conversation = repos.conversations.create({
      title: '对话',
      folderId: null,
      context: { type: 'free' }
    })
    repos.messages.create({
      conversationId: conversation.id,
      role: 'user',
      content: '问题',
      citations: []
    })
    repos.messages.create({
      conversationId: conversation.id,
      role: 'assistant',
      content: '回答',
      citations: [],
      tokenUsage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 }
    })

    const messages = repos.messages.listByConversation(conversation.id)
    expect(messages).toHaveLength(2)
    expect(messages[0].tokenUsage).toBeUndefined()
    expect(messages[1].tokenUsage).toEqual({ promptTokens: 100, completionTokens: 20, totalTokens: 120 })
  })
})
