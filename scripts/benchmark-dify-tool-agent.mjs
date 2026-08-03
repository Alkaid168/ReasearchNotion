import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { toolServiceHeaders } from './tool-service-auth.mjs'
import { aggregateCaseRuns, computeRunScores, diffBaseline } from './benchmarkRunner.mjs'

const root = path.resolve(import.meta.dirname, '..')
const appName = process.env.RESEARCH_NOTION_TOOL_AGENT_NAME || 'ResearchNotion Tool Agent'
const dbContainer = process.env.DIFY_DB_CONTAINER || 'docker-db_postgres-1'
const dockerCommand = process.env.DOCKER_COMMAND || (process.platform === 'win32' ? 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' : 'docker')
const difyBaseUrl = (process.env.DIFY_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '')
const toolBaseUrl = 'http://127.0.0.1:17777'
const demoFolderId = 'folder_demo_researchnotion'
const attentionPaperId = 'paper_demo_2017_attention_is_all_you_need_pdf'
const bertPaperId = 'paper_demo_2018_bert_pretraining_bidirectional_transformers_pdf'
const ragPaperId = 'paper_demo_2020_rag_knowledge_intensive_nlp_pdf'
const evidenceTools = new Set([
  'investigate_paper',
  'investigate_library',
  'search_current_paper',
  'search_library',
  'get_paper_page_text',
  'get_paper_section',
  'get_paper_text_chunk'
])
const selectedCaseId = process.env.RESEARCH_NOTION_BENCHMARK_CASE?.trim()

function usesBalancedEvidence(result, paperIds) {
  if (result.tools.includes('investigate_library')) return true
  const independentlyInvestigated = new Set(
    result.invocations
      .filter((invocation) => invocation.operationId === 'investigate_paper' && typeof invocation.paperId === 'string')
      .map((invocation) => invocation.paperId)
  )
  return paperIds.every((paperId) => independentlyInvestigated.has(paperId))
}

function execFile(file, args, options = {}) {
  return childProcess.execFileSync(file, args, { cwd: root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, ...options })
}

function appToken() {
  const escapedName = appName.replaceAll("'", "''")
  const token = execFile(dockerCommand, [
    'exec', dbContainer, 'psql', '-U', 'postgres', '-d', 'dify', '-t', '-A', '-c',
    `select t.token from api_tokens t join apps a on a.id=t.app_id where a.name='${escapedName}' and t.type='app' order by t.created_at desc limit 1;`
  ]).trim()
  if (!token) throw new Error(`Dify app token was not found for ${appName}. Run pnpm provision:dify-agent first.`)
  return token
}

async function waitForJson(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  let lastError = ''
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) })
      if (response.ok) return response.json()
      lastError = `HTTP ${response.status}: ${await response.text()}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolve) => setTimeout(resolve, 800))
  }
  throw new Error(`${label} did not become ready: ${lastError}`)
}

async function waitForOk(url, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs
  let lastError = ''
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2500) })
      if (response.ok) return
      lastError = `HTTP ${response.status}: ${await response.text()}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolve) => setTimeout(resolve, 800))
  }
  throw new Error(`${label} did not become ready: ${lastError}`)
}

async function setReadingState(state) {
  const response = await fetch(`${toolBaseUrl}/internal/reading-state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...toolServiceHeaders() },
    body: JSON.stringify(state)
  })
  if (!response.ok) throw new Error(`Could not update reading state: ${await response.text()}`)
}

async function resetToolInvocations() {
  const response = await fetch(`${toolBaseUrl}/internal/tool-invocations`, {
    method: 'DELETE',
    headers: toolServiceHeaders()
  })
  if (!response.ok) throw new Error(`Could not reset tool invocation audit: ${await response.text()}`)
}

async function readToolInvocations() {
  const response = await fetch(`${toolBaseUrl}/internal/tool-invocations`, {
    headers: toolServiceHeaders()
  })
  if (!response.ok) throw new Error(`Could not read tool invocation audit: ${await response.text()}`)
  const payload = await response.json()
  return Array.isArray(payload.invocations) ? payload.invocations : []
}

function parseStream(text) {
  const tools = []
  const evidencePaperIds = new Set()
  let answer = ''
  let conversationId = ''

  function collectPaperIds(value, depth = 0) {
    if (depth > 8 || value === null || value === undefined) return
    if (typeof value === 'string') {
      for (const match of value.matchAll(/\bpaper_demo_[a-z0-9_]+\b/g)) {
        evidencePaperIds.add(match[0])
      }
      const trimmed = value.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          collectPaperIds(JSON.parse(trimmed), depth + 1)
        } catch {
          // Tool observations can contain plain text as well as JSON.
        }
      }
      return
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectPaperIds(item, depth + 1))
      return
    }
    if (typeof value !== 'object') return
    if (typeof value.paperId === 'string') evidencePaperIds.add(value.paperId)
    if (value.paper && typeof value.paper === 'object' && typeof value.paper.id === 'string') {
      evidencePaperIds.add(value.paper.id)
    }
    Object.values(value).forEach((item) => collectPaperIds(item, depth + 1))
  }

  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('data: ')) continue
    try {
      const event = JSON.parse(line.slice(6))
      if (process.env.RESEARCH_NOTION_BENCHMARK_DEBUG === '1' && event.event === 'agent_thought') {
        console.log(
          JSON.stringify({
            eventKeys: Object.keys(event),
            tool: event.tool,
            toolInputPreview:
              typeof event.tool_input === 'string'
                ? event.tool_input.slice(0, 320)
                : JSON.stringify(event.tool_input ?? null).slice(0, 320),
            observationType: typeof event.observation,
            observationPaperIds:
              typeof event.observation === 'string'
                ? [...event.observation.matchAll(/\bpaper_demo_[a-z0-9_]+\b/g)].map((match) => match[0])
                : [],
            observationPreview:
              typeof event.observation === 'string'
                ? event.observation.slice(0, 240)
                : JSON.stringify(event.observation ?? null).slice(0, 240)
          })
        )
      }
      if (event.event === 'agent_thought' && typeof event.tool === 'string') {
        const eventTools = event.tool.split(/[;,]/).map((tool) => tool.trim()).filter(Boolean)
        tools.push(...eventTools)
        if (eventTools.some((tool) => evidenceTools.has(tool))) collectPaperIds(event.observation)
      }
      if (typeof event.conversation_id === 'string' && event.conversation_id) {
        conversationId = event.conversation_id
      }
      if (typeof event.answer === 'string') answer += event.answer
    } catch {
      // Keep the benchmark resilient to one malformed stream event.
    }
  }
  return { answer: answer.trim(), conversationId, tools: [...new Set(tools)], evidencePaperIds: [...evidencePaperIds] }
}

async function ask(token, query, user, conversationId = '') {
  await resetToolInvocations()
  const response = await fetch(`${difyBaseUrl}/v1/chat-messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inputs: {}, response_mode: 'streaming', conversation_id: conversationId, user, query })
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Dify HTTP ${response.status}: ${text}`)
  const result = parseStream(text)
  const invocations = await readToolInvocations()
  const tools = new Set(result.tools)
  const evidencePaperIds = new Set(result.evidencePaperIds)
  for (const invocation of invocations) {
    if (typeof invocation?.operationId !== 'string') continue
    tools.add(invocation.operationId)
    if (evidenceTools.has(invocation.operationId) && typeof invocation.paperId === 'string') {
      evidencePaperIds.add(invocation.paperId)
    }
  }
  return { ...result, tools: [...tools], evidencePaperIds: [...evidencePaperIds], invocations }
}

const cases = [
  {
    id: 'outline',
    scope: 'paper',
    query: '当前论文一共有多少个主要章节？请列出一级章节，并说明你的统计口径。',
    requiredTools: ['get_current_context', 'get_paper_outline'],
    expected: /Introduction|Model Architecture|Conclusion/i
  },
  {
    id: 'full-paper',
    scope: 'paper',
    query: '综合当前论文全文，说明研究问题、核心方法、主要创新和实验结论；每部分给出论文中的对应依据。',
    toolPath: (tools) =>
      tools.includes('investigate_paper') ||
      (tools.includes('get_paper_outline') && (tools.includes('get_paper_section') || tools.includes('get_paper_text_chunk'))),
    expected: /Transformer|自注意力|注意力/i
  },
  {
    id: 'library',
    scope: 'folder',
    query: '当前论文库有哪些论文？按标题和年份列出，并说明它们分别研究什么。',
    requiredTools: ['list_library_papers'],
    expected: /BERT|Attention|RAG/i
  },
  {
    id: 'comparison',
    scope: 'folder',
    query: '比较当前论文库里的 BERT、Transformer 和 RAG：它们各自解决什么问题，核心机制有什么不同？',
    requiredTools: ['list_library_papers'],
    evidenceStrategy: (result) => usesBalancedEvidence(result, [attentionPaperId, bertPaperId, ragPaperId]),
    requiredEvidencePaperIds: [attentionPaperId, bertPaperId, ragPaperId],
    expected: /BERT[\s\S]*(Transformer|注意力)[\s\S]*RAG|RAG[\s\S]*(Transformer|注意力)[\s\S]*BERT/i
  },
  {
    id: 'follow-up',
    scope: 'folder',
    query: '请分析《Attention Is All You Need》的核心方法，并给出论文原文依据。',
    followUpQuery: '那篇论文的方法再展开一下，并给出新的原文依据。',
    toolPath: (tools) => tools.some((tool) => evidenceTools.has(tool)),
    requiredEvidencePaperIds: [attentionPaperId],
    expected: /Transformer|self-attention|自注意力|多头注意力/i
  },
  {
    id: 'corrected-reference',
    scope: 'folder',
    query: '请用当前论文库中的原文证据概括《Attention Is All You Need》的核心方法。',
    followUpQuery: '更正一下：我现在要问的是 BERT，不是 Transformer。请重新读取 BERT 论文原文，再说明它的预训练表示有什么特点。',
    toolPath: (tools) => tools.some((tool) => evidenceTools.has(tool)),
    requiredEvidencePaperIds: [bertPaperId],
    expected: /BERT[\s\S]*(bidirectional|双向|pre-train|预训练)/i
  },
  {
    id: 'experiment-evidence',
    scope: 'paper',
    query: '当前论文在哪些机器翻译任务上评估，实验结果是否超过既有工作？请给出论文实验依据，不要根据常识猜测。',
    requiredTools: ['get_current_context'],
    toolPath: (tools) => tools.some((tool) => evidenceTools.has(tool)),
    requiredEvidencePaperIds: [attentionPaperId],
    expected: /WMT|BLEU|English-to-German|English-to-French/i
  },
  {
    id: 'compound-aspects',
    scope: 'paper',
    query:
      '请分别依据当前论文原文回答三个方面：核心机制、实验评估，以及作者是否明确报告碳捕集应用。每个方面都要单独取证；没有原文证据的方面必须标为尚未确认，不要根据常识补造。',
    requiredTools: ['get_current_context', 'investigate_paper'],
    aspectPath: (invocations) =>
      invocations
        .filter((invocation) => invocation.operationId === 'investigate_paper')
        .reduce((aspectCount, invocation) => aspectCount + Number(invocation.aspectCount ?? 0), 0) >= 3,
    requiredEvidencePaperIds: [attentionPaperId],
    expected: /(?=.*(?:self-attention|自注意力))(?=.*(?:WMT|BLEU))(?=.*(?:尚未确认|未确认|没有.{0,12}证据))/is
  },
  {
    id: 'limitations',
    scope: 'folder',
    query: '比较当前论文库中 Transformer、BERT 和 RAG 各自明确报告的局限或潜在限制；若某篇未明确报告，必须标为尚未确认，不要补造。',
    requiredTools: ['list_library_papers'],
    evidenceStrategy: (result) => usesBalancedEvidence(result, [attentionPaperId, bertPaperId, ragPaperId]),
    requiredEvidencePaperIds: [attentionPaperId, bertPaperId, ragPaperId],
    expected: /Transformer|BERT|RAG/i
  },
  {
    id: 'bilingual-comparison',
    scope: 'folder',
    query: 'Use Chinese to compare Transformer, BERT, and RAG: 它们在表示、预训练或检索增强机制上有什么差异？每篇都要给出本地论文证据。',
    requiredTools: ['list_library_papers'],
    evidenceStrategy: (result) => usesBalancedEvidence(result, [attentionPaperId, bertPaperId, ragPaperId]),
    requiredEvidencePaperIds: [attentionPaperId, bertPaperId, ragPaperId],
    expected: /BERT[\s\S]*(Transformer|注意力)[\s\S]*RAG|RAG[\s\S]*(Transformer|注意力)[\s\S]*BERT/i
  },
  {
    id: 'claim-audit',
    scope: 'folder',
    query:
      '请核查这个说法：BERT 只是把 Transformer 的编码器改成双向，并没有训练目标创新。请把说法拆成若干子命题，逐项用当前论文库中 BERT 与 Attention Is All You Need 的正文证据标为支持、反驳或尚未确认；不要用通用常识补全。',
    requiredTools: ['list_library_papers'],
    evidenceStrategy: (result) => usesBalancedEvidence(result, [attentionPaperId, bertPaperId]),
    requiredEvidencePaperIds: [attentionPaperId, bertPaperId],
    expected: /(?=.*(?:BERT|MLM|masked|掩码))(?=.*(?:反驳|不支持|不成立|contradict))/is
  }
]

async function main() {
  await waitForJson(`${toolBaseUrl}/openapi.json`, 5000, 'ResearchNotion tool service')
  await waitForOk(difyBaseUrl, 5000, 'Dify')
  const token = appToken()
  const results = []
  try {
    const selectedCases = selectedCaseId ? cases.filter((benchmarkCase) => benchmarkCase.id === selectedCaseId) : cases
    if (selectedCases.length === 0) throw new Error(`Unknown benchmark case: ${selectedCaseId}`)
    const k = Math.max(1, Number(process.env.RESEARCH_NOTION_BENCHMARK_K ?? 3))
    for (const benchmarkCase of selectedCases) {
      const runs = []
      for (let runIndex = 0; runIndex < k; runIndex += 1) {
        await setReadingState({
          activeFolderId: demoFolderId,
          activePaperId: benchmarkCase.scope === 'paper' ? attentionPaperId : null,
          currentPage: 1,
          selectedText: null
        })
        const user = `research-notion-benchmark-${benchmarkCase.id}-run${runIndex}`
        let result = await ask(token, benchmarkCase.query, user)
        if (benchmarkCase.followUpQuery) {
          if (!result.conversationId) throw new Error(`Benchmark ${benchmarkCase.id} did not return a Dify conversation id.`)
          result = await ask(token, benchmarkCase.followUpQuery, user, result.conversationId)
        }
        const requiredToolsPass = (benchmarkCase.requiredTools ?? []).every((tool) => result.tools.includes(tool))
        const toolPathPass = benchmarkCase.toolPath ? benchmarkCase.toolPath(result.tools) : true
        const aspectPathPass = benchmarkCase.aspectPath ? benchmarkCase.aspectPath(result.invocations) : true
        const evidenceStrategyPass = benchmarkCase.evidenceStrategy ? benchmarkCase.evidenceStrategy(result) : true
        const evidenceCoveragePass = (benchmarkCase.requiredEvidencePaperIds ?? []).every((paperId) =>
          result.evidencePaperIds.includes(paperId)
        )
        const answerPass = benchmarkCase.expected.test(result.answer)
        const passed =
          requiredToolsPass && toolPathPass && aspectPathPass && evidenceStrategyPass && evidenceCoveragePass && answerPass
        const scores = computeRunScores(result, benchmarkCase)
        runs.push({
          passed,
          toolRecall: scores.toolRecall,
          evidenceCoverage: scores.evidenceCoverage,
          answerQuality: scores.answerQuality,
          score: scores.score,
          tools: result.tools,
          evidencePaperIds: result.evidencePaperIds,
          answer: result.answer.replace(/\s+/g, ' ').slice(0, 300),
          requiredToolsPass,
          toolPathPass,
          aspectPathPass,
          evidenceStrategyPass,
          evidenceCoveragePass,
          answerPass
        })
      }
      const aggregate = aggregateCaseRuns(runs)
      results.push({ id: benchmarkCase.id, runs, ...aggregate })
    }
  } finally {
    await setReadingState({ activeFolderId: null, activePaperId: null, currentPage: 1, selectedText: null })
  }

  console.table(
    results.map(({ id, passK, pass1, scoreAvg, runCount }) => ({
      id,
      passK,
      pass1,
      scoreAvg: Number(scoreAvg.toFixed(2)),
      runCount
    }))
  )

  const meta = {
    timestamp: new Date().toISOString(),
    model: process.env.RESEARCH_NOTION_BENCHMARK_MODEL || 'langgenius/deepseek/deepseek/deepseek-v4-flash',
    k: Number(process.env.RESEARCH_NOTION_BENCHMARK_K ?? 3),
    dify: { baseUrl: difyBaseUrl, appMode: 'agent-chat', appName }
  }
  const dimensionAvg = {
    toolRecall: avg(results.flatMap((entry) => entry.runs.map((run) => run.toolRecall))),
    evidenceCoverage: avg(results.flatMap((entry) => entry.runs.map((run) => run.evidenceCoverage))),
    answerQuality: avg(results.flatMap((entry) => entry.runs.map((run) => run.answerQuality)))
  }
  const report = {
    meta,
    toolCases: results,
    aggregates: {
      tool_passK: `${results.filter((entry) => entry.passK).length}/${results.length}`,
      tool_pass1: `${results.filter((entry) => entry.pass1).length}/${results.length}`,
      dimensionAvg
    }
  }

  fs.mkdirSync(path.resolve(root, 'bench'), { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = path.resolve(root, 'bench', `agent-eval-${stamp}.json`)
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(`benchmark report written: ${reportPath}`)

  const baselineEnv = process.env.RESEARCH_NOTION_BENCHMARK_BASELINE
  if (baselineEnv) {
    const baselinePath = path.resolve(root, baselineEnv)
    if (fs.existsSync(baselinePath)) {
      const baselineFile = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
      const baselineCases = (baselineFile.toolCases ?? baselineFile.trustCases ?? []).map((entry) => ({
        id: entry.id,
        passK: entry.passK,
        scoreAvg: entry.scoreAvg ?? 0
      }))
      const regressions = diffBaseline(
        results.map((entry) => ({ id: entry.id, passK: entry.passK, scoreAvg: entry.scoreAvg })),
        baselineCases,
        Number(process.env.RESEARCH_NOTION_BENCHMARK_REGRESSION_THRESHOLD ?? 0.1)
      )
      if (regressions.length) {
        throw new Error(
          `Agent benchmark regressions vs ${baselineEnv}:\n${regressions.map((reg) => `${reg.id}: ${reg.reason}`).join('\n')}`
        )
      }
      console.log(`no regressions vs ${baselineEnv}`)
    }
  }

  const failures = results.filter((result) => !result.passK)
  if (failures.length) {
    throw new Error(
      `Agent benchmark pass^k failures:\n${failures
        .map((result) => `${result.id} [pass^k=false, scoreAvg=${result.scoreAvg.toFixed(2)}]: ${result.runs[0]?.answer ?? ''}`)
        .join('\n')}`
    )
  }
}

function avg(values) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
