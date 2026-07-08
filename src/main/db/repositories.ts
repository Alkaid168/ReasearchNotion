import crypto from 'node:crypto'
import type Database from 'better-sqlite3'
import type { FileType, Folder, IndexStatus, Paper, PaperCard } from '../../shared/types'

function now(): string {
  return new Date().toISOString()
}

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

type CreateFolderInput = { name: string; parentId: string | null }
type CreatePaperInput = { folderId: string; title: string; fileType: FileType; filePath: string }
type PaperCardInput = Omit<PaperCard, 'id' | 'updatedAt' | 'readingStatus'> & { readingStatus?: PaperCard['readingStatus'] }

export function createRepositories(db: Database.Database) {
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

  return {
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
      setDifyDatasetId(folderId: string, datasetId: string): void {
        db.prepare(`UPDATE folders SET dify_dataset_id = ?, updated_at = ? WHERE id = ?`).run(datasetId, now(), folderId)
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
    }
  }
}
