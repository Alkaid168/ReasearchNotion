import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppDatabase } from '../../src/main/db/database'
import type { Paper, UserMemory, UserMemoryInput } from '../../src/shared/types'
import type { MemoryStore } from '../../src/main/agentTools/toolHandlers'
import { createDatabase } from '../../src/main/db/database'
import { createRepositories } from '../../src/main/db/repositories'
import { createOpenApiToolService } from '../../src/main/agentTools/openApiService'
import { chunkPaperText, cleanSurrogates, extractOutline, extractSection, readPaperPages, searchPages } from '../../src/main/agentTools/paperText'
import { createReadingStateStore } from '../../src/main/agentTools/readingState'
import { createAgentToolHandlers } from '../../src/main/agentTools/toolHandlers'

let tempDir = ''
let databases: AppDatabase[] = []

beforeEach(() => {
  tempDir = mkdtempSync(path.join(os.tmpdir(), 'rn-agent-tools-'))
  databases = []
})

afterEach(() => {
  databases.forEach((db) => db.close())
  rmSync(tempDir, { recursive: true, force: true })
})

function createFixture() {
  const db = createDatabase(path.join(tempDir, 'agent-tools.sqlite'))
  databases.push(db)
  const repos = createRepositories(db)
  const folder = repos.folders.create({ name: 'NLP 论文库', parentId: null })
  const paperPath = path.join(tempDir, 'bert.md')
  writeFileSync(
    paperPath,
    [
      '# BERT: Pre-training of Deep Bidirectional Transformers',
      '',
      '## 3 BERT',
      'BERT has two steps: pre-training and fine-tuning.',
      '',
      '### 3.2 Fine-tuning BERT',
      'Fine-tuning is straightforward because the self-attention mechanism allows BERT to model many downstream tasks.',
      'For each task, task-specific inputs and outputs are plugged into BERT and all parameters are fine-tuned end-to-end.',
      '',
      '## 4 Experiments',
      'The paper evaluates BERT on GLUE and other NLP tasks.'
    ].join('\n'),
    'utf8'
  )
  const paper = repos.papers.create({
    folderId: folder.id,
    title: 'BERT: Pre-training of Deep Bidirectional Transformers',
    fileType: 'markdown',
    filePath: paperPath
  })
  repos.paperCards.upsert({
    paperId: paper.id,
    authors: 'Devlin et al.',
    year: '2018',
    oneSentenceSummary: 'BERT introduces bidirectional Transformer pre-training for language understanding.',
    researchProblem: 'How to pre-train deep bidirectional representations.',
    methodSummary: 'Pre-train with masked language modeling and next sentence prediction, then fine-tune.',
    contributions: ['Bidirectional pre-training', 'Strong GLUE results'],
    keywords: ['BERT', 'pre-training', 'fine-tuning']
  })
  return { repos, folder, paper }
}

describe('agent tool reading state', () => {
  it('stores the current paper, folder, page, and selected text for tools', () => {
    const state = createReadingStateStore()

    state.update({
      activeFolderId: 'folder-1',
      activePaperId: 'paper-1',
      currentPage: 5,
      selectedText: 'Fine-tuning BERT'
    })

    expect(state.get()).toMatchObject({
      activeFolderId: 'folder-1',
      activePaperId: 'paper-1',
      currentPage: 5,
      selectedText: 'Fine-tuning BERT'
    })
    expect(state.get().updatedAt).toEqual(expect.any(String))
  })
})

describe('agent paper text helpers', () => {
  it('reads markdown sections and searches snippets', async () => {
    const { paper } = createFixture()

    const pages = await readPaperPages(paper)
    const section = extractSection(pages, '3.2')
    const searchResults = searchPages(pages, 'fine tuning downstream tasks')

    expect(pages).toHaveLength(1)
    expect(pages[0].text).toContain('Fine-tuning BERT')
    expect(section?.heading).toContain('3.2 Fine-tuning BERT')
    expect(section?.text).toContain('task-specific inputs and outputs')
    expect(searchResults[0]).toMatchObject({
      pageNumber: 1,
      score: expect.any(Number)
    })
    expect(searchResults[0].snippet).toContain('Fine-tuning')
  })

  it('reuses parsed pages until the source paper changes', async () => {
    const paperPath = path.join(tempDir, 'cached-paper.md')
    writeFileSync(paperPath, '# BERT\n\nThe original source text.', 'utf8')
    const paper: Paper = {
      id: 'cached-paper',
      folderId: 'cached-folder',
      title: 'Cached BERT',
      fileType: 'markdown',
      filePath: paperPath,
      difyDocumentId: null,
      indexStatus: 'local-only',
      createdAt: '2026-07-12T00:00:00.000Z',
      updatedAt: '2026-07-12T00:00:00.000Z'
    }

    const firstRead = await readPaperPages(paper)
    const secondRead = await readPaperPages(paper)
    expect(secondRead).toBe(firstRead)

    writeFileSync(paper.filePath, '# Updated BERT\n\nThe revised source has new text.', 'utf8')
    const refreshedRead = await readPaperPages(paper)
    expect(refreshedRead).not.toBe(firstRead)
    expect(refreshedRead[0].text).toContain('revised source')
  })

  it('expands common Chinese research terms when searching English paper text', () => {
    const results = searchPages(
      [
        {
          pageNumber: 1,
          text: 'The experiments show strong GLUE results. The model also reports limitations on long documents.'
        }
      ],
      '实验结果和局限'
    )

    expect(results[0]).toMatchObject({
      pageNumber: 1,
      snippet: expect.stringContaining('experiments'),
      score: expect.any(Number)
    })
  })

  it('extracts paper outline and bounded text chunks for agent planning', async () => {
    const { paper } = createFixture()

    const pages = await readPaperPages(paper)
    const outline = extractOutline(pages)
    const firstChunk = chunkPaperText(pages, { chunkIndex: 1, maxChars: 180 })

    expect(outline).toEqual([
      expect.objectContaining({ level: 1, heading: 'BERT: Pre-training of Deep Bidirectional Transformers', pageNumber: 1 }),
      expect.objectContaining({ level: 2, heading: '3 BERT', pageNumber: 1 }),
      expect.objectContaining({ level: 3, heading: '3.2 Fine-tuning BERT', pageNumber: 1 }),
      expect.objectContaining({ level: 2, heading: '4 Experiments', pageNumber: 1 })
    ])
    expect(firstChunk).toMatchObject({
      chunkIndex: 1,
      totalChunks: expect.any(Number),
      documentPageCount: 1,
      pageStart: 1,
      pageEnd: 1,
      nextChunkIndex: 2
    })
    expect(firstChunk.text.length).toBeLessThanOrEqual(180)
    expect(firstChunk.text).toContain('BERT')
  })

  it('extracts common academic sections from plain PDF-like text', () => {
    const pages = [
      {
        pageNumber: 1,
        text: [
          'Title of the Paper',
          'Abstract This paper introduces a retrieval augmented method for scientific question answering.',
          '1 Introduction Scientific reading requires grounding answers in papers.',
          '2 Method The system retrieves pages and then reads selected chunks.',
          '3 Experiments Results show better grounded answers.'
        ].join(' ')
      }
    ]

    const abstract = extractSection(pages, '摘要')
    const introduction = extractSection(pages, 'Introduction')
    const method = extractSection(pages, '方法')

    expect(abstract).toMatchObject({
      heading: 'Abstract',
      pageNumber: 1,
      text: expect.stringContaining('retrieval augmented method')
    })
    expect(abstract?.text).not.toContain('1 Introduction')
    expect(introduction).toMatchObject({
      heading: '1 Introduction',
      text: expect.stringContaining('Scientific reading requires')
    })
    expect(introduction?.text).not.toContain('2 Method')
    expect(method).toMatchObject({
      heading: '2 Method',
      text: expect.stringContaining('retrieves pages')
    })
    expect(method?.text).not.toContain('3 Experiments')
  })

  it('extracts numbered outline headings from single-line PDF-like text', () => {
    const pages = [
      {
        pageNumber: 1,
        text: [
          'BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding',
          'Abstract We introduce a new language representation model called BERT.',
          '1 Introduction Language model pre-training has been shown to be effective.',
          '2 Related Work There is a long history of general language representations.',
          '3 BERT We introduce BERT and its detailed implementation.',
          '3.1 Pre-training BERT We use masked language modeling.',
          '3.2 Fine-tuning BERT Fine-tuning is straightforward.',
          '4 Experiments We evaluate on eleven NLP tasks.',
          '5 Conclusion Recent empirical improvements demonstrate the value of bidirectional pre-training.'
        ].join(' ')
      }
    ]

    expect(extractOutline(pages)).toEqual([
      expect.objectContaining({ level: 1, heading: 'Abstract', pageNumber: 1 }),
      expect.objectContaining({ level: 1, heading: '1 Introduction', pageNumber: 1 }),
      expect.objectContaining({ level: 1, heading: '2 Related Work', pageNumber: 1 }),
      expect.objectContaining({ level: 1, heading: '3 BERT', pageNumber: 1 }),
      expect.objectContaining({ level: 2, heading: '3.1 Pre-training BERT', pageNumber: 1 }),
      expect.objectContaining({ level: 2, heading: '3.2 Fine-tuning BERT', pageNumber: 1 }),
      expect.objectContaining({ level: 1, heading: '4 Experiments', pageNumber: 1 }),
      expect.objectContaining({ level: 1, heading: '5 Conclusion', pageNumber: 1 })
    ])
  })

  it('extracts unfamiliar numbered headings from line-preserving PDF text', () => {
    const pages = [
      {
        pageNumber: 1,
        text: [
          'A New Scientific Assistant',
          '1 Overview',
          'This section introduces the research problem in detail.',
          '2 Proposed Framework',
          'The framework coordinates retrieval and generation.',
          '2.1 Evidence Planning',
          'The planner decides which evidence should be collected.',
          '3 Error Analysis',
          'We analyze retrieval and generation failures.'
        ].join('\n')
      }
    ]

    expect(extractOutline(pages)).toEqual([
      expect.objectContaining({ level: 1, heading: '1 Overview' }),
      expect.objectContaining({ level: 1, heading: '2 Proposed Framework' }),
      expect.objectContaining({ level: 2, heading: '2.1 Evidence Planning' }),
      expect.objectContaining({ level: 1, heading: '3 Error Analysis' })
    ])
  })

  it('omits table rows and bibliography fragments from a PDF outline', () => {
    const pages = [
      {
        pageNumber: 8,
        text: [
          '4 Results',
          '4.1 Open-domain Question Answering',
          '72.5 89.5',
          '10 20 30 40 50',
          '5 Related Work',
          '10062 Curran Associates, Inc., 2018. URL http://papers.nips.cc/paper/',
          '6 Discussion'
        ].join('\n')
      }
    ]

    expect(extractOutline(pages).map((item) => item.heading)).toEqual([
      '4 Results',
      '4.1 Open-domain Question Answering',
      '5 Related Work',
      '6 Discussion'
    ])
  })

  it('matches inflected English academic terms from natural-language questions', () => {
    const results = searchPages(
      [
        {
          pageNumber: 6,
          text: 'The architecture has quadratic complexity. Its main limitation is memory use on long sequences.'
        }
      ],
      'What are the architectural limitations and computational costs?'
    )

    expect(results[0]).toMatchObject({
      pageNumber: 6,
      snippet: expect.stringContaining('architecture')
    })
  })

  it('returns the densest matching passage instead of the first weak term on a long page', () => {
    const results = searchPages(
      [
        {
          pageNumber: 9,
          text: [
            'The experiments are described here only as routine implementation details.',
            'Several unrelated examples follow before the paper reports the actual findings. '.repeat(18),
            'The results show that long sequences have quadratic computational complexity and a major memory limitation.'
          ].join(' ')
        }
      ],
      '实验结果和局限'
    )

    expect(results).toHaveLength(1)
    expect(results[0].snippet).toContain('quadratic computational complexity')
    expect(results[0].snippet).toContain('memory limitation')
  })
})

describe('agent tool handlers', () => {
  it('answers current context, metadata, page, section, and search tool calls', async () => {
    const { repos, folder, paper } = createFixture()
    const state = createReadingStateStore()
    state.update({
      activeFolderId: folder.id,
      activePaperId: paper.id,
      currentPage: 1,
      selectedText: 'task-specific inputs and outputs'
    })
    const tools = createAgentToolHandlers({ repos, readingState: state })

    await expect(tools.getCurrentContext()).resolves.toMatchObject({
      ok: true,
      activeFolder: { id: folder.id, name: 'NLP 论文库' },
      activePaper: { id: paper.id, title: paper.title },
      currentPage: 1,
      selectedText: 'task-specific inputs and outputs'
    })
    await expect(tools.listLibraryPapers({ folderId: folder.id })).resolves.toMatchObject({
      ok: true,
      folderId: folder.id,
      scope: 'folder',
      papers: [
        {
          id: paper.id,
          title: paper.title,
          authors: 'Devlin et al.',
          year: '2018',
          summary: expect.stringContaining('BERT introduces'),
          contributions: ['Bidirectional pre-training', 'Strong GLUE results'],
          keywords: ['BERT', 'pre-training', 'fine-tuning']
        }
      ]
    })
    await expect(tools.getPaperMetadata({ paperId: paper.id })).resolves.toMatchObject({
      ok: true,
      paper: { id: paper.id, title: paper.title },
      card: { authors: 'Devlin et al.', year: '2018' }
    })
    await expect(tools.getCurrentPageText()).resolves.toMatchObject({
      ok: true,
      paperId: paper.id,
      pageNumber: 1,
      text: expect.stringContaining('Fine-tuning is straightforward')
    })
    await expect(tools.getPaperPageText({ paperId: paper.id, pageNumber: 1 })).resolves.toMatchObject({
      ok: true,
      text: expect.stringContaining('The paper evaluates BERT')
    })
    await expect(tools.getPaperSection({ paperId: paper.id, section: '3.2' })).resolves.toMatchObject({
      ok: true,
      heading: expect.stringContaining('Fine-tuning BERT'),
      text: expect.stringContaining('task-specific inputs and outputs')
    })
    await expect(tools.getPaperOutline({ paperId: paper.id })).resolves.toMatchObject({
      ok: true,
      paperId: paper.id,
      outline: expect.arrayContaining([
        expect.objectContaining({ heading: 'BERT: Pre-training of Deep Bidirectional Transformers' }),
        expect.objectContaining({ heading: '3.2 Fine-tuning BERT' })
      ])
    })
    await expect(tools.getPaperTextChunk({ paperId: paper.id, chunkIndex: 1, maxChars: 180 })).resolves.toMatchObject({
      ok: true,
      paperId: paper.id,
      chunkIndex: 1,
      totalChunks: expect.any(Number),
      documentPageCount: expect.any(Number),
      text: expect.stringContaining('BERT')
    })
    await expect(tools.investigatePaper({ paperId: paper.id, query: 'fine tuning downstream tasks' })).resolves.toMatchObject({
      ok: true,
      paper: expect.objectContaining({ id: paper.id, title: expect.stringContaining('BERT') }),
      outline: expect.arrayContaining([expect.objectContaining({ heading: '3.2 Fine-tuning BERT' })]),
      evidence: [
        expect.objectContaining({
          pageNumber: 1,
          text: expect.stringContaining('task-specific inputs and outputs')
        })
      ],
      fallbackUsed: false
    })
    await expect(tools.investigatePaper({ paperId: paper.id, query: 'nonexistent quantum biology phrase' })).resolves.toMatchObject({
      ok: true,
      evidence: [expect.objectContaining({ pageNumber: 1, text: expect.stringContaining('BERT') })],
      fallbackUsed: true
    })
    await expect(
      tools.investigatePaper({
        paperId: paper.id,
        query: 'BERT research details',
        aspects: [
          { label: 'fine-tuning', query: 'fine tuning downstream task-specific inputs' },
          { label: 'evaluation', query: 'GLUE experiments evaluation' },
          { label: 'unsupported', query: 'quantum biology carbon capture' }
        ]
      })
    ).resolves.toMatchObject({
      ok: true,
      evidenceByAspect: [
        { label: 'fine-tuning', evidence: [expect.objectContaining({ text: expect.stringContaining('task-specific inputs') })], fallbackUsed: false },
        { label: 'evaluation', evidence: [expect.objectContaining({ text: expect.stringContaining('GLUE') })], fallbackUsed: false },
        { label: 'unsupported', evidence: [], fallbackUsed: false }
      ],
      unconfirmedAspectLabels: ['unsupported']
    })
    await expect(tools.searchCurrentPaper({ query: 'fine tuning downstream' })).resolves.toMatchObject({
      ok: true,
      results: [expect.objectContaining({ paperId: paper.id, snippet: expect.stringContaining('Fine-tuning') })]
    })
    await expect(tools.searchLibrary({ folderId: folder.id, query: 'GLUE experiments' })).resolves.toMatchObject({
      ok: true,
      results: [expect.objectContaining({ paperId: paper.id, snippet: expect.stringContaining('GLUE') })]
    })
    await expect(tools.searchLibrary({ folderId: folder.id, query: '实验结果' })).resolves.toMatchObject({
      ok: true,
      results: [expect.objectContaining({ paperId: paper.id, snippet: expect.stringContaining('Experiments') })]
    })
  })

  it('keeps Agent outline results compact enough for repeated tool use', async () => {
    const { repos, paper } = createFixture()
    const tools = createAgentToolHandlers({ repos, readingState: createReadingStateStore() })

    const result = await tools.getPaperOutline({ paperId: paper.id })

    expect(result).toMatchObject({ ok: true, paperId: paper.id })
    if (!result.ok) throw new Error(result.error)
    expect(result.outline[0]).not.toHaveProperty('preview')
  })

  it('lists and searches all local papers when no folder is selected', async () => {
    const { repos, paper } = createFixture()
    const state = createReadingStateStore()
    const tools = createAgentToolHandlers({ repos, readingState: state })

    await expect(tools.listLibraryPapers()).resolves.toMatchObject({
      ok: true,
      folderId: null,
      scope: 'all',
      papers: [expect.objectContaining({ id: paper.id, title: paper.title, summary: expect.stringContaining('BERT introduces') })]
    })
    await expect(tools.searchLibrary({ query: 'fine tuning downstream' })).resolves.toMatchObject({
      ok: true,
      folderId: null,
      scope: 'all',
      results: [expect.objectContaining({ paperId: paper.id, paperTitle: paper.title })]
    })
  })

  it('investigates selected library papers independently and keeps the active scope intact', async () => {
    const { repos, folder, paper } = createFixture()
    const ragPath = path.join(tempDir, 'rag.md')
    writeFileSync(
      ragPath,
      [
        '# Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
        '',
        '## 2 Methods',
        'RAG retrieves relevant passages and conditions generation on the retrieved evidence.',
        '',
        '## 5 Limitations',
        'Retrieval quality can limit the final generation quality.'
      ].join('\n'),
      'utf8'
    )
    const ragPaper = repos.papers.create({
      folderId: folder.id,
      title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
      fileType: 'markdown',
      filePath: ragPath
    })
    const privateFolder = repos.folders.create({ name: 'Private library', parentId: null })
    const privatePath = path.join(tempDir, 'private.md')
    writeFileSync(privatePath, '# Private\n\nThis paper must remain outside the active library.', 'utf8')
    const privatePaper = repos.papers.create({
      folderId: privateFolder.id,
      title: 'Private paper',
      fileType: 'markdown',
      filePath: privatePath
    })
    const state = createReadingStateStore()
    state.update({ activeFolderId: folder.id, activePaperId: null })
    const tools = createAgentToolHandlers({ repos, readingState: state })

    await expect(
      tools.investigateLibrary({
        folderId: folder.id,
        paperIds: [paper.id, ragPaper.id],
        query: '方法和局限',
        perPaperLimit: 2
      })
    ).resolves.toMatchObject({
      ok: true,
      folderId: folder.id,
      evidenceByPaper: [
        { paper: { id: paper.id }, evidence: [expect.objectContaining({ text: expect.stringContaining('BERT') })] },
        { paper: { id: ragPaper.id }, evidence: [expect.objectContaining({ text: expect.stringContaining('RAG retrieves') })] }
      ],
      noEvidencePaperIds: []
    })

    await expect(
      tools.investigateLibrary({ folderId: folder.id, paperIds: [privatePaper.id], query: 'private' })
    ).resolves.toMatchObject({ ok: false, error: expect.stringContaining('当前论文库') })
  })

  it('returns a clear tool error when no current paper is open', async () => {
    const { repos } = createFixture()
    const tools = createAgentToolHandlers({ repos, readingState: createReadingStateStore() })

    await expect(tools.getCurrentPageText()).resolves.toMatchObject({
      ok: false,
      error: '当前没有打开论文。'
    })
  })

  it('rejects explicit reads outside the active paper or paper-library scope', async () => {
    const { repos, folder, paper } = createFixture()
    const outsideFolder = repos.folders.create({ name: 'Private library', parentId: null })
    const outsidePath = path.join(tempDir, 'outside.md')
    writeFileSync(outsidePath, '# Outside paper\n\nThis content must stay outside the active scope.', 'utf8')
    const outsidePaper = repos.papers.create({
      folderId: outsideFolder.id,
      title: 'Outside paper',
      fileType: 'markdown',
      filePath: outsidePath
    })
    const state = createReadingStateStore()
    const tools = createAgentToolHandlers({ repos, readingState: state })

    state.update({ activeFolderId: folder.id, activePaperId: null })
    await expect(tools.getPaperMetadata({ paperId: outsidePaper.id })).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('当前论文库')
    })
    await expect(tools.investigatePaper({ paperId: outsidePaper.id, query: 'content' })).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('当前论文库')
    })

    state.update({ activeFolderId: folder.id, activePaperId: paper.id })
    await expect(tools.getPaperTextChunk({ paperId: outsidePaper.id })).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('当前论文')
    })
  })
})

describe('agent OpenAPI tool service', () => {
  it('serves OpenAPI schema and routes tool requests', async () => {
    const { repos, folder, paper } = createFixture()
    const state = createReadingStateStore()
    state.update({ activeFolderId: folder.id, activePaperId: paper.id, currentPage: 1 })
    const tools = createAgentToolHandlers({ repos, readingState: state })
    const service = createOpenApiToolService({ tools, preferredPort: 0 })

    await service.start()
    try {
      const openApiResponse = await fetch(`${service.baseUrl}/openapi.json`)
      expect(openApiResponse.headers.get('access-control-allow-origin')).toBeNull()
      const openApi = (await openApiResponse.json()) as { openapi: string; paths: Record<string, unknown> }
      expect(openApi.openapi).toBe('3.0.3')
      expect(openApi.paths).toHaveProperty('/tools/current-context')
      expect(openApi.paths).toHaveProperty('/tools/current-paper/search')
      expect(openApi.paths).toHaveProperty('/tools/paper/investigate')
      expect(openApi.paths).toHaveProperty('/tools/library/investigate')
      expect(JSON.stringify(openApi.paths['/tools/paper/investigate'])).toContain('每次只限一篇论文')
      expect(JSON.stringify(openApi.paths['/tools/library/investigate'])).toContain('多篇论文比较、综述或冲突判断时推荐优先调用')

      const dockerOpenApiResponse = await fetch(
        `${service.baseUrl}/openapi.json?server=${encodeURIComponent('http://host.docker.internal:17777')}`
      )
      const dockerOpenApi = (await dockerOpenApiResponse.json()) as { servers: Array<{ url: string }> }
      expect(dockerOpenApi.servers[0].url).toBe('http://host.docker.internal:17777')

      const contextResponse = await fetch(`${service.baseUrl}/tools/current-context`)
      await expect(contextResponse.json()).resolves.toMatchObject({
        ok: true,
        activePaper: { id: paper.id, title: paper.title }
      })

      const searchResponse = await fetch(`${service.baseUrl}/tools/current-paper/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'fine tuning downstream' })
      })
      await expect(searchResponse.json()).resolves.toMatchObject({
        ok: true,
        results: [expect.objectContaining({ paperId: paper.id })]
      })

      const investigateLibraryResponse = await fetch(`${service.baseUrl}/tools/library/investigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId: folder.id,
          paperIds: [paper.id],
          query: 'fine tuning',
          aspects: [{ label: 'evaluation', query: 'GLUE experiments' }],
          perPaperLimit: 1
        })
      })
      await expect(investigateLibraryResponse.json()).resolves.toMatchObject({
        ok: true,
        evidenceByPaper: [
          {
            paper: { id: paper.id },
            evidence: [expect.objectContaining({ text: expect.stringContaining('Fine-tuning') })],
            evidenceByAspect: [{ label: 'evaluation', evidence: [expect.objectContaining({ text: expect.stringContaining('GLUE') })] }]
          }
        ]
      })
    } finally {
      await service.stop()
    }
  })

  it('reports the local tool service status for demo diagnostics', async () => {
    const { repos, folder, paper } = createFixture()
    const state = createReadingStateStore()
    state.update({ activeFolderId: folder.id, activePaperId: paper.id, currentPage: 1 })
    const service = createOpenApiToolService({
      tools: createAgentToolHandlers({ repos, readingState: state }),
      preferredPort: 0
    })

      expect(service.getStatus()).toEqual({
        running: false,
        baseUrl: null,
        operationCount: 16
      })

    await service.start()
    try {
      expect(service.getStatus()).toMatchObject({
        running: true,
        baseUrl: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+$/),
        operationCount: 16
      })
    } finally {
      await service.stop()
    }
  })

  it('requires the configured service token for paper tools and reading-state changes', async () => {
    const { repos, folder, paper } = createFixture()
    const state = createReadingStateStore()
    const service = createOpenApiToolService({
      tools: createAgentToolHandlers({ repos, readingState: state }),
      readingState: state,
      authToken: 'research-notion-test-tool-token-123456789',
      preferredPort: 0
    })

    await service.start()
    try {
      expect((await fetch(`${service.baseUrl}/openapi.json`)).status).toBe(200)
      expect((await fetch(`${service.baseUrl}/tools/current-context`)).status).toBe(401)
      expect((await fetch(`${service.baseUrl}/internal/tool-invocations`)).status).toBe(401)
      expect(
        (
          await fetch(`${service.baseUrl}/internal/reading-state`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activePaperId: paper.id })
          })
        ).status
      ).toBe(401)

      const response = await fetch(`${service.baseUrl}/tools/current-context`, {
        headers: { 'X-ResearchNotion-Tool-Token': 'research-notion-test-tool-token-123456789' }
      })
      await expect(response.json()).resolves.toMatchObject({ ok: true })

      const updateResponse = await fetch(`${service.baseUrl}/internal/reading-state`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ResearchNotion-Tool-Token': 'research-notion-test-tool-token-123456789'
        },
        body: JSON.stringify({ activeFolderId: folder.id, activePaperId: paper.id, currentPage: 1 })
      })
      await expect(updateResponse.json()).resolves.toMatchObject({ ok: true, activePaperId: paper.id })
    } finally {
      await service.stop()
    }
  })

  it('keeps an authenticated identifier-only audit of real tool invocations', async () => {
    const { repos, folder, paper } = createFixture()
    const state = createReadingStateStore()
    state.update({ activeFolderId: folder.id, activePaperId: paper.id, currentPage: 1 })
    const token = 'research-notion-test-tool-token-123456789'
    const headers = {
      'Content-Type': 'application/json',
      'X-ResearchNotion-Tool-Token': token
    }
    const service = createOpenApiToolService({
      tools: createAgentToolHandlers({ repos, readingState: state }),
      readingState: state,
      authToken: token,
      preferredPort: 0
    })

    await service.start()
    try {
      await fetch(`${service.baseUrl}/internal/tool-invocations`, { method: 'DELETE', headers })
      const invocationCursor = service.getInvocationCursor()
      await fetch(`${service.baseUrl}/tools/paper/section`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ paperId: paper.id, section: 'Introduction' })
      })
      await fetch(`${service.baseUrl}/tools/paper/investigate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          paperId: paper.id,
          query: 'BERT details',
          aspects: [
            { label: 'method', query: 'fine tuning' },
            { label: 'evaluation', query: 'GLUE' }
          ]
        })
      })

      expect(service.getInvocationsAfter(invocationCursor)).toMatchObject([
        { operationId: 'get_paper_section', paperId: paper.id, aspectCount: 0 },
        { operationId: 'investigate_paper', paperId: paper.id, aspectCount: 2 }
      ])

      const auditResponse = await fetch(`${service.baseUrl}/internal/tool-invocations`, { headers })
      await expect(auditResponse.json()).resolves.toMatchObject({
        ok: true,
        invocations: [
          {
            operationId: 'get_paper_section',
            paperId: paper.id,
            folderId: null,
            aspectCount: 0
          },
          {
            operationId: 'investigate_paper',
            paperId: paper.id,
            folderId: null,
            aspectCount: 2
          }
        ]
      })

      await fetch(`${service.baseUrl}/internal/tool-invocations`, { method: 'DELETE', headers })
      const clearedResponse = await fetch(`${service.baseUrl}/internal/tool-invocations`, { headers })
      await expect(clearedResponse.json()).resolves.toMatchObject({ ok: true, invocations: [] })
    } finally {
      await service.stop()
    }
  })

  it('allows smoke tests to set reading state without exposing a Dify tool operation', async () => {
    const { repos, folder, paper } = createFixture()
    const state = createReadingStateStore()
    const service = createOpenApiToolService({
      tools: createAgentToolHandlers({ repos, readingState: state }),
      readingState: state,
      preferredPort: 0
    })

    await service.start()
    try {
      const openApiResponse = await fetch(`${service.baseUrl}/openapi.json`)
      const openApi = (await openApiResponse.json()) as { paths: Record<string, unknown> }
      expect(openApi.paths).not.toHaveProperty('/internal/reading-state')

      const updateResponse = await fetch(`${service.baseUrl}/internal/reading-state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeFolderId: folder.id,
          activePaperId: paper.id,
          currentPage: 1,
          selectedText: 'task-specific inputs and outputs'
        })
      })
      await expect(updateResponse.json()).resolves.toMatchObject({
        ok: true,
        activeFolderId: folder.id,
        activePaperId: paper.id,
        currentPage: 1,
        selectedText: 'task-specific inputs and outputs'
      })

      const contextResponse = await fetch(`${service.baseUrl}/tools/current-context`)
      await expect(contextResponse.json()).resolves.toMatchObject({
        ok: true,
        activePaper: { id: paper.id },
        selectedText: 'task-specific inputs and outputs'
      })
    } finally {
      await service.stop()
    }
  })

  it('describes tool input schemas so Dify Agent can call tools with the right arguments', async () => {
    const { repos, folder, paper } = createFixture()
    const state = createReadingStateStore()
    state.update({ activeFolderId: folder.id, activePaperId: paper.id, currentPage: 1 })
    const service = createOpenApiToolService({
      tools: createAgentToolHandlers({ repos, readingState: state }),
      preferredPort: 0
    })

    await service.start()
    try {
      const openApiResponse = await fetch(`${service.baseUrl}/openapi.json`)
      const openApi = (await openApiResponse.json()) as {
        paths: Record<
          string,
          Record<string, { parameters?: unknown[]; requestBody?: { content?: Record<string, { schema?: Record<string, unknown> }> } }>
        >
      }

      expect(openApi.paths['/tools/library/papers'].get.parameters).toEqual([
        expect.objectContaining({ name: 'folderId', in: 'query', required: false })
      ])

      expect(openApi.paths['/tools/paper/page'].post.requestBody?.content?.['application/json'].schema).toMatchObject({
        type: 'object',
        required: ['paperId', 'pageNumber'],
        properties: {
          paperId: { type: 'string' },
          pageNumber: { type: 'integer', minimum: 1 }
        }
      })
      expect(openApi.paths['/tools/paper/section'].post.requestBody?.content?.['application/json'].schema).toMatchObject({
        type: 'object',
        required: ['paperId', 'section'],
        properties: {
          paperId: { type: 'string' },
          section: { type: 'string' }
        }
      })
      expect(openApi.paths['/tools/paper/outline'].post.requestBody?.content?.['application/json'].schema).toMatchObject({
        type: 'object',
        required: ['paperId'],
        properties: {
          paperId: { type: 'string' }
        }
      })
      expect(openApi.paths['/tools/paper/investigate'].post.requestBody?.content?.['application/json'].schema).toMatchObject({
        type: 'object',
        required: ['paperId', 'query'],
        properties: {
          paperId: { type: 'string' },
          query: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 8 }
        }
      })
      expect(openApi.paths['/tools/paper/text-chunk'].post.requestBody?.content?.['application/json'].schema).toMatchObject({
        type: 'object',
        required: ['paperId'],
        properties: {
          paperId: { type: 'string' },
          chunkIndex: { type: 'integer', minimum: 1 },
          maxChars: { type: 'integer', minimum: 100, maximum: 8000 }
        }
      })
      expect(openApi.paths['/tools/library/search'].post.requestBody?.content?.['application/json'].schema).toMatchObject({
        type: 'object',
        required: ['query'],
        properties: {
          folderId: { type: 'string', nullable: true },
          query: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 20 }
        }
      })

      // T12a external search tools are GET endpoints: their arguments MUST be declared
      // as query parameters, otherwise Dify Agent cannot pass `query`/`maxResults`
      // and the tools are effectively unusable (regression guard).
      expect(openApi.paths['/tools/external/arxiv']?.get?.parameters).toEqual([
        expect.objectContaining({ name: 'query', in: 'query', required: true }),
        expect.objectContaining({ name: 'maxResults', in: 'query', required: false })
      ])
      expect(openApi.paths['/tools/external/scholar']?.get?.parameters).toEqual([
        expect.objectContaining({ name: 'query', in: 'query', required: true }),
        expect.objectContaining({ name: 'maxResults', in: 'query', required: false })
      ])
      expect(openApi.paths['/tools/external/openalex']?.get?.parameters).toEqual([
        expect.objectContaining({ name: 'query', in: 'query', required: true }),
        expect.objectContaining({ name: 'maxResults', in: 'query', required: false })
      ])
      expect(openApi.paths['/tools/memory/save']?.post?.requestBody?.content?.['application/json']?.schema).toMatchObject({
        type: 'object',
        required: ['type', 'name', 'body'],
        properties: {
          type: { type: 'string', enum: ['user', 'preference', 'feedback', 'project', 'reference'] },
          name: { type: 'string' },
          body: { type: 'string' }
        }
      })
    } finally {
      await service.stop()
    }
  })

  it('searchArxiv / searchSemanticScholar handlers build the correct external request from arguments', async () => {
    const { repos } = createFixture()
    const state = createReadingStateStore()
    const tools = createAgentToolHandlers({ repos, readingState: state })

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
      text: async () =>
        '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Test</title><summary>Abs</summary><id>http://arxiv.org/abs/1234.5678</id><published>2024-01-01T00:00:00Z</published><author><name>Author</name></author></entry></feed>'
    } as unknown as Response)

    try {
      const arxivResult = await tools.searchArxiv('retrieval augmented generation', 3)
      expect(arxivResult.ok).toBe(true)
      const arxivCallUrl = String(fetchMock.mock.calls[0]?.[0])
      expect(arxivCallUrl).toContain('export.arxiv.org/api/query')
      expect(arxivCallUrl).toContain('search_query=all:retrieval%20augmented%20generation')
      expect(arxivCallUrl).toContain('max_results=3')

      const scholarResult = await tools.searchSemanticScholar('vector database', 4)
      expect(scholarResult.ok).toBe(true)
      const scholarCallUrl = String(fetchMock.mock.calls[1]?.[0])
      expect(scholarCallUrl).toContain('api.semanticscholar.org/graph/v1/paper/search')
      expect(scholarCallUrl).toContain('query=vector%20database')
      expect(scholarCallUrl).toContain('limit=4')

      const openalexResult = await tools.searchOpenalex('retrieval augmented generation', 3)
      expect(openalexResult.ok).toBe(true)
      const openalexCallUrl = String(fetchMock.mock.calls[2]?.[0])
      expect(openalexCallUrl).toContain('api.openalex.org/works')
      expect(openalexCallUrl).toContain('search=retrieval%20augmented%20generation')
      expect(openalexCallUrl).toContain('per-page=3')
      expect(openalexCallUrl).toContain('mailto=')

      // arXiv id → DOI exact lookup (keyword search misses arXiv ids and generic titles)
      const openalexById = await tools.searchOpenalex('2502.20812', 3)
      expect(openalexById.ok).toBe(true)
      const openalexByIdUrl = String(fetchMock.mock.calls[3]?.[0])
      expect(openalexByIdUrl).toContain('api.openalex.org/works/doi:')
      expect(openalexByIdUrl).toContain('10.48550%2Farxiv.2502.20812')
      expect(openalexByIdUrl).not.toContain('search=')
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('saveMemory persists user memories via the memory store (upsert by type+name)', async () => {
    const { repos } = createFixture()
    const state = createReadingStateStore()
    const saved: UserMemory[] = []
    const memoryStore: MemoryStore = {
      list: () => saved,
      save: (input) => {
        const existing = saved.find((m) => m.id === input.id)
        const mem: UserMemory = {
          id: input.id ?? `mem_${Date.now()}`,
          type: input.type,
          name: input.name,
          description: input.description ?? '',
          body: input.body,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        }
        if (existing) {
          Object.assign(existing, mem)
          return existing
        }
        saved.push(mem)
        return mem
      }
    }
    const tools = createAgentToolHandlers({ repos, readingState: state, memories: memoryStore })

    const created = await tools.saveMemory({ type: 'user', name: '研究方向', body: '向量数据库测试' })
    expect(created.ok).toBe(true)

    const updated = await tools.saveMemory({ type: 'user', name: '研究方向', body: 'VDBMS 软件测试' })
    expect(updated.ok).toBe(true)
    expect(saved).toHaveLength(1)
    expect(saved[0].body).toBe('VDBMS 软件测试')

    const invalid = await tools.saveMemory({ type: 'bogus' as UserMemoryInput['type'], name: 'x', body: 'y' })
    expect(invalid.ok).toBe(false)
  })
})

describe('cleanSurrogates', () => {
  it('replaces lone UTF-16 surrogates so Dify Python can encode UTF-8', () => {
    expect(cleanSurrogates('abc\uD800def')).toBe('abc�def')
    expect(cleanSurrogates('abc\uDC00def')).toBe('abc�def')
    expect(cleanSurrogates('混\uD800合\uDC00字')).toBe('混�合�字')
  })

  it('preserves valid surrogate pairs (mathematical italic 𝑥 = U+1D465)', () => {
    const mathItalicX = '𝑥' // 𝑥
    expect(cleanSurrogates(`公式 ${mathItalicX} = 1`)).toBe(`公式 ${mathItalicX} = 1`)
    expect(cleanSurrogates(mathItalicX)).toBe(mathItalicX)
  })
})
