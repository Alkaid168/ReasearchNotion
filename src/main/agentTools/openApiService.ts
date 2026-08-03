import http from 'node:http'
import type { AddressInfo } from 'node:net'
import type { AgentToolHandlers } from './toolHandlers'
import type { ReadingStateStore } from './readingState'

type ServiceOptions = {
  tools: AgentToolHandlers
  readingState?: ReadingStateStore
  authToken?: string
  preferredPort?: number
}

type Route = {
  method: 'GET' | 'POST'
  path: string
  operationId: string
  description: string
  queryParameters?: Array<Record<string, unknown>>
  requestSchema?: Record<string, unknown>
}

export type ToolInvocation = {
  sequence: number
  operationId: string
  paperId: string | null
  folderId: string | null
  aspectCount: number
  invokedAt: string
}

const routes: Route[] = [
  { method: 'GET', path: '/tools/current-context', operationId: 'get_current_context', description: '获取当前打开的论文、论文库、页码和选中文本。' },
  {
    method: 'GET',
    path: '/tools/library/papers',
    operationId: 'list_library_papers',
    description: '列出当前或指定论文库里的论文。',
    queryParameters: [
      {
        name: 'folderId',
        in: 'query',
        required: false,
        description: 'ResearchNotion 本地论文库 ID；为空时使用当前打开的论文库。',
        schema: { type: 'string' }
      }
    ]
  },
  {
    method: 'POST',
    path: '/tools/paper/metadata',
    operationId: 'get_paper_metadata',
    description: '读取指定论文的元数据和论文卡片。',
    requestSchema: {
      type: 'object',
      required: ['paperId'],
      additionalProperties: false,
      properties: {
        paperId: { type: 'string', description: 'ResearchNotion 本地论文 ID。' }
      }
    }
  },
  { method: 'GET', path: '/tools/current-page', operationId: 'get_current_page_text', description: '读取当前打开论文的当前页文本。' },
  {
    method: 'POST',
    path: '/tools/paper/page',
    operationId: 'get_paper_page_text',
    description: '读取指定论文的指定页文本。',
    requestSchema: {
      type: 'object',
      required: ['paperId', 'pageNumber'],
      additionalProperties: false,
      properties: {
        paperId: { type: 'string', description: 'ResearchNotion 本地论文 ID。' },
        pageNumber: { type: 'integer', minimum: 1, description: '从 1 开始的页码。' }
      }
    }
  },
  {
    method: 'POST',
    path: '/tools/paper/section',
    operationId: 'get_paper_section',
    description: '读取指定论文的指定章节。',
    requestSchema: {
      type: 'object',
      required: ['paperId', 'section'],
      additionalProperties: false,
      properties: {
        paperId: { type: 'string', description: 'ResearchNotion 本地论文 ID。' },
        section: { type: 'string', description: '章节标题或编号，例如 Introduction、3.2、Method。' }
      }
    }
  },
  {
    method: 'POST',
    path: '/tools/paper/outline',
    operationId: 'get_paper_outline',
    description: '读取指定论文的大纲、章节标题或按页回退的阅读结构，供 Agent 决定下一步读哪里。',
    requestSchema: {
      type: 'object',
      required: ['paperId'],
      additionalProperties: false,
      properties: {
        paperId: { type: 'string', description: 'ResearchNotion 本地论文 ID。' }
      }
    }
  },
  {
    method: 'POST',
    path: '/tools/paper/text-chunk',
    operationId: 'get_paper_text_chunk',
    description: '按固定大小读取指定论文的一块全文文本，适合 Agent 逐块阅读整篇论文。',
    requestSchema: {
      type: 'object',
      required: ['paperId'],
      additionalProperties: false,
      properties: {
        paperId: { type: 'string', description: 'ResearchNotion 本地论文 ID。' },
        chunkIndex: { type: 'integer', minimum: 1, default: 1, description: '从 1 开始的文本块序号。' },
        maxChars: { type: 'integer', minimum: 100, maximum: 8000, default: 4000, description: '每块最多返回的字符数。' }
      }
    }
  },
  {
    method: 'POST',
    path: '/tools/paper/investigate',
    operationId: 'investigate_paper',
    description: '仅用于一篇已识别论文的宽泛问题，每次只限一篇论文，一次返回元数据、大纲和相关页级证据。多篇问题推荐优先使用 investigate_library；若逐篇深读，每一篇都必须独立取证。检索无命中时自动回退到正文开头。',
    requestSchema: {
      type: 'object',
      required: ['paperId', 'query'],
      additionalProperties: false,
      properties: {
        paperId: { type: 'string', description: 'ResearchNotion 本地论文 ID。' },
        query: { type: 'string', description: '要调查的具体问题或由 Agent 改写出的简短中英文检索词。' },
        limit: { type: 'integer', minimum: 1, maximum: 8, default: 4, description: '最多返回的证据页数。' },
        aspects: {
          type: 'array',
          maxItems: 4,
          description: '复合问题的并列取证方面。每项单独检索；无命中时返回空证据，不以论文开头回退内容冒充答案。',
          items: {
            type: 'object',
            required: ['label', 'query'],
            additionalProperties: false,
            properties: {
              label: { type: 'string', description: '方面名称，例如 training cost、limitations、evaluation。' },
              query: { type: 'string', description: '该方面的简短中英文检索词。' }
            }
          }
        }
      }
    }
  },
  {
    method: 'POST',
    path: '/tools/current-paper/search',
    operationId: 'search_current_paper',
    description: '在当前论文内搜索相关片段。',
    requestSchema: {
      type: 'object',
      required: ['query'],
      additionalProperties: false,
      properties: {
        query: { type: 'string', description: '检索词。中文问题检索英文论文时，建议先改写成 English query。' },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 5, description: '返回片段数量。' }
      }
    }
  },
  {
    method: 'POST',
    path: '/tools/library/search',
    operationId: 'search_library',
    description: '在当前或指定论文库内搜索相关片段。',
    requestSchema: {
      type: 'object',
      required: ['query'],
      additionalProperties: false,
      properties: {
        folderId: { type: 'string', nullable: true, description: 'ResearchNotion 本地论文库 ID；为空时使用当前打开的论文库。' },
        query: { type: 'string', description: '检索词。中文问题检索英文论文时，建议先改写成 English query。' },
        limit: { type: 'integer', minimum: 1, maximum: 20, default: 5, description: '返回片段数量。' }
      }
    }
  },
  {
    method: 'POST',
    path: '/tools/library/investigate',
    operationId: 'investigate_library',
    description: '逐篇调查当前或指定论文库中的论文，为每篇返回独立正文证据。多篇论文比较、综述或冲突判断时推荐优先调用本工具；也允许逐篇深读，但每一篇都必须独立取证。',
    requestSchema: {
      type: 'object',
      required: ['query'],
      additionalProperties: false,
      properties: {
        folderId: { type: 'string', nullable: true, description: 'ResearchNotion 本地论文库 ID；为空时使用当前打开的论文库。' },
        paperIds: { type: 'array', items: { type: 'string' }, description: '可选的待调查论文 ID 列表；为空时调查当前范围内的候选论文。' },
        query: { type: 'string', description: '要调查的科研问题或简短中英文关键词。' },
        perPaperLimit: { type: 'integer', minimum: 1, maximum: 4, default: 2, description: '每篇论文最多返回的证据条数。' },
        maxPapers: { type: 'integer', minimum: 1, maximum: 12, default: 6, description: '最多调查的论文数。' },
        aspects: {
          type: 'array',
          maxItems: 4,
          description: '复合问题的并列取证方面。每篇论文都会为每个方面单独返回正文证据或空结果。',
          items: {
            type: 'object',
            required: ['label', 'query'],
            additionalProperties: false,
            properties: {
              label: { type: 'string', description: '方面名称，例如 mechanism、limitations、evaluation。' },
              query: { type: 'string', description: '该方面的简短中英文检索词。' }
            }
          }
        }
      }
    }
  },
  {
    method: 'GET',
    path: '/tools/external/arxiv',
    operationId: 'search_arxiv',
    description: '在 arXiv 上搜索外部论文。返回标题、作者、摘要、arXiv 链接。用于查找本地论文库之外的最新或相关研究。',
    queryParameters: [
      {
        name: 'query',
        in: 'query',
        required: true,
        description: '搜索关键词，建议用英文。',
        schema: { type: 'string' }
      },
      {
        name: 'maxResults',
        in: 'query',
        required: false,
        description: '返回结果数量。',
        schema: { type: 'integer', minimum: 1, maximum: 10, default: 5 }
      }
    ]
  },
  {
    method: 'GET',
    path: '/tools/external/scholar',
    operationId: 'search_semantic_scholar',
    description: '在 Semantic Scholar 上搜索外部论文。返回标题、作者、摘要、引用数、DOI。适合查找高引论文和影响力分析。',
    queryParameters: [
      {
        name: 'query',
        in: 'query',
        required: true,
        description: '搜索关键词，建议用英文。',
        schema: { type: 'string' }
      },
      {
        name: 'maxResults',
        in: 'query',
        required: false,
        description: '返回结果数量。',
        schema: { type: 'integer', minimum: 1, maximum: 10, default: 5 }
      }
    ]
  },
  {
    method: 'GET',
    path: '/tools/external/openalex',
    operationId: 'search_openalex',
    description: '在 OpenAlex 搜索外部论文（开放学术图谱，免费无 key、配额宽松）。返回标题、作者、摘要、引用数（cited_by_count）、DOI、年份。引用数与影响力分析的首选源，比 Semantic Scholar 不易限流。',
    queryParameters: [
      {
        name: 'query',
        in: 'query',
        required: true,
        description: '搜索关键词，建议用英文。',
        schema: { type: 'string' }
      },
      {
        name: 'maxResults',
        in: 'query',
        required: false,
        description: '返回结果数量。',
        schema: { type: 'integer', minimum: 1, maximum: 10, default: 5 }
      }
    ]
  },
  {
    method: 'POST',
    path: '/tools/memory/save',
    operationId: 'save_memory',
    description: '把一条用户记忆存入长期记忆库（agent 自动学习用户身份、偏好、反馈、项目、参考）。type ∈ user（身份，如研究领域/角色）/ preference（偏好，如语言/写作风格）/ feedback（用户对你之前回答的纠正）/ project（进行中的工作，如当前论文/截止日期）/ reference（外部参考，如链接/文献）。name 是简短标签，body 是具体内容。同 type+name 的记忆会被更新而不是新增。',
    requestSchema: {
      type: 'object',
      required: ['type', 'name', 'body'],
      additionalProperties: false,
      properties: {
        type: {
          type: 'string',
          enum: ['user', 'preference', 'feedback', 'project', 'reference'],
          description: '记忆类型。'
        },
        name: { type: 'string', description: '简短标签，如“研究方向”、“语言偏好”、“上次说错 X”。' },
        body: { type: 'string', description: '记忆内容。' },
        description: { type: 'string', description: '可选补充说明。' }
      }
    }
  }
]

function openApiSchema(baseUrl: string) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'ResearchNotion Local Agent Tools',
      version: '0.1.0',
      description: '本地 ResearchNotion 桌面端提供给 Dify Agent 调用的论文阅读工具。'
    },
    servers: [{ url: baseUrl }],
    paths: Object.fromEntries(
      routes.map((route) => [
        route.path,
        {
          [route.method.toLowerCase()]: {
            operationId: route.operationId,
            summary: route.description,
            ...(route.queryParameters ? { parameters: route.queryParameters } : {}),
            responses: {
              '200': {
                description: 'JSON result'
              }
            },
            ...(route.method === 'POST'
              ? {
                  requestBody: {
                    required: false,
                    content: {
                      'application/json': {
                        schema: route.requestSchema ?? { type: 'object', additionalProperties: true }
                      }
                    }
                  }
                }
              : {})
          }
        }
      ])
    )
  }
}

function publicBaseUrl(requestUrl: URL, request: http.IncomingMessage, fallbackBaseUrl: string): string {
  const explicit = requestUrl.searchParams.get('server')
  if (explicit && /^https?:\/\/[^/]+/i.test(explicit)) return explicit.replace(/\/+$/, '')

  const host = request.headers.host
  if (host) return `http://${host}`

  return fallbackBaseUrl
}

async function readRequestJson(request: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}

function sendJson(response: http.ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8'
  })
  response.end(JSON.stringify(body))
}

function isAuthorized(request: http.IncomingMessage, authToken: string | undefined): boolean {
  if (!authToken) return true
  const suppliedToken = request.headers['x-researchnotion-tool-token']
  return typeof suppliedToken === 'string' && suppliedToken === authToken
}

export function createOpenApiToolService({ tools, readingState, authToken, preferredPort = 17777 }: ServiceOptions) {
  let server: http.Server | null = null
  let baseUrl = ''
  let invocationSequence = 0
  const toolInvocations: ToolInvocation[] = []

  function recordToolInvocation(method: string | undefined, pathname: string, input: Record<string, unknown>): void {
    const route = routes.find((candidate) => candidate.method === method && candidate.path === pathname)
    if (!route) return
    toolInvocations.push({
      sequence: ++invocationSequence,
      operationId: route.operationId,
      paperId: typeof input.paperId === 'string' ? input.paperId : null,
      folderId: typeof input.folderId === 'string' ? input.folderId : null,
      aspectCount: Array.isArray(input.aspects) ? Math.min(4, input.aspects.length) : 0,
      invokedAt: new Date().toISOString()
    })
    if (toolInvocations.length > 200) toolInvocations.splice(0, toolInvocations.length - 200)
  }

  async function handle(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    try {
      if (request.method === 'OPTIONS') {
        sendJson(response, 204, {})
        return
      }
      const url = new URL(request.url ?? '/', baseUrl || 'http://127.0.0.1')
      if (request.method === 'GET' && url.pathname === '/openapi.json') {
        sendJson(response, 200, openApiSchema(publicBaseUrl(url, request, baseUrl)))
        return
      }
      if ((url.pathname.startsWith('/tools/') || url.pathname.startsWith('/internal/')) && !isAuthorized(request, authToken)) {
        sendJson(response, 401, { ok: false, error: 'Unauthorized ResearchNotion tool service request.' })
        return
      }
      if (request.method === 'GET' && url.pathname === '/internal/tool-invocations') {
        sendJson(response, 200, { ok: true, invocations: [...toolInvocations] })
        return
      }
      if (request.method === 'DELETE' && url.pathname === '/internal/tool-invocations') {
        const cleared = toolInvocations.length
        toolInvocations.length = 0
        sendJson(response, 200, { ok: true, cleared })
        return
      }
      if (request.method === 'GET' && url.pathname.startsWith('/tools/')) {
        recordToolInvocation(request.method, url.pathname, Object.fromEntries(url.searchParams.entries()))
      }
      if (request.method === 'GET' && url.pathname === '/tools/current-context') {
        sendJson(response, 200, await tools.getCurrentContext())
        return
      }
      if (request.method === 'GET' && url.pathname === '/tools/current-page') {
        sendJson(response, 200, await tools.getCurrentPageText())
        return
      }
      if (request.method === 'GET' && url.pathname === '/tools/library/papers') {
        sendJson(response, 200, await tools.listLibraryPapers({ folderId: url.searchParams.get('folderId') }))
        return
      }
      if (request.method === 'GET' && url.pathname === '/tools/external/arxiv') {
        sendJson(response, 200, await tools.searchArxiv(
          url.searchParams.get('query') ?? '',
          Number(url.searchParams.get('maxResults') ?? 5)
        ))
        return
      }
      if (request.method === 'GET' && url.pathname === '/tools/external/scholar') {
        sendJson(response, 200, await tools.searchSemanticScholar(
          url.searchParams.get('query') ?? '',
          Number(url.searchParams.get('maxResults') ?? 5)
        ))
        return
      }
      if (request.method === 'GET' && url.pathname === '/tools/external/openalex') {
        sendJson(response, 200, await tools.searchOpenalex(
          url.searchParams.get('query') ?? '',
          Number(url.searchParams.get('maxResults') ?? 5)
        ))
        return
      }
      const body = request.method === 'POST' ? await readRequestJson(request) : {}
      if (request.method === 'POST' && url.pathname.startsWith('/tools/')) {
        recordToolInvocation(request.method, url.pathname, body)
      }
      if (request.method === 'POST' && url.pathname === '/internal/reading-state') {
        if (!readingState) {
          sendJson(response, 404, { ok: false, error: 'Internal reading state endpoint is not enabled.' })
          return
        }
        sendJson(
          response,
          200,
          {
            ok: true,
            ...readingState.update({
              activeFolderId: typeof body.activeFolderId === 'string' || body.activeFolderId === null ? body.activeFolderId : undefined,
              activePaperId: typeof body.activePaperId === 'string' || body.activePaperId === null ? body.activePaperId : undefined,
              currentPage: body.currentPage === undefined ? undefined : Number(body.currentPage),
              selectedText: typeof body.selectedText === 'string' || body.selectedText === null ? body.selectedText : undefined
            })
          }
        )
        return
      }
      if (request.method === 'POST' && url.pathname === '/tools/paper/metadata') {
        sendJson(response, 200, await tools.getPaperMetadata({ paperId: String(body.paperId ?? '') }))
        return
      }
      if (request.method === 'POST' && url.pathname === '/tools/paper/page') {
        sendJson(response, 200, await tools.getPaperPageText({ paperId: String(body.paperId ?? ''), pageNumber: Number(body.pageNumber ?? 1) }))
        return
      }
      if (request.method === 'POST' && url.pathname === '/tools/paper/section') {
        sendJson(response, 200, await tools.getPaperSection({ paperId: String(body.paperId ?? ''), section: String(body.section ?? '') }))
        return
      }
      if (request.method === 'POST' && url.pathname === '/tools/paper/outline') {
        sendJson(response, 200, await tools.getPaperOutline({ paperId: String(body.paperId ?? '') }))
        return
      }
      if (request.method === 'POST' && url.pathname === '/tools/paper/text-chunk') {
        sendJson(
          response,
          200,
          await tools.getPaperTextChunk({
            paperId: String(body.paperId ?? ''),
            chunkIndex: Number(body.chunkIndex ?? 1),
            maxChars: Number(body.maxChars ?? 4000)
          })
        )
        return
      }
      if (request.method === 'POST' && url.pathname === '/tools/paper/investigate') {
        sendJson(
          response,
          200,
          await tools.investigatePaper({
            paperId: String(body.paperId ?? ''),
            query: String(body.query ?? ''),
            limit: Number(body.limit ?? 4),
            aspects: Array.isArray(body.aspects)
              ? body.aspects
                  .map((aspect) => (typeof aspect === 'object' && aspect !== null ? aspect as Record<string, unknown> : null))
                  .filter((aspect): aspect is Record<string, unknown> => Boolean(aspect))
                  .map((aspect) => ({ label: String(aspect.label ?? ''), query: String(aspect.query ?? '') }))
              : undefined
          })
        )
        return
      }
      if (request.method === 'POST' && url.pathname === '/tools/current-paper/search') {
        sendJson(response, 200, await tools.searchCurrentPaper({ query: String(body.query ?? ''), limit: Number(body.limit ?? 5) }))
        return
      }
      if (request.method === 'POST' && url.pathname === '/tools/library/search') {
        sendJson(
          response,
          200,
          await tools.searchLibrary({ folderId: typeof body.folderId === 'string' ? body.folderId : null, query: String(body.query ?? ''), limit: Number(body.limit ?? 5) })
        )
        return
      }
      if (request.method === 'POST' && url.pathname === '/tools/library/investigate') {
        sendJson(
          response,
          200,
          await tools.investigateLibrary({
            folderId: typeof body.folderId === 'string' ? body.folderId : null,
            paperIds: Array.isArray(body.paperIds) ? body.paperIds.filter((paperId): paperId is string => typeof paperId === 'string') : undefined,
            query: String(body.query ?? ''),
            perPaperLimit: Number(body.perPaperLimit ?? 2),
            maxPapers: Number(body.maxPapers ?? 6),
            aspects: Array.isArray(body.aspects)
              ? body.aspects
                  .map((aspect) => (typeof aspect === 'object' && aspect !== null ? aspect as Record<string, unknown> : null))
                  .filter((aspect): aspect is Record<string, unknown> => Boolean(aspect))
                  .map((aspect) => ({ label: String(aspect.label ?? ''), query: String(aspect.query ?? '') }))
              : undefined
          })
        )
        return
      }
      if (request.method === 'POST' && url.pathname === '/tools/memory/save') {
        const memoryType = String(body.type ?? '') as 'user' | 'preference' | 'feedback' | 'project' | 'reference'
        sendJson(
          response,
          200,
          await tools.saveMemory({
            type: memoryType,
            name: String(body.name ?? ''),
            body: String(body.body ?? ''),
            description: typeof body.description === 'string' ? body.description : undefined
          })
        )
        return
      }
      sendJson(response, 404, { ok: false, error: 'Tool endpoint not found.' })
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  function listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const candidate = http.createServer((request, response) => void handle(request, response))
      candidate.once('error', reject)
      // Bind 0.0.0.0 (not 127.0.0.1) so Dify running in Docker can reach the
      // tool service through the host gateway (host.docker.internal → 192.168.65.x).
      // 127.0.0.1 only accepts host-local connections; Docker's ssrf_proxy then
      // gets "Connection refused" and every agent tool call fails with HTTP 503.
      // The service is still gated by `authToken` (X-ResearchNotion-Tool-Token header).
      candidate.listen(port, '0.0.0.0', () => {
        candidate.off('error', reject)
        server = candidate
        const address = candidate.address() as AddressInfo
        baseUrl = `http://127.0.0.1:${address.port}`
        resolve()
      })
    })
  }

  return {
    get baseUrl() {
      return baseUrl
    },
    getStatus() {
      return {
        running: Boolean(server),
        baseUrl: baseUrl || null,
        operationCount: routes.length
      }
    },
    getInvocationCursor(): number {
      return invocationSequence
    },
    getInvocationsAfter(sequence: number): ToolInvocation[] {
      return toolInvocations.filter((invocation) => invocation.sequence > sequence)
    },
    async start(): Promise<void> {
      if (server) return
      if (preferredPort === 0) {
        await listen(0)
        return
      }
      let lastError: unknown = null
      for (let port = preferredPort; port <= preferredPort + 10; port += 1) {
        try {
          await listen(port)
          return
        } catch (error) {
          lastError = error
        }
      }
      throw lastError
    },
    stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        if (!server) {
          resolve()
          return
        }
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          server = null
          baseUrl = ''
          resolve()
        })
      })
    }
  }
}
