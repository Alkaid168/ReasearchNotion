import childProcess from 'node:child_process'

const dbContainer = process.env.DIFY_DB_CONTAINER || 'docker-db_postgres-1'
const redisContainer = process.env.DIFY_REDIS_CONTAINER || 'docker-redis-1'
const providerName = process.env.DIFY_DEEPSEEK_PROVIDER || 'langgenius/deepseek/deepseek'
const bridgeEndpoint = process.env.DEEPSEEK_BRIDGE_ENDPOINT || 'http://host.docker.internal:17778'
const officialEndpoint = process.env.DEEPSEEK_OFFICIAL_ENDPOINT || 'https://api.deepseek.com'

function execFile(file, args, options = {}) {
  return childProcess.execFileSync(file, args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    ...options
  })
}

function psql(sql) {
  return execFile('docker', ['exec', dbContainer, 'psql', '-U', 'postgres', '-d', 'dify', '-t', '-A', '-c', sql]).trim()
}

function quote(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function endpointForMode(mode) {
  if (mode === 'bridge') return bridgeEndpoint
  if (mode === 'official') return officialEndpoint
  throw new Error('Usage: node scripts/use-deepseek-endpoint.mjs <bridge|official|status>')
}

function currentEndpoint() {
  return psql(
    `select encrypted_config::jsonb->>'endpoint_url' from provider_credentials where provider_name=${quote(providerName)} order by updated_at desc limit 1;`
  )
}

function setEndpoint(endpoint) {
  const sql = `
update provider_credentials
set encrypted_config = jsonb_set(encrypted_config::jsonb, '{endpoint_url}', to_jsonb(${quote(endpoint)}::text), true)::text,
    updated_at = now()
where provider_name = ${quote(providerName)};

update provider_model_credentials
set encrypted_config = jsonb_set(encrypted_config::jsonb, '{endpoint_url}', to_jsonb(${quote(endpoint)}::text), true)::text,
    updated_at = now()
where provider_name = ${quote(providerName)};
`
  execFile('docker', ['exec', '-i', dbContainer, 'psql', '-U', 'postgres', '-d', 'dify', '-q'], { input: sql })
}

function redisScan(pattern) {
  try {
    const output = execFile('docker', ['exec', redisContainer, 'redis-cli', '--scan', '--pattern', pattern])
    return output
      .split(/\r?\n/)
      .map((key) => key.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function clearRedisCaches() {
  const patterns = ['provider_credentials:*', '*deepseek*__DIFY_TS__*']
  const keys = [...new Set(patterns.flatMap((pattern) => redisScan(pattern)))]
  for (const key of keys) {
    execFile('docker', ['exec', redisContainer, 'redis-cli', 'DEL', key])
  }
  return keys.length
}

function main() {
  const mode = process.argv[2] || 'status'
  if (mode === 'status') {
    console.log(`Dify DeepSeek endpoint: ${currentEndpoint() || '(not configured)'}`)
    return
  }

  const endpoint = endpointForMode(mode)
  setEndpoint(endpoint)
  const cleared = clearRedisCaches()
  console.log(`Dify DeepSeek endpoint set to: ${endpoint}`)
  console.log(`Cleared ${cleared} Dify Redis cache key(s).`)
}

main()
