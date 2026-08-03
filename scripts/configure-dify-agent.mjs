import childProcess from 'node:child_process'
import { writeLocalSettings } from './research-notion-local-settings.mjs'

const baseUrl = (process.env.DIFY_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '')
const dbContainer = process.env.DIFY_DB_CONTAINER || 'docker-db_postgres-1'
const appName = process.env.RESEARCH_NOTION_TOOL_AGENT_NAME || 'ResearchNotion Tool Agent'
const datasetName = process.env.RESEARCH_NOTION_DATASET_NAME || 'ResearchNotion Demo Library'

function execFile(file, args) {
  return childProcess.execFileSync(file, args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
}

function psql(sql) {
  return execFile('docker', ['exec', dbContainer, 'psql', '-U', 'postgres', '-d', 'dify', '-t', '-A', '-F', '|', '-c', sql]).trim()
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function readAgent() {
  const line = psql(
    `select a.id, a.mode, t.token from apps a join api_tokens t on t.app_id=a.id and t.type='app' where a.name=${quote(appName)} order by a.created_at desc, t.created_at desc limit 1;`
  )
  if (!line) throw new Error(`Dify Tool Agent not found: ${appName}. Run pnpm provision:dify-agent after importing local tools.`)
  const [appId, appMode, appToken] = line.split('|')
  if (appMode !== 'agent-chat') throw new Error(`Dify app ${appName} is ${appMode}, expected agent-chat.`)
  return { appId, appToken }
}

function readPreservedDataset() {
  const datasetId = psql(`select id from datasets where name=${quote(datasetName)} order by created_at desc limit 1;`)
  const datasetToken = psql(`select token from api_tokens where type='dataset' order by created_at desc limit 1;`)
  return { datasetId, datasetToken }
}

const agent = readAgent()
const dataset = readPreservedDataset()
const dbPath = writeLocalSettings({
  baseUrl,
  appToken: agent.appToken,
  datasetToken: dataset.datasetToken,
  datasetName: dataset.datasetId ? datasetName : '',
  datasetId: dataset.datasetId
})

console.log(`ResearchNotion now uses the Dify Tool Agent: ${appName} (${agent.appId})`)
console.log(`Local settings updated: ${dbPath}`)
console.log(dataset.datasetId ? `Preserved Dify knowledge library: ${datasetName} (${dataset.datasetId})` : 'No Dify knowledge library was changed.')
