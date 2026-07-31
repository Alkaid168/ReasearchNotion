import childProcess from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { toolServiceHeaders } from './tool-service-auth.mjs'

const root = path.resolve(import.meta.dirname, '..')
const toolAgentName = process.env.RESEARCH_NOTION_TOOL_AGENT_NAME || 'ResearchNotion Tool Agent'
const dbContainer = process.env.DIFY_DB_CONTAINER || 'docker-db_postgres-1'
const difyBaseUrl = (process.env.DIFY_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '')
const bridgeHealthUrl = 'http://127.0.0.1:17778/health'
const toolBaseUrl = 'http://127.0.0.1:17777'
const smokePaperId = 'paper_demo_2017_attention_is_all_you_need_pdf'
const smokeFolderId = 'folder_demo_researchnotion'

const startedProcesses = []

function execFile(file, args, options = {}) {
  return childProcess.execFileSync(file, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    ...options
  })
}

function spawnLogged(label, file, args, logFile) {
  const output = fs.openSync(path.join(root, logFile), 'w')
  const proc = childProcess.spawn(file, args, {
    cwd: root,
    stdio: ['ignore', output, output],
    shell: false,
    windowsHide: true
  })
  startedProcesses.push({ label, proc })
  return proc
}

function stopStartedProcesses() {
  for (const { proc } of startedProcesses.reverse()) {
    if (proc.exitCode !== null) continue
    try {
      if (process.platform === 'win32') {
        childProcess.execFileSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
      } else {
        proc.kill('SIGTERM')
      }
    } catch {
      // Best-effort cleanup for smoke helpers.
    }
  }
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
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`${label} did not become ready: ${lastError}`)
}

async function ensureDeepSeekBridge() {
  try {
    await waitForJson(bridgeHealthUrl, 1500, 'DeepSeek bridge')
    return
  } catch {
    spawnLogged('DeepSeek bridge', process.execPath, ['scripts/deepseek-bridge.mjs'], 'smoke-deepseek-bridge.log')
    await waitForJson(bridgeHealthUrl, 30000, 'DeepSeek bridge')
  }
}

async function ensureDesktopToolService() {
  try {
    await waitForJson(`${toolBaseUrl}/openapi.json`, 1500, 'ResearchNotion tool service')
    return
  } catch {
    const devCommand =
      process.platform === 'win32'
        ? { file: 'cmd.exe', args: ['/d', '/s', '/c', 'pnpm dev'] }
        : { file: 'pnpm', args: ['dev'] }
    spawnLogged(
      'ResearchNotion desktop tool service',
      devCommand.file,
      devCommand.args,
      'smoke-research-notion-dev.log'
    )
    await waitForJson(`${toolBaseUrl}/openapi.json`, 90000, 'ResearchNotion tool service')
  }
}

function queryDifyDb(sql) {
  return execFile('docker', ['exec', dbContainer, 'psql', '-U', 'postgres', '-d', 'dify', '-t', '-A', '-c', sql]).trim()
}

function appToken() {
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`
  const token = queryDifyDb(
    `select t.token from api_tokens t join apps a on a.id=t.app_id where a.name=${quote(toolAgentName)} and t.type='app' order by t.created_at desc limit 1;`
  )
  if (!token) throw new Error(`Dify app token not found for ${toolAgentName}. Run pnpm provision:dify-agent first.`)
  return token
}

async function setReadingState() {
  const response = await fetch(`${toolBaseUrl}/internal/reading-state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...toolServiceHeaders() },
    body: JSON.stringify({
      activeFolderId: smokeFolderId,
      activePaperId: smokePaperId,
      currentPage: 1,
      selectedText: 'scaled dot-product attention'
    })
  })
  const body = await response.json()
  if (!response.ok || body.ok !== true) {
    throw new Error(`Failed to set smoke reading state: ${JSON.stringify(body)}`)
  }
}

async function assertLocalToolsReady() {
  const context = await (await fetch(`${toolBaseUrl}/tools/current-context`, { headers: toolServiceHeaders() })).json()
  if (context.activePaper?.id !== smokePaperId) {
    throw new Error(`Current context did not lock onto ${smokePaperId}: ${JSON.stringify(context)}`)
  }

  const page = await (await fetch(`${toolBaseUrl}/tools/current-page`, { headers: toolServiceHeaders() })).json()
  if (!page.ok || !String(page.text || '').toLowerCase().includes('attention')) {
    throw new Error(`Current page tool did not return paper text: ${JSON.stringify(page).slice(0, 500)}`)
  }

  const outline = await (
    await fetch(`${toolBaseUrl}/tools/paper/outline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...toolServiceHeaders() },
      body: JSON.stringify({ paperId: smokePaperId })
    })
  ).json()
  if (!outline.ok || !Array.isArray(outline.outline) || outline.outline.length === 0) {
    throw new Error(`Paper outline tool did not return a usable outline: ${JSON.stringify(outline).slice(0, 500)}`)
  }
}

function parseDifyStream(text) {
  const events = []
  let answer = ''
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('data: ')) continue
    const payload = line.slice(6).trim()
    if (!payload || payload === '[DONE]') continue
    try {
      const event = JSON.parse(payload)
      events.push(event)
      if (event.event === 'agent_thought' && typeof event.tool === 'string' && event.tool) answer = ''
      if (typeof event.answer === 'string') answer += event.answer
    } catch {
      // Dify server-sent events should be JSON, but keep smoke parsing tolerant.
    }
  }
  return { events, answer, raw: text }
}

async function callToolAgent(token, query, user) {
  const response = await fetch(`${difyBaseUrl}/v1/chat-messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      inputs: {},
      response_mode: 'streaming',
      conversation_id: '',
      user,
      query
    })
  })

  const text = await response.text()
  if (!response.ok) throw new Error(`Dify HTTP ${response.status}: ${text}`)
  return parseDifyStream(text)
}

async function main() {
  try {
    await ensureDeepSeekBridge()
    execFile(process.execPath, ['scripts/use-deepseek-endpoint.mjs', 'bridge'])
    await ensureDesktopToolService()
    await setReadingState()
    await assertLocalToolsReady()

    const token = appToken()
    const result = await callToolAgent(
      token,
      '完成必要工具调用后，直接用中文一句话说明当前打开的论文标题、大纲是否可用，以及当前页主要内容。必须先获取当前状态，并使用当前状态中的 activePaper.id 作为 paperId 读取论文大纲；不要在最终回答中描述你调用了哪些工具。',
      'research-notion-paper-smoke'
    )
    const raw = result.raw
    const hasContextTool = raw.includes('get_current_context')
    const hasOutlineTool = raw.includes('get_paper_outline')
    const hasPageTool = raw.includes('get_current_page_text')
    const hasEnd = raw.includes('message_end')
    const hasModelError = /completion_request_error|Server Unavailable|SSLEOF|SSL_ERROR/i.test(raw)
    const hasOutlineFailure = /缺少\s*paperId|paperId\s*参数|大纲.*(未能|不可用|失败)|论文不存在/.test(result.answer)
    const hasToolNarration = /(^|\s)(好的|现在|我先|首先).{0,24}(调用|get_current_context|get_paper_outline|get_current_page_text)|调用\s+get_/i.test(
      result.answer
    )

    if (hasModelError || hasOutlineFailure || hasToolNarration || !hasContextTool || !hasOutlineTool || !hasPageTool || !hasEnd) {
      throw new Error(
        [
          'Tool Agent paper smoke failed.',
          `get_current_context: ${hasContextTool}`,
          `get_paper_outline: ${hasOutlineTool}`,
          `get_current_page_text: ${hasPageTool}`,
          `message_end: ${hasEnd}`,
          `model_error: ${hasModelError}`,
          `outline_failure: ${hasOutlineFailure}`,
          `tool_narration: ${hasToolNarration}`,
          `answer: ${result.answer.slice(0, 500)}`
        ].join('\n')
      )
    }

    const broadResult = await callToolAgent(
      token,
      '请基于当前打开的论文，综合说明它要解决的研究问题、核心方法和主要局限。不要只说资料不足。',
      'research-notion-paper-investigation-smoke'
    )
    const broadRaw = broadResult.raw
    const hasInvestigationTool = broadRaw.includes('investigate_paper')
    const hasOutlineEvidence = broadRaw.includes('get_paper_outline')
    const hasSectionEvidence =
      broadRaw.includes('get_paper_section') || broadRaw.includes('get_paper_text_chunk') || broadRaw.includes('get_paper_page_text')
    const hasBroadEvidenceTool = hasInvestigationTool || (hasOutlineEvidence && hasSectionEvidence)
    const broadHasEnd = broadRaw.includes('message_end')
    const broadHasSubstance = /Transformer|自注意力|研究问题|核心方法/.test(broadResult.answer)
    const broadRefused = /^(?:我不知道|不知道|当前资料不足|资料不足)/.test(broadResult.answer.trim())
    if (!hasBroadEvidenceTool || !broadHasEnd || !broadHasSubstance || broadRefused) {
      throw new Error(
        [
          'Tool Agent broad-paper investigation smoke failed.',
          `investigate_paper: ${hasInvestigationTool}`,
          `outline_plus_section: ${hasOutlineEvidence && hasSectionEvidence}`,
          `message_end: ${broadHasEnd}`,
          `substantive_answer: ${broadHasSubstance}`,
          `refused: ${broadRefused}`,
          `answer: ${broadResult.answer.slice(0, 500)}`
        ].join('\n')
      )
    }

    console.log('Tool Agent paper smoke passed')
    console.log(`Paper: ${smokePaperId}`)
    console.log(`Answer: ${result.answer.replace(/\s+/g, ' ').trim().slice(0, 500)}`)
    console.log(`Broad answer: ${broadResult.answer.replace(/\s+/g, ' ').trim().slice(0, 500)}`)
  } finally {
    stopStartedProcesses()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  stopStartedProcesses()
  process.exitCode = 1
})
