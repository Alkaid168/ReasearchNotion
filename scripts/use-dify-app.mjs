import childProcess from 'node:child_process'
import { writeLocalSettings } from './research-notion-local-settings.mjs'

const baseUrl = (process.env.DIFY_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '')
const dbContainer = process.env.DIFY_DB_CONTAINER || 'docker-db_postgres-1'
const datasetName = process.env.RESEARCH_NOTION_DATASET_NAME || 'ResearchNotion Demo Library'

const appTargets = {
  workflow: process.env.RESEARCH_NOTION_WORKFLOW_APP_NAME || 'ResearchNotion Academic QA Agent',
  agent: process.env.RESEARCH_NOTION_TOOL_AGENT_NAME || 'ResearchNotion Tool Agent'
}

function execFile(file, args, options = {}) {
  return childProcess.execFileSync(file, args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    ...options
  })
}

function psql(sql) {
  return execFile('docker', ['exec', dbContainer, 'psql', '-U', 'postgres', '-d', 'dify', '-t', '-A', '-F', '|', '-c', sql]).trim()
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function usage() {
  return [
    'Usage:',
    '  pnpm use:dify-workflow',
    '  pnpm use:dify-agent',
    '  node scripts/use-dify-app.mjs workflow',
    '  node scripts/use-dify-app.mjs agent'
  ].join('\n')
}

function readTargetApp(target) {
  const appName = appTargets[target]
  if (!appName) {
    throw new Error(`Unknown Dify app target: ${target}\n${usage()}`)
  }

  const line = psql(
    `select a.id, a.mode, t.token from apps a join api_tokens t on t.app_id=a.id and t.type='app' where a.name=${quote(
      appName
    )} order by a.created_at desc, t.created_at desc limit 1;`
  )
  if (!line) {
    throw new Error(`Dify app not found or has no App API Key: ${appName}`)
  }

  const [appId, appMode, appToken] = line.split('|')
  return { appName, appId, appMode, appToken }
}

function readDataset() {
  const datasetId = psql(`select id from datasets where name=${quote(datasetName)} order by created_at desc limit 1;`)
  const datasetToken = psql(`select token from api_tokens where type='dataset' order by created_at desc limit 1;`)
  if (!datasetId) throw new Error(`Dify dataset not found: ${datasetName}. Run pnpm provision:dify first.`)
  if (!datasetToken) throw new Error('Dify Knowledge API Key not found. Run pnpm provision:dify first.')
  return { datasetId, datasetToken }
}

function main() {
  const target = process.argv[2]
  if (!target || target === '-h' || target === '--help') {
    console.log(usage())
    return
  }

  const app = readTargetApp(target)
  const dataset = readDataset()
  const dbPath = writeLocalSettings({
    baseUrl,
    appToken: app.appToken,
    datasetToken: dataset.datasetToken,
    datasetName,
    datasetId: dataset.datasetId
  })

  console.log(`ResearchNotion now uses Dify ${target}: ${app.appName} (${app.appMode})`)
  console.log(`App ID: ${app.appId}`)
  console.log(`Dataset: ${datasetName} (${dataset.datasetId})`)
  console.log(`Local settings updated: ${dbPath}`)
}

main()
