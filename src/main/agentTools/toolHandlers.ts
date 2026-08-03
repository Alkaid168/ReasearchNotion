import type { createRepositories } from '../db/repositories'
import type { Paper, PaperOutlineItem, UserMemory, UserMemoryInput } from '../../shared/types'
import type { ReadingStateStore } from './readingState'
import { chunkPaperText, collectPaperEvidence, extractOutline, extractSection, readPaperPages, searchPages } from './paperText'
import { searchArxiv, searchOpenalex, searchSemanticScholar } from './externalSearch'

type Repositories = ReturnType<typeof createRepositories>

/** Memory store subset (memoriesService satisfies this). */
export type MemoryStore = {
  list(): UserMemory[]
  save(input: UserMemoryInput): UserMemory
}

type ToolDeps = {
  repos: Repositories
  readingState: ReadingStateStore
  memories?: MemoryStore
}

type ToolOk<T> = T & { ok: true }
type ToolError = { ok: false; error: string }
type AgentOutlineItem = Pick<PaperOutlineItem, 'level' | 'heading' | 'pageNumber'>
type InvestigationAspectInput = { label: string; query: string }
type InvestigationAspectEvidence = InvestigationAspectInput & {
  evidence: ReturnType<typeof collectPaperEvidence>['evidence']
  fallbackUsed: boolean
}

function paperSummary(paper: Paper) {
  return {
    id: paper.id,
    folderId: paper.folderId,
    title: paper.title,
    fileType: paper.fileType,
    indexStatus: paper.indexStatus
  }
}

function emptyCurrentPaper(): ToolError {
  return { ok: false, error: '当前没有打开论文。' }
}

function paperScopeError(paper: Paper, readingState: ReadingStateStore): ToolError | null {
  const state = readingState.get()
  if (state.activePaperId && paper.id !== state.activePaperId) {
    return { ok: false, error: '当前对话已限定为当前论文，不能读取其他论文。' }
  }
  if (state.activeFolderId && paper.folderId !== state.activeFolderId) {
    return { ok: false, error: '当前对话已限定为当前论文库，不能读取其他论文库的论文。' }
  }
  return null
}

function folderScopeError(folderId: string | null | undefined, readingState: ReadingStateStore): ToolError | null {
  const activeFolderId = readingState.get().activeFolderId
  if (activeFolderId && folderId && folderId !== activeFolderId) {
    return { ok: false, error: '当前对话已限定为当前论文库，不能检索其他论文库。' }
  }
  return null
}

function paperCardSummary(paper: Paper, repos: Repositories) {
  const card = repos.papers.getCard(paper.id)
  return {
    ...paperSummary(paper),
    authors: card?.authors || null,
    year: card?.year || null,
    summary: card?.oneSentenceSummary || null,
    researchProblem: card?.researchProblem || null,
    methodSummary: card?.methodSummary || null,
    contributions: card?.contributions ?? [],
    keywords: card?.keywords ?? []
  }
}

function compactOutline(outline: PaperOutlineItem[]): AgentOutlineItem[] {
  return outline.slice(0, 48).map(({ level, heading, pageNumber }) => ({ level, heading, pageNumber }))
}

function normalizeInvestigationAspects(aspects: InvestigationAspectInput[] | undefined): InvestigationAspectInput[] {
  const seen = new Set<string>()
  const normalized: InvestigationAspectInput[] = []
  for (const aspect of aspects ?? []) {
    const label = aspect.label.trim().slice(0, 80)
    const query = aspect.query.trim().slice(0, 320)
    const key = `${label}\u0000${query}`
    if (!label || !query || seen.has(key)) continue
    seen.add(key)
    normalized.push({ label, query })
    if (normalized.length === 4) break
  }
  return normalized
}

function collectAspectEvidence(pages: Awaited<ReturnType<typeof readPaperPages>>, aspects: InvestigationAspectInput[], limit: number) {
  return aspects.map<InvestigationAspectEvidence>((aspect) => ({
    ...aspect,
    ...collectPaperEvidence(pages, aspect.query, limit, { fallback: false })
  }))
}

async function pageTextFor(paper: Paper, pageNumber: number) {
  const pages = await readPaperPages(paper)
  const page = pages.find((candidate) => candidate.pageNumber === pageNumber) ?? pages[0]
  return { pages, page }
}

export function createAgentToolHandlers({ repos, readingState, memories }: ToolDeps) {
  return {
    async getCurrentContext(): Promise<
      ToolOk<{
        activeFolder: { id: string; name: string } | null
        activePaper: ReturnType<typeof paperSummary> | null
        currentPage: number
        selectedText: string | null
      }>
    > {
      const state = readingState.get()
      const activeFolder = state.activeFolderId ? repos.folders.getById(state.activeFolderId) : null
      const activePaper = state.activePaperId ? repos.papers.getById(state.activePaperId) : null
      return {
        ok: true,
        activeFolder: activeFolder ? { id: activeFolder.id, name: activeFolder.name } : null,
        activePaper: activePaper ? paperSummary(activePaper) : null,
        currentPage: state.currentPage,
        selectedText: state.selectedText
      }
    },

    async listLibraryPapers(input: { folderId?: string | null } = {}): Promise<
      ToolOk<{
        folderId: string | null
        scope: 'folder' | 'all'
        papers: Array<ReturnType<typeof paperCardSummary>>
      }> | ToolError
    > {
      const scopeError = folderScopeError(input.folderId, readingState)
      if (scopeError) return scopeError
      const folderId = input.folderId || readingState.get().activeFolderId
      const papers = folderId ? repos.papers.listByFolder(folderId) : repos.papers.listAll()
      return {
        ok: true,
        folderId: folderId ?? null,
        scope: folderId ? 'folder' : 'all',
        papers: papers.map((paper) => paperCardSummary(paper, repos))
      }
    },

    async getPaperMetadata(input: { paperId: string }): Promise<
      ToolOk<{ paper: ReturnType<typeof paperSummary>; card: ReturnType<typeof repos.papers.getCard> }> | ToolError
    > {
      const paper = repos.papers.getById(input.paperId)
      if (!paper) return { ok: false, error: '论文不存在。' }
      const scopeError = paperScopeError(paper, readingState)
      if (scopeError) return scopeError
      return { ok: true, paper: paperSummary(paper), card: repos.papers.getCard(paper.id) }
    },

    async getCurrentPageText(): Promise<ToolOk<{ paperId: string; pageNumber: number; text: string }> | ToolError> {
      const state = readingState.get()
      if (!state.activePaperId) return emptyCurrentPaper()
      const paper = repos.papers.getById(state.activePaperId)
      if (!paper) return emptyCurrentPaper()
      const { page } = await pageTextFor(paper, state.currentPage)
      return { ok: true, paperId: paper.id, pageNumber: page?.pageNumber ?? 1, text: page?.text ?? '' }
    },

    async getPaperPageText(input: { paperId: string; pageNumber?: number }): Promise<
      ToolOk<{ paperId: string; pageNumber: number; text: string }> | ToolError
    > {
      const paper = repos.papers.getById(input.paperId)
      if (!paper) return { ok: false, error: '论文不存在。' }
      const scopeError = paperScopeError(paper, readingState)
      if (scopeError) return scopeError
      const { page } = await pageTextFor(paper, Math.max(1, input.pageNumber ?? 1))
      return { ok: true, paperId: paper.id, pageNumber: page?.pageNumber ?? 1, text: page?.text ?? '' }
    },

    async getPaperSection(input: { paperId: string; section: string }): Promise<
      ToolOk<{ paperId: string; heading: string; pageNumber: number; text: string }> | ToolError
    > {
      const paper = repos.papers.getById(input.paperId)
      if (!paper) return { ok: false, error: '论文不存在。' }
      const scopeError = paperScopeError(paper, readingState)
      if (scopeError) return scopeError
      const pages = await readPaperPages(paper)
      const section = extractSection(pages, input.section)
      if (!section) return { ok: false, error: `没有找到章节 ${input.section}。` }
      return { ok: true, paperId: paper.id, ...section }
    },

    async getPaperOutline(input: { paperId: string }): Promise<
      ToolOk<{ paperId: string; outline: AgentOutlineItem[] }> | ToolError
    > {
      const paper = repos.papers.getById(input.paperId)
      if (!paper) return { ok: false, error: '论文不存在。' }
      const scopeError = paperScopeError(paper, readingState)
      if (scopeError) return scopeError
      return { ok: true, paperId: paper.id, outline: compactOutline(extractOutline(await readPaperPages(paper))) }
    },

    async getPaperTextChunk(input: { paperId: string; chunkIndex?: number; maxChars?: number }): Promise<
      ToolOk<{ paperId: string } & ReturnType<typeof chunkPaperText>> | ToolError
    > {
      const paper = repos.papers.getById(input.paperId)
      if (!paper) return { ok: false, error: '论文不存在。' }
      const scopeError = paperScopeError(paper, readingState)
      if (scopeError) return scopeError
      return {
        ok: true,
        paperId: paper.id,
        ...chunkPaperText(await readPaperPages(paper), {
          chunkIndex: input.chunkIndex,
          maxChars: input.maxChars
        })
      }
    },

    async investigatePaper(input: { paperId: string; query: string; limit?: number; aspects?: InvestigationAspectInput[] }): Promise<
      | ToolOk<{
          paper: ReturnType<typeof paperCardSummary>
          outline: AgentOutlineItem[]
          evidence: ReturnType<typeof collectPaperEvidence>['evidence']
          fallbackUsed: boolean
          evidenceByAspect: InvestigationAspectEvidence[]
          unconfirmedAspectLabels: string[]
        }>
      | ToolError
    > {
      const paper = repos.papers.getById(input.paperId)
      if (!paper) return { ok: false, error: '论文不存在。' }
      const scopeError = paperScopeError(paper, readingState)
      if (scopeError) return scopeError
      const pages = await readPaperPages(paper)
      const result = collectPaperEvidence(pages, input.query, input.limit)
      const evidenceByAspect = collectAspectEvidence(pages, normalizeInvestigationAspects(input.aspects), input.limit ?? 4)
      return {
        ok: true,
        paper: paperCardSummary(paper, repos),
        outline: compactOutline(extractOutline(pages)),
        ...result,
        evidenceByAspect,
        unconfirmedAspectLabels: evidenceByAspect.filter((aspect) => aspect.evidence.length === 0).map((aspect) => aspect.label)
      }
    },

    async searchCurrentPaper(input: { query: string; limit?: number }): Promise<
      ToolOk<{ paperId: string; results: Array<{ paperId: string; pageNumber: number; snippet: string; score: number }> }> | ToolError
    > {
      const activePaperId = readingState.get().activePaperId
      if (!activePaperId) return emptyCurrentPaper()
      const paper = repos.papers.getById(activePaperId)
      if (!paper) return emptyCurrentPaper()
      const results = searchPages(await readPaperPages(paper), input.query, input.limit).map((result) => ({
        paperId: paper.id,
        ...result
      }))
      return { ok: true, paperId: paper.id, results }
    },

    async searchLibrary(input: { folderId?: string | null; query: string; limit?: number }): Promise<
      ToolOk<{
        folderId: string | null
        scope: 'folder' | 'all'
        results: Array<{ paperId: string; paperTitle: string; pageNumber: number; snippet: string; score: number }>
      }> | ToolError
    > {
      const scopeError = folderScopeError(input.folderId, readingState)
      if (scopeError) return scopeError
      const folderId = input.folderId || readingState.get().activeFolderId
      const perPaperLimit = Math.max(1, input.limit ?? 5)
      const papers = folderId ? repos.papers.listByFolder(folderId) : repos.papers.listAll()
      const results = (
        await Promise.all(
          papers.map(async (paper) =>
            searchPages(await readPaperPages(paper), input.query, perPaperLimit).map((result) => ({
              paperId: paper.id,
              paperTitle: paper.title,
              ...result
            }))
          )
        )
      )
        .flat()
        .sort((a, b) => b.score - a.score)
        .slice(0, perPaperLimit)
      return { ok: true, folderId: folderId ?? null, scope: folderId ? 'folder' : 'all', results }
    },

    async investigateLibrary(input: {
      folderId?: string | null
      paperIds?: string[]
      query: string
      perPaperLimit?: number
      maxPapers?: number
      aspects?: InvestigationAspectInput[]
    }): Promise<
      | ToolOk<{
          folderId: string | null
          scope: 'folder' | 'all'
          evidenceByPaper: Array<{
            paper: ReturnType<typeof paperCardSummary>
            evidence: ReturnType<typeof collectPaperEvidence>['evidence']
            fallbackUsed: boolean
            evidenceByAspect: InvestigationAspectEvidence[]
            unconfirmedAspectLabels: string[]
          }>
          noEvidencePaperIds: string[]
        }>
      | ToolError
    > {
      const scopeError = folderScopeError(input.folderId, readingState)
      if (scopeError) return scopeError

      const folderId = input.folderId || readingState.get().activeFolderId
      const explicitIds = Array.from(new Set((input.paperIds ?? []).filter((paperId) => paperId.trim())))
      const selected = explicitIds.length
        ? explicitIds.map((paperId) => repos.papers.getById(paperId))
        : folderId
          ? repos.papers.listByFolder(folderId)
          : repos.papers.listAll()

      if (selected.some((paper) => !paper)) return { ok: false, error: '论文不存在。' }

      const papers = (selected as Paper[]).slice(0, Math.min(12, Math.max(1, Math.floor(input.maxPapers ?? 6))))
      for (const paper of papers) {
        const paperError = paperScopeError(paper, readingState)
        if (paperError) return paperError
        if (folderId && paper.folderId !== folderId) {
          return { ok: false, error: '当前对话已限定为当前论文库，不能读取其他论文库的论文。' }
        }
      }

      const perPaperLimit = Math.min(4, Math.max(1, Math.floor(input.perPaperLimit ?? 2)))
      const aspects = normalizeInvestigationAspects(input.aspects)
      const evidenceByPaper = await Promise.all(
        papers.map(async (paper) => {
          const pages = await readPaperPages(paper)
          const result = collectPaperEvidence(pages, input.query, perPaperLimit)
          const evidenceByAspect = collectAspectEvidence(pages, aspects, perPaperLimit)
          return {
            paper: paperCardSummary(paper, repos),
            ...result,
            evidenceByAspect,
            unconfirmedAspectLabels: evidenceByAspect.filter((aspect) => aspect.evidence.length === 0).map((aspect) => aspect.label)
          }
        })
      )

      return {
        ok: true,
        folderId: folderId ?? null,
        scope: folderId ? 'folder' : 'all',
        evidenceByPaper,
        noEvidencePaperIds: evidenceByPaper.filter((item) => item.evidence.length === 0).map((item) => item.paper.id)
      }
    },

    // T12a: External search tools
    async searchArxiv(query: string, maxResults = 5) {
      return searchArxiv(query, maxResults)
    },
    async searchSemanticScholar(query: string, maxResults = 5) {
      return searchSemanticScholar(query, maxResults)
    },
    async searchOpenalex(query: string, maxResults = 5) {
      return searchOpenalex(query, maxResults)
    },
    // T12b: agent self-writes user memories (Claude Code-style). Upsert by type+name.
    async saveMemory(input: {
      type: UserMemoryInput['type']
      name: string
      body: string
      description?: string
    }): Promise<ToolOk<{ memory: UserMemory; action: 'created' | 'updated' }> | ToolError> {
      if (!memories) return { ok: false, error: '记忆库未配置。' }
      const validTypes: UserMemoryInput['type'][] = ['user', 'preference', 'feedback', 'project', 'reference']
      if (!validTypes.includes(input.type)) {
        return { ok: false, error: `无效的记忆类型 ${input.type}；必须是 user/preference/feedback/project/reference。` }
      }
      const name = input.name.trim()
      const body = input.body.trim()
      if (!name || !body) return { ok: false, error: 'name 和 body 不能为空。' }
      const existing = memories.list().find((m) => m.type === input.type && m.name === name)
      const memory = memories.save({
        id: existing?.id,
        type: input.type,
        name,
        description: input.description?.trim() ?? existing?.description ?? '',
        body
      })
      return { ok: true, memory, action: existing ? 'updated' : 'created' }
    }
  }
}

export type AgentToolHandlers = ReturnType<typeof createAgentToolHandlers>
