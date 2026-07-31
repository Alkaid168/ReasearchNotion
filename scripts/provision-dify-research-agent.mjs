import childProcess from 'node:child_process'
import crypto from 'node:crypto'
import { writeLocalSettings } from './research-notion-local-settings.mjs'

const appName = 'ResearchNotion Academic QA Agent'
const datasetName = 'ResearchNotion Demo Library'
const baseUrl = (process.env.DIFY_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '')
const dbContainer = process.env.DIFY_DB_CONTAINER || 'docker-db_postgres-1'
const localToolPublicBaseUrl = process.env.RESEARCH_NOTION_TOOL_BASE_URL || 'http://host.docker.internal:17777'
const localToolOpenApiUrl =
  process.env.RESEARCH_NOTION_TOOL_OPENAPI_URL ||
  `${localToolPublicBaseUrl.replace(/\/+$/, '')}/openapi.json?server=${encodeURIComponent(localToolPublicBaseUrl.replace(/\/+$/, ''))}`
const localToolOperations = [
  'get_current_context',
  'get_current_page_text',
  'get_paper_metadata',
  'get_paper_page_text',
  'get_paper_section',
  'list_library_papers',
  'search_current_paper',
  'search_library'
]
const agentToolInstructions = [
  'Agent 工具使用规则：不要只依赖一次知识库召回。',
  '用户问“这部分”“当前页”“这一节”“3.2”“选中内容”时，先调用 get_current_context。',
  '如果有选中文本，优先依据 selectedText；否则调用 get_current_page_text 或 get_paper_section。',
  '用户问整篇当前论文时，先调用 get_current_context 和 get_paper_metadata，再按需读取章节、页码或 search_current_paper。',
  '用户问当前论文库或多篇论文时，先调用 list_library_papers，再调用 search_library。',
  '中文问题检索英文论文时，先改写 English query，再调用 search_current_paper 或 search_library。',
  '最终回答说明依据来自哪篇 paper、哪一 page、哪一 section。'
].join('\n')

function execFile(file, args, options = {}) {
  return childProcess.execFileSync(file, args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    ...options
  })
}

function psql(sql) {
  return execFile('docker', ['exec', dbContainer, 'psql', '-U', 'postgres', '-d', 'dify', '-t', '-A', '-c', sql]).trim()
}

function psqlExec(sql) {
  execFile('docker', ['exec', '-i', dbContainer, 'psql', '-U', 'postgres', '-d', 'dify', '-q'], { input: sql })
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function token(prefix) {
  return `${prefix}${crypto.randomBytes(18).toString('base64url').slice(0, 24)}`
}

async function readJson(response) {
  if (response.ok) return response.json()
  throw new Error(`HTTP ${response.status}: ${await response.text()}`)
}

async function ensureDataset(datasetToken) {
  const existing = psql(`select id from datasets where name=${quote(datasetName)} order by created_at desc limit 1;`)
  if (existing) return existing

  const response = await fetch(`${baseUrl}/v1/datasets`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${datasetToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: datasetName,
      indexing_technique: 'high_quality',
      embedding_model: 'bge-m3',
      embedding_model_provider: 'langgenius/openai_api_compatible/openai_api_compatible',
      permission: 'only_me'
    })
  })
  const dataset = await readJson(response)
  return String(dataset.id)
}

function graph(datasetId) {
  const variables = [
    { label: '任务类型', variable: 'task', type: 'text-input', required: false, max_length: 128, options: [] },
    { label: '上下文类型', variable: 'contextType', type: 'text-input', required: false, max_length: 128, options: [] },
    { label: '上下文名称', variable: 'contextLabel', type: 'text-input', required: false, max_length: 256, options: [] },
    { label: '论文库 ID', variable: 'folderId', type: 'text-input', required: false, max_length: 256, options: [] },
    { label: '论文 ID', variable: 'paperId', type: 'text-input', required: false, max_length: 256, options: [] },
    {
      label: '选中文本/强调上下文',
      variable: 'emphasisContext',
      type: 'paragraph',
      required: false,
      max_length: 4096,
      options: []
    }
  ]

  return {
    nodes: [
      node('rn_start', 0, 0, 244, 193, {
        variables,
        type: 'start',
        title: '开始：接收桌面端上下文',
        selected: false
      }),
      node('rn_retrieve', 320, 0, 244, 101, {
        dataset_ids: [datasetId],
        desc: '根据用户问题，从 ResearchNotion 论文库中召回相关论文片段。',
        query_variable_selector: ['sys', 'query'],
        retrieval_mode: 'single',
        selected: false,
        single_retrieval_config: {
          model: { completion_params: { thinking: false }, mode: 'chat', name: 'deepseek-v4-flash', provider: 'langgenius/deepseek/deepseek' }
        },
        title: '知识库检索：召回论文片段',
        type: 'knowledge-retrieval'
      }),
      node('rn_router', 640, 0, 244, 125, {
        conditions: [
          {
            comparison_operator: 'contains',
            id: 'task_is_card',
            value: 'paper_card',
            variable_selector: ['rn_start', 'task']
          }
        ],
        desc: '如果任务是论文卡片生成，则进入结构化 JSON 分支；其他问题进入科研问答分支。',
        logical_operator: 'and',
        selected: false,
        title: '任务分流：问答 / 论文卡片',
        type: 'if-else'
      }),
      node('rn_card_llm', 960, -130, 244, 145, llmNode('大模型：生成论文卡片 JSON', true)),
      node('rn_qa_llm', 960, 130, 244, 145, llmNode('大模型：科研学术问答', false)),
      answerNode('rn_card_answer', 1280, -130, '回答：返回论文卡片 JSON', '{{#rn_card_llm.text#}}'),
      answerNode('rn_qa_answer', 1280, 130, '回答：返回科研问答结果', '{{#rn_qa_llm.text#}}')
    ],
    edges: [
      edge('rn_start-rn_retrieve', 'rn_start', 'rn_retrieve', 'start', 'knowledge-retrieval'),
      edge('rn_retrieve-rn_router', 'rn_retrieve', 'rn_router', 'knowledge-retrieval', 'if-else'),
      edge('rn_router-card', 'rn_router', 'rn_card_llm', 'if-else', 'llm', 'true'),
      edge('rn_router-qa', 'rn_router', 'rn_qa_llm', 'if-else', 'llm', 'false'),
      edge('rn_card_llm-answer', 'rn_card_llm', 'rn_card_answer', 'llm', 'answer'),
      edge('rn_qa_llm-answer', 'rn_qa_llm', 'rn_qa_answer', 'llm', 'answer')
    ],
    viewport: { x: 120, y: 260, zoom: 0.8 }
  }
}

function node(id, x, y, width, height, data) {
  return {
    id,
    type: 'custom',
    data,
    position: { x, y },
    positionAbsolute: { x, y },
    targetPosition: 'left',
    sourcePosition: 'right',
    width,
    height,
    selected: false
  }
}

function llmNode(title, paperCard) {
  const system = paperCard
    ? '你是 ResearchNotion 的论文卡片生成节点。请只返回 JSON，不要返回 Markdown 代码块或额外解释。必须包含字段：authors, year, oneSentenceSummary, researchProblem, methodSummary, contributions, keywords。contributions 和 keywords 必须是字符串数组。证据不足时使用空字符串或空数组，不要编造作者、年份、实验结果或结论。不要输出 <think> 或隐藏推理过程。'
    : [
        '你是 ResearchNotion 的科研学术问答智能体。',
        '回答时优先依据知识库检索结果、当前论文上下文和用户选中的强调上下文。',
        '如果证据不足，请明确说明“不知道”或“当前资料不足”，不要编造论文、作者、年份、实验数据或结论。',
        '当前上下文类型为 folder 时，只在当前论文库范围内回答，不要引用或推断当前论文库之外的论文。',
        '当前上下文类型为 paper 时，只围绕当前论文回答，不要把其他论文的结论当作当前论文内容。',
        '直接回答用户问题，不要自我介绍，不要复述用户任务，不要说“好的，作为 ResearchNotion...”。',
        '回答要结构清晰，适合科研阅读和小组作业展示。',
        agentToolInstructions,
        '不要输出 <think> 或隐藏推理过程。'
      ].join('\n')
  const user = paperCard
    ? '请根据下面的检索结果和用户请求生成论文卡片。\n\n知识库检索结果：\n{{#rn_retrieve.result#}}\n\n用户请求：{{#sys.query#}}'
    : '用户问题：{{#sys.query#}}\n当前上下文名称：{{#rn_start.contextLabel#}}\n当前上下文类型：{{#rn_start.contextType#}}\n范围提示：如果当前上下文类型是 folder，请只回答该论文库范围内的内容；如果当前上下文类型是 paper，请只回答该论文本身的内容。\n用户选中的强调上下文：{{#rn_start.emphasisContext#}}\n\n知识库检索结果：\n{{#rn_retrieve.result#}}'

  return {
    context: { enabled: true, variable_selector: ['rn_retrieve', 'result'] },
    desc: paperCard ? '根据论文检索片段生成严格 JSON 格式的论文卡片。' : '结合论文检索片段回答科研学术问题。',
    model: {
      completion_params: { temperature: paperCard ? 0.1 : 0.3, max_tokens: 2048, thinking: false },
      mode: 'chat',
      name: 'deepseek-v4-flash',
      provider: 'langgenius/deepseek/deepseek'
    },
    prompt_template: [
      { id: `${paperCard ? 'card' : 'qa'}_system`, role: 'system', text: system },
      { id: `${paperCard ? 'card' : 'qa'}_user`, role: 'user', text: user }
    ],
    selected: false,
    title,
    type: 'llm',
    variables: [
      { value_selector: ['sys', 'query'], variable: 'query' },
      { value_selector: ['rn_start', 'contextLabel'], variable: 'contextLabel' }
    ],
    vision: { enabled: false }
  }
}

function answerNode(id, x, y, title, answer) {
  return node(id, x, y, 244, 105, {
    answer,
    desc: title,
    selected: false,
    title,
    type: 'answer',
    variables: []
  })
}

function edge(id, source, target, sourceType, targetType, sourceHandle = 'source') {
  return {
    id,
    source,
    sourceHandle,
    target,
    targetHandle: 'target',
    type: 'custom',
    data: { sourceType, targetType, isInIteration: false },
    zIndex: 0
  }
}

function features() {
  return {
    opening_statement: '',
    suggested_questions: [
      '请总结当前论文库的研究主题。',
      '请解释我选中的术语。',
      '请提取这篇论文的创新点。'
    ],
    suggested_questions_after_answer: { enabled: false },
    speech_to_text: { enabled: false },
    text_to_speech: { enabled: false, voice: '', language: '' },
    retriever_resource: { enabled: true },
    annotation_reply: { enabled: false },
    more_like_this: { enabled: false },
    sensitive_word_avoidance: { enabled: false },
    file_upload: { image: { enabled: false, number_limits: 3, transfer_methods: ['local_file', 'remote_url'] } }
  }
}

function upsertWorkflowApp({ tenantId, accountId, datasetId }) {
  const existingAppId = psql(`select id from apps where name=${quote(appName)} order by created_at desc limit 1;`)
  const appId = existingAppId || crypto.randomUUID()
  const draftWorkflowId = psql(`select id from workflows where app_id='${appId}' and version='draft' limit 1;`) || crypto.randomUUID()
  const publishedWorkflowId =
    psql(`select workflow_id from apps where id='${appId}' and workflow_id is not null limit 1;`) || crypto.randomUUID()
  const appToken = psql(`select token from api_tokens where type='app' and app_id='${appId}' order by created_at desc limit 1;`) || token('app-')
  const graphJson = JSON.stringify(graph(datasetId))
  const featuresJson = JSON.stringify(features())

  if (!existingAppId) {
    psqlExec(`
BEGIN;
INSERT INTO apps (id, tenant_id, name, mode, icon, icon_background, status, enable_site, enable_api, is_demo, is_public, created_at, updated_at, created_by, updated_by, workflow_id, description, icon_type)
VALUES ('${appId}', '${tenantId}', ${quote(appName)}, 'advanced-chat', 'R', '#E4FBCC', 'normal', false, true, false, false, now(), now(), '${accountId}', '${accountId}', '${publishedWorkflowId}', 'ResearchNotion 科研学术问答智能体：负责论文知识库检索、任务分流、科研问答和论文卡片生成。', 'emoji');
INSERT INTO api_tokens (app_id, tenant_id, type, token, created_at)
VALUES ('${appId}', '${tenantId}', 'app', '${appToken}', now());
COMMIT;`)
  }

  psqlExec(`
BEGIN;
DELETE FROM workflows WHERE app_id='${appId}' AND id IN ('${draftWorkflowId}', '${publishedWorkflowId}');
INSERT INTO workflows (id, tenant_id, app_id, type, version, graph, features, created_by, created_at, updated_by, updated_at, environment_variables, conversation_variables, marked_name, marked_comment, rag_pipeline_variables)
VALUES ('${draftWorkflowId}', '${tenantId}', '${appId}', 'chat', 'draft', ${quote(graphJson)}, ${quote(featuresJson)}, '${accountId}', now(), '${accountId}', now(), '{}', '{}', '', '', '{}');
INSERT INTO workflows (id, tenant_id, app_id, type, version, graph, features, created_by, created_at, updated_by, updated_at, environment_variables, conversation_variables, marked_name, marked_comment, rag_pipeline_variables)
VALUES ('${publishedWorkflowId}', '${tenantId}', '${appId}', 'chat', to_char(now(), 'YYYY-MM-DD HH24:MI:SS.US'), ${quote(graphJson)}, ${quote(featuresJson)}, '${accountId}', now(), '${accountId}', now(), '{}', '{}', '', '', '{}');
UPDATE apps SET workflow_id='${publishedWorkflowId}', enable_api=true, updated_at=now() WHERE id='${appId}';
DELETE FROM app_dataset_joins WHERE app_id='${appId}';
INSERT INTO app_dataset_joins (app_id, dataset_id, created_at) VALUES ('${appId}', '${datasetId}', now());
COMMIT;`)

  return { appId, appToken }
}

async function main() {
  const tenantId = psql(`select tenant_id from tenant_account_joins where role='owner' limit 1;`)
  const accountId = psql(`select account_id from tenant_account_joins where role='owner' limit 1;`)
  if (!tenantId || !accountId) throw new Error('Dify owner tenant/account not found. Is Dify initialized?')

  let datasetToken = psql(`select token from api_tokens where type='dataset' and tenant_id='${tenantId}' order by created_at desc limit 1;`)
  if (!datasetToken) {
    datasetToken = token('dataset-')
    psqlExec(`insert into api_tokens (tenant_id, type, token, created_at) values ('${tenantId}', 'dataset', '${datasetToken}', now());`)
  }

  const datasetId = await ensureDataset(datasetToken)
  const { appId, appToken } = upsertWorkflowApp({ tenantId, accountId, datasetId })
  const settingsDbPath = writeLocalSettings({ baseUrl, appToken, datasetToken, datasetName, datasetId })

  console.log(`Provisioned ${appName}`)
  console.log(`App ID: ${appId}`)
  console.log(`Dataset: ${datasetName} (${datasetId})`)
  console.log(`ResearchNotion local settings updated: ${settingsDbPath}`)
  console.log(`ResearchNotion OpenAPI tools: ${localToolOpenApiUrl}`)
  console.log(`Import these Agent tool operations in Dify: ${localToolOperations.join(', ')}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
