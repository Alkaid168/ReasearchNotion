import crypto from 'node:crypto'
import type Database from 'better-sqlite3'
import type {
  Citation,
  ChatContext,
  Conversation,
  ConversationFolder,
  FileType,
  Folder,
  IndexStatus,
  Message,
  Paper,
  PaperCard,
  ReadingStatus
} from '../../shared/types'

function now(): string {
  return new Date().toISOString()
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

type CreateFolderInput = { name: string; parentId: string | null }
type CreatePaperInput = { folderId: string; title: string; fileType: FileType; filePath: string }
type PaperCardInput = Omit<PaperCard, 'id' | 'updatedAt' | 'readingStatus'> & { readingStatus?: PaperCard['readingStatus'] }
type CreateConversationInput = Pick<Conversation, 'title' | 'folderId' | 'context'> & {
  conversationFolderId?: string | null
}
type ListConversationsOptions = { conversationFolderId?: string | null }
type CreateMessageInput = Pick<Message, 'conversationId' | 'role' | 'content' | 'citations'>

export function createRepositories(db: Database.Database) {
  function nextFolderSortOrder(): number {
    const row = db.prepare(`SELECT MAX(sort_order) as sortOrder FROM conversation_folders`).get() as
      | { sortOrder: number | null }
      | undefined
    return typeof row?.sortOrder === 'number' ? row.sortOrder + 1 : 0
  }

  function topConversationSortOrder(conversationFolderId: string | null): number {
    const row = (
      conversationFolderId
        ? db.prepare(`SELECT MIN(sort_order) as sortOrder FROM conversations WHERE conversation_folder_id = ?`).get(conversationFolderId)
        : db.prepare(`SELECT MIN(sort_order) as sortOrder FROM conversations WHERE conversation_folder_id IS NULL`).get()
    ) as { sortOrder: number | null } | undefined
    return typeof row?.sortOrder === 'number' ? row.sortOrder - 1 : 0
  }

  function reorderRows(tableName: 'conversation_folders' | 'conversations', ids: string[]): void {
    const timestamp = now()
    const update = db.prepare(`UPDATE ${tableName} SET sort_order = ?, updated_at = ? WHERE id = ?`)
    const applyOrder = db.transaction((orderedIds: string[]) => {
      orderedIds.forEach((rowId, index) => update.run(index, timestamp, rowId))
    })
    applyOrder(ids)
  }

  function getFolder(folderId: string): Folder | null {
    const row = db
      .prepare(
        `SELECT id, name, parent_id as parentId, dify_dataset_id as difyDatasetId,
                created_at as createdAt, updated_at as updatedAt
         FROM folders WHERE id = ?`
      )
      .get(folderId) as Folder | undefined
    return row ?? null
  }

  function getPaper(paperId: string): Paper | null {
    const row = db
      .prepare(
        `SELECT id, folder_id as folderId, title, file_type as fileType, file_path as filePath,
                dify_document_id as difyDocumentId, index_status as indexStatus,
                created_at as createdAt, updated_at as updatedAt
         FROM papers WHERE id = ?`
      )
      .get(paperId) as Paper | undefined
    return row ?? null
  }

  function getCard(paperId: string): PaperCard | null {
    const row = db
      .prepare(
        `SELECT id, paper_id as paperId, authors, year, one_sentence_summary as oneSentenceSummary,
                research_problem as researchProblem, method_summary as methodSummary,
                contributions_json as contributionsJson, keywords_json as keywordsJson,
                reading_status as readingStatus, updated_at as updatedAt
         FROM paper_cards WHERE paper_id = ?`
      )
      .get(paperId) as
      | (Omit<PaperCard, 'contributions' | 'keywords'> & { contributionsJson: string; keywordsJson: string })
      | undefined
    if (!row) return null
    return {
      ...row,
      contributions: JSON.parse(row.contributionsJson) as string[],
      keywords: JSON.parse(row.keywordsJson) as string[]
    }
  }

  function mapConversation(row: Omit<Conversation, 'context'> & { contextJson: string }): Conversation {
    const { contextJson, ...conversation } = row
    return {
      ...conversation,
      context: JSON.parse(contextJson) as ChatContext
    }
  }

  function getConversation(conversationId: string): Conversation | null {
    const row = db
      .prepare(
        `SELECT id, title, folder_id as folderId, conversation_folder_id as conversationFolderId,
                dify_conversation_id as difyConversationId, context_json as contextJson,
                created_at as createdAt, updated_at as updatedAt
         FROM conversations WHERE id = ?`
      )
      .get(conversationId) as (Omit<Conversation, 'context'> & { contextJson: string }) | undefined
    return row ? mapConversation(row) : null
  }

  function mapMessage(row: Omit<Message, 'citations'> & { citationsJson: string }): Message {
    return {
      ...row,
      citations: JSON.parse(row.citationsJson) as Citation[]
    }
  }

  return {
    stats: {
      getEnvironmentCounts(): {
        folderCount: number
        paperCount: number
        pdfPaperCount: number
        indexedPaperCount: number
        cardCount: number
        conversationCount: number
      } {
        const folderCount = db.prepare(`SELECT COUNT(*) as count FROM folders`).get() as { count: number }
        const paperCount = db.prepare(`SELECT COUNT(*) as count FROM papers`).get() as { count: number }
        const pdfPaperCount = db.prepare(`SELECT COUNT(*) as count FROM papers WHERE file_type = 'pdf'`).get() as {
          count: number
        }
        const indexedPaperCount = db.prepare(`SELECT COUNT(*) as count FROM papers WHERE index_status = 'indexed'`).get() as {
          count: number
        }
        const cardCount = db.prepare(`SELECT COUNT(*) as count FROM paper_cards`).get() as { count: number }
        const conversationCount = db.prepare(`SELECT COUNT(*) as count FROM conversations`).get() as { count: number }

        return {
          folderCount: folderCount.count,
          paperCount: paperCount.count,
          pdfPaperCount: pdfPaperCount.count,
          indexedPaperCount: indexedPaperCount.count,
          cardCount: cardCount.count,
          conversationCount: conversationCount.count
        }
      }
    },
    folders: {
      create(input: CreateFolderInput): Folder {
        const timestamp = now()
        const row: Folder = {
          id: id('folder'),
          name: input.name,
          parentId: input.parentId,
          difyDatasetId: null,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        db.prepare(
          `INSERT INTO folders (id, name, parent_id, dify_dataset_id, created_at, updated_at)
           VALUES (@id, @name, @parentId, @difyDatasetId, @createdAt, @updatedAt)`
        ).run(row)
        return row
      },
      list(): Folder[] {
        return db
          .prepare(
            `SELECT id, name, parent_id as parentId, dify_dataset_id as difyDatasetId,
                    created_at as createdAt, updated_at as updatedAt
             FROM folders ORDER BY created_at ASC`
          )
          .all() as Folder[]
      },
      getById(folderId: string): Folder | null {
        return getFolder(folderId)
      },
      rename(folderId: string, name: string): Folder {
        db.prepare(`UPDATE folders SET name = ?, updated_at = ? WHERE id = ?`).run(name, now(), folderId)
        const folder = getFolder(folderId)
        if (!folder) throw new Error('论文库不存在。')
        return folder
      },
      delete(folderId: string): { folder: Folder; papers: Paper[] } {
        const folder = getFolder(folderId)
        if (!folder) throw new Error('论文库不存在。')
        const papers = db
          .prepare(
            `SELECT id, folder_id as folderId, title, file_type as fileType, file_path as filePath,
                    dify_document_id as difyDocumentId, index_status as indexStatus,
                    created_at as createdAt, updated_at as updatedAt
             FROM papers WHERE folder_id = ? ORDER BY created_at DESC`
          )
          .all(folderId) as Paper[]
        db.prepare(`DELETE FROM folders WHERE id = ?`).run(folderId)
        return { folder, papers }
      },
      setDifyDatasetId(folderId: string, datasetId: string): void {
        db.prepare(`UPDATE folders SET dify_dataset_id = ?, updated_at = ? WHERE id = ?`).run(datasetId, now(), folderId)
      }
    },
    conversationFolders: {
      create(name: string): ConversationFolder {
        const timestamp = now()
        const row: ConversationFolder = {
          id: id('conversation_folder'),
          name,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        db.prepare(
          `INSERT INTO conversation_folders (id, name, sort_order, created_at, updated_at)
           VALUES (@id, @name, @sortOrder, @createdAt, @updatedAt)`
        ).run({ ...row, sortOrder: nextFolderSortOrder() })
        return row
      },
      list(): ConversationFolder[] {
        return db
          .prepare(
            `SELECT id, name, created_at as createdAt, updated_at as updatedAt
             FROM conversation_folders ORDER BY sort_order ASC, created_at ASC`
          )
          .all() as ConversationFolder[]
      },
      rename(folderId: string, name: string): ConversationFolder {
        db.prepare(`UPDATE conversation_folders SET name = ?, updated_at = ? WHERE id = ?`).run(name, now(), folderId)
        const folder = db
          .prepare(
            `SELECT id, name, created_at as createdAt, updated_at as updatedAt
             FROM conversation_folders WHERE id = ?`
          )
          .get(folderId) as ConversationFolder | undefined
        if (!folder) throw new Error('对话文件夹不存在。')
        return folder
      },
      reorder(folderIds: string[]): ConversationFolder[] {
        reorderRows('conversation_folders', folderIds)
        return this.list()
      }
    },
    papers: {
      create(input: CreatePaperInput): Paper {
        const timestamp = now()
        const row: Paper = {
          id: id('paper'),
          folderId: input.folderId,
          title: input.title,
          fileType: input.fileType,
          filePath: input.filePath,
          difyDocumentId: null,
          indexStatus: 'local-only',
          createdAt: timestamp,
          updatedAt: timestamp
        }
        db.prepare(
          `INSERT INTO papers (id, folder_id, title, file_type, file_path, dify_document_id, index_status, created_at, updated_at)
           VALUES (@id, @folderId, @title, @fileType, @filePath, @difyDocumentId, @indexStatus, @createdAt, @updatedAt)`
        ).run(row)
        return row
      },
      setIndexStatus(paperId: string, status: IndexStatus, difyDocumentId: string | null): void {
        db.prepare(`UPDATE papers SET index_status = ?, dify_document_id = ?, updated_at = ? WHERE id = ?`).run(
          status,
          difyDocumentId,
          now(),
          paperId
        )
      },
      updateFilePath(paperId: string, filePath: string): void {
        db.prepare(`UPDATE papers SET file_path = ?, updated_at = ? WHERE id = ?`).run(filePath, now(), paperId)
      },
      getById(paperId: string): Paper | null {
        return getPaper(paperId)
      },
      getByDifyDocumentId(difyDocumentId: string): Paper | null {
        const row = db
          .prepare(
            `SELECT id, folder_id as folderId, title, file_type as fileType, file_path as filePath,
                    dify_document_id as difyDocumentId, index_status as indexStatus,
                    created_at as createdAt, updated_at as updatedAt
             FROM papers WHERE dify_document_id = ?`
          )
          .get(difyDocumentId) as Paper | undefined
        return row ?? null
      },
      getByTitle(title: string): Paper | null {
        const row = db
          .prepare(
            `SELECT id, folder_id as folderId, title, file_type as fileType, file_path as filePath,
                    dify_document_id as difyDocumentId, index_status as indexStatus,
                    created_at as createdAt, updated_at as updatedAt
             FROM papers WHERE lower(title) = lower(?) ORDER BY created_at DESC LIMIT 1`
          )
          .get(title.trim()) as Paper | undefined
        return row ?? null
      },
      listAll(): Array<Paper & { card: PaperCard | null }> {
        const papers = db
          .prepare(
            `SELECT id, folder_id as folderId, title, file_type as fileType, file_path as filePath,
                    dify_document_id as difyDocumentId, index_status as indexStatus,
                    created_at as createdAt, updated_at as updatedAt
             FROM papers ORDER BY created_at DESC`
          )
          .all() as Paper[]
        return papers.map((paper) => ({ ...paper, card: getCard(paper.id) }))
      },
      delete(paperId: string): Paper {
        const paper = getPaper(paperId)
        if (!paper) throw new Error('论文不存在。')
        db.prepare(`DELETE FROM papers WHERE id = ?`).run(paperId)
        return paper
      },
      listByFolder(folderId: string): Array<Paper & { card: PaperCard | null }> {
        const papers = db
          .prepare(
            `SELECT id, folder_id as folderId, title, file_type as fileType, file_path as filePath,
                    dify_document_id as difyDocumentId, index_status as indexStatus,
                    created_at as createdAt, updated_at as updatedAt
             FROM papers WHERE folder_id = ? ORDER BY created_at DESC`
          )
          .all(folderId) as Paper[]
        return papers.map((paper) => ({ ...paper, card: getCard(paper.id) }))
      },
      getCard(paperId: string): PaperCard | null {
        return getCard(paperId)
      }
    },
    paperCards: {
      updateReadingStatus(paperId: string, readingStatus: ReadingStatus): PaperCard {
        db.prepare(`UPDATE paper_cards SET reading_status = ?, updated_at = ? WHERE paper_id = ?`).run(
          readingStatus,
          now(),
          paperId
        )
        const card = getCard(paperId)
        if (!card) throw new Error('论文卡片不存在。')
        return card
      },
      upsert(input: PaperCardInput): PaperCard {
        const row: PaperCard = {
          id: id('card'),
          paperId: input.paperId,
          authors: input.authors,
          year: input.year,
          oneSentenceSummary: input.oneSentenceSummary,
          researchProblem: input.researchProblem,
          methodSummary: input.methodSummary,
          contributions: input.contributions,
          keywords: input.keywords,
          readingStatus: input.readingStatus ?? 'unread',
          updatedAt: now()
        }
        db.prepare(
          `INSERT INTO paper_cards
             (id, paper_id, authors, year, one_sentence_summary, research_problem, method_summary,
              contributions_json, keywords_json, reading_status, updated_at)
           VALUES
             (@id, @paperId, @authors, @year, @oneSentenceSummary, @researchProblem, @methodSummary,
              @contributionsJson, @keywordsJson, @readingStatus, @updatedAt)
           ON CONFLICT(paper_id) DO UPDATE SET
             authors = excluded.authors,
             year = excluded.year,
             one_sentence_summary = excluded.one_sentence_summary,
             research_problem = excluded.research_problem,
             method_summary = excluded.method_summary,
             contributions_json = excluded.contributions_json,
             keywords_json = excluded.keywords_json,
             reading_status = excluded.reading_status,
             updated_at = excluded.updated_at`
        ).run({
          ...row,
          contributionsJson: JSON.stringify(row.contributions),
          keywordsJson: JSON.stringify(row.keywords)
        })
        return row
      }
    },
    conversations: {
      create(input: CreateConversationInput): Conversation {
        const timestamp = now()
        const row: Conversation = {
          id: id('conversation'),
          title: input.title,
          folderId: input.folderId,
          conversationFolderId: input.conversationFolderId ?? null,
          difyConversationId: null,
          context: input.context,
          createdAt: timestamp,
          updatedAt: timestamp
        }
        db.prepare(
          `INSERT INTO conversations
             (id, title, folder_id, conversation_folder_id, dify_conversation_id, context_json, sort_order, created_at, updated_at)
           VALUES
             (@id, @title, @folderId, @conversationFolderId, @difyConversationId, @contextJson, @sortOrder, @createdAt, @updatedAt)`
        ).run({
          ...row,
          contextJson: JSON.stringify(row.context),
          sortOrder: topConversationSortOrder(row.conversationFolderId)
        })
        return row
      },
      list(options: ListConversationsOptions = {}): Conversation[] {
        const baseSelect = `SELECT id, title, folder_id as folderId, conversation_folder_id as conversationFolderId,
                                  dify_conversation_id as difyConversationId, context_json as contextJson,
                                  created_at as createdAt, updated_at as updatedAt
                           FROM conversations`
        const rows =
          'conversationFolderId' in options
            ? options.conversationFolderId
              ? (db
                  .prepare(`${baseSelect} WHERE conversation_folder_id = ? ORDER BY sort_order ASC, updated_at DESC`)
                  .all(options.conversationFolderId) as Array<Omit<Conversation, 'context'> & { contextJson: string }>)
              : (db
                  .prepare(`${baseSelect} WHERE conversation_folder_id IS NULL ORDER BY sort_order ASC, updated_at DESC`)
                  .all() as Array<Omit<Conversation, 'context'> & { contextJson: string }>)
            : (db
                .prepare(`${baseSelect} ORDER BY sort_order ASC, updated_at DESC`)
                .all() as Array<Omit<Conversation, 'context'> & { contextJson: string }>)
        return rows.map(mapConversation)
      },
      getById(conversationId: string): Conversation | null {
        return getConversation(conversationId)
      },
      rename(conversationId: string, title: string): Conversation {
        db.prepare(`UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?`).run(title, now(), conversationId)
        const conversation = getConversation(conversationId)
        if (!conversation) throw new Error('对话不存在。')
        return conversation
      },
      delete(conversationId: string): Conversation {
        const conversation = getConversation(conversationId)
        if (!conversation) throw new Error('对话不存在。')
        db.prepare(`DELETE FROM conversations WHERE id = ?`).run(conversationId)
        return conversation
      },
      moveToFolder(conversationId: string, conversationFolderId: string | null): Conversation {
        db.prepare(`UPDATE conversations SET conversation_folder_id = ?, sort_order = ?, updated_at = ? WHERE id = ?`).run(
          conversationFolderId,
          topConversationSortOrder(conversationFolderId),
          now(),
          conversationId
        )
        const conversation = getConversation(conversationId)
        if (!conversation) throw new Error('对话不存在。')
        return conversation
      },
      setDifyConversationId(conversationId: string, difyConversationId: string): Conversation {
        db.prepare(`UPDATE conversations SET dify_conversation_id = ?, updated_at = ? WHERE id = ?`).run(
          difyConversationId,
          now(),
          conversationId
        )
        const conversation = getConversation(conversationId)
        if (!conversation) throw new Error('Conversation not found.')
        return conversation
      },
      reorder(conversationIds: string[]): Conversation[] {
        reorderRows('conversations', conversationIds)
        return conversationIds.map((conversationId) => {
          const conversation = getConversation(conversationId)
          if (!conversation) throw new Error('对话不存在。')
          return conversation
        })
      }
    },
    messages: {
      create(input: CreateMessageInput): Message {
        const timestamp = now()
        const row: Message = {
          id: id('message'),
          conversationId: input.conversationId,
          role: input.role,
          content: input.content,
          citations: input.citations,
          createdAt: timestamp
        }
        db.prepare(
          `INSERT INTO messages (id, conversation_id, role, content, citations_json, created_at)
           VALUES (@id, @conversationId, @role, @content, @citationsJson, @createdAt)`
        ).run({
          ...row,
          citationsJson: JSON.stringify(row.citations)
        })
        db.prepare(`UPDATE conversations SET updated_at = ? WHERE id = ?`).run(timestamp, input.conversationId)
        return row
      },
      listByConversation(conversationId: string): Message[] {
        const rows = db
          .prepare(
            `SELECT id, conversation_id as conversationId, role, content,
                    citations_json as citationsJson, created_at as createdAt
             FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`
          )
          .all(conversationId) as Array<Omit<Message, 'citations'> & { citationsJson: string }>
        return rows.map(mapMessage)
      }
    }
  }
}
