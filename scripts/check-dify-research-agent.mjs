import childProcess from 'node:child_process'

const expectedToolCount = 16
const toolAgentName = process.env.RESEARCH_NOTION_TOOL_AGENT_NAME || 'ResearchNotion Tool Agent'
const toolProviderName = process.env.RESEARCH_NOTION_TOOL_PROVIDER || 'ResearchNotion_Local_Tools'
const dbContainer = process.env.DIFY_DB_CONTAINER || 'docker-db_postgres-1'

function readToolAgentToken() {
  try {
    const quote = (value) => `'${String(value).replaceAll("'", "''")}'`
    return queryDifyDb(
      `select token from api_tokens where app_id = (select id from apps where name=${quote(
        toolAgentName
      )} order by created_at desc limit 1) and type='app' order by created_at desc limit 1;`
    )
  } catch {
    return ''
  }
}

function readConfig() {
  const hasEnvironmentConfig = Boolean(process.env.DIFY_BASE_URL || process.env.DIFY_APP_API_KEY || process.env.DIFY_KNOWLEDGE_API_KEY)
  return {
    baseUrl: (process.env.DIFY_BASE_URL?.trim() || 'http://127.0.0.1:8080').replace(/\/+$/, ''),
    appApiKey: process.env.DIFY_APP_API_KEY?.trim() || readToolAgentToken(),
    knowledgeApiKey: process.env.DIFY_KNOWLEDGE_API_KEY?.trim() || '',
    source: hasEnvironmentConfig ? 'env' : 'Dify local database'
  }
}

async function readJson(response) {
  if (response.ok) return response.json()
  const body = await response.text()
  throw new Error(`HTTP ${response.status}: ${body}`)
}

async function getJson(url, apiKey) {
  return readJson(
    await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` }
    })
  )
}

async function checkLocalAgentTools() {
  const openApiUrl = process.env.RESEARCH_NOTION_TOOL_OPENAPI_URL || 'http://127.0.0.1:17777/openapi.json'
  try {
    const response = await fetch(openApiUrl, { signal: AbortSignal.timeout(1500) })
    const schema = await readJson(response)
    const paths = schema.paths && typeof schema.paths === 'object' ? Object.keys(schema.paths) : []
    return {
      ok: schema.openapi?.startsWith('3.') === true && paths.includes('/tools/current-context'),
      url: openApiUrl,
      operationCount: paths.length,
      error: ''
    }
  } catch (error) {
    return {
      ok: false,
      url: openApiUrl,
      operationCount: 0,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

function queryDifyDb(sql) {
  return childProcess.execFileSync(
    'docker',
    ['exec', dbContainer, 'psql', '-U', 'postgres', '-d', 'dify', '-t', '-A', '-F', '|', '-c', sql],
    { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 }
  ).trim()
}

function checkDifyToolAgent() {
  try {
    queryDifyDb('select 1;')
  } catch (error) {
    return {
      checked: false,
      ok: false,
      providerToolCount: 0,
      agentToolCount: 0,
      agentMode: '',
      strategy: '',
      error: error instanceof Error ? error.message : String(error)
    }
  }

  try {
    const quote = (value) => `'${String(value).replaceAll("'", "''")}'`
    const providerToolCount = Number(
      queryDifyDb(
        `select coalesce(jsonb_array_length(tools_str::jsonb), 0) from tool_api_providers where name=${quote(toolProviderName)} order by created_at desc limit 1;`
      ) || 0
    )
    const agentLine = queryDifyDb(
      `select a.mode, coalesce(jsonb_array_length(amc.agent_mode::jsonb->'tools'), 0), coalesce(amc.agent_mode::jsonb->>'strategy', '') from apps a join app_model_configs amc on amc.id=a.app_model_config_id where a.name=${quote(toolAgentName)} order by a.created_at desc limit 1;`
    )
    const [agentMode = '', agentToolCountRaw = '0', strategy = ''] = agentLine.split('|')
    const agentToolCount = Number(agentToolCountRaw || 0)
    const ok =
      providerToolCount === expectedToolCount &&
      agentMode === 'agent-chat' &&
      agentToolCount === expectedToolCount &&
      strategy === 'function_call'

    return {
      checked: true,
      ok,
      providerToolCount,
      agentToolCount,
      agentMode,
      strategy,
      error: ''
    }
  } catch (error) {
    return {
      checked: true,
      ok: false,
      providerToolCount: 0,
      agentToolCount: 0,
      agentMode: '',
      strategy: '',
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

function checkDeepSeekEndpoint() {
  try {
    queryDifyDb('select 1;')
    const endpoint = queryDifyDb(
      "select encrypted_config::jsonb->>'endpoint_url' from provider_credentials where provider_name='langgenius/deepseek/deepseek' order by updated_at desc limit 1;"
    )
    return {
      checked: true,
      endpoint: endpoint || '(未配置)',
      isBridge: endpoint === 'http://host.docker.internal:17778',
      error: ''
    }
  } catch (error) {
    return {
      checked: false,
      endpoint: '',
      isBridge: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

async function main() {
  const { baseUrl, appApiKey, knowledgeApiKey, source } = readConfig()
  if (!appApiKey) {
    throw new Error('未找到 ResearchNotion Tool Agent 的 API Token。请先运行 pnpm provision:dify-agent，或设置 DIFY_APP_API_KEY。')
  }

  const info = await getJson(`${baseUrl}/v1/info`, appApiKey)
  const localTools = await checkLocalAgentTools()
  const toolAgent = checkDifyToolAgent()
  const deepSeekEndpoint = checkDeepSeekEndpoint()

  const isToolAgentApp = info.mode === 'agent-chat'

  console.log(`配置来源: ${source}`)
  console.log(`Dify App: ${info.name ?? '未命名'} (${info.mode ?? 'unknown mode'})`)
  console.log(`Knowledge API Key: ${knowledgeApiKey ? '已配置（仅论文归档同步）' : '未配置（Tool Agent 不需要）'}`)
  console.log(
    `ResearchNotion Agent 工具: ${
      localTools.ok ? `可用 (${localTools.operationCount} 个接口)` : `未连接，先启动桌面端后再检查 (${localTools.url})`
    }`
  )
  console.log(
    `Dify Tool Agent: ${
      toolAgent.checked
        ? toolAgent.ok
          ? `${toolAgentName} (${toolAgent.agentMode}, ${toolAgent.agentToolCount} tools, ${toolAgent.strategy})`
          : `配置不完整 (${
              toolAgent.error ||
              `${toolAgent.agentMode || 'missing'}, provider tools ${toolAgent.providerToolCount}, agent tools ${
                toolAgent.agentToolCount
              }, strategy ${toolAgent.strategy || 'missing'}`
            })`
        : `未检查，本地 Dify 数据库不可访问 (${dbContainer})`
    }`
  )
  console.log(
    `DeepSeek endpoint: ${
      deepSeekEndpoint.checked
        ? `${deepSeekEndpoint.endpoint}${deepSeekEndpoint.isBridge ? ' (local bridge)' : ''}`
        : `未检查 (${deepSeekEndpoint.error})`
    }`
  )

  if (!isToolAgentApp || (toolAgent.checked && !toolAgent.ok)) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
