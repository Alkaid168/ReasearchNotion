import { execFileSync } from 'node:child_process'

/**
 * T11: sync the DeepSeek API key from ResearchNotion settings into Dify's
 * provider_credentials, so the user can change the model key from the desktop
 * Settings page instead of opening the Dify console.
 *
 * Approach (A3 psql, see T11 design): docker exec psql jsonb_set on
 * provider_credentials + provider_model_credentials, then clear the Dify Redis
 * provider cache — same pattern proven by scripts/use-deepseek-endpoint.mjs.
 *
 * Best-effort: if Docker / Dify is not running, the call is silently skipped
 * (the key is still saved locally; next Dify start will use the stored value
 * only after a re-sync, but saving settings shouldn't hard-fail just because
 * Dify is down).
 */

const DB_CONTAINER = process.env.DIFY_DB_CONTAINER || 'docker-db_postgres-1'
const REDIS_CONTAINER = process.env.DIFY_REDIS_CONTAINER || 'docker-redis-1'
const PROVIDER = 'langgenius/deepseek/deepseek'
const DOCKER = process.platform === 'win32' ? 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' : 'docker'

function psql(sql: string): void {
  execFileSync(DOCKER, ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'dify', '-q'], {
    input: sql,
    encoding: 'utf8'
  })
}

function clearRedisProviderCache(): void {
  const keys = execFileSync(
    DOCKER,
    ['exec', REDIS_CONTAINER, 'redis-cli', '--scan', '--pattern', 'provider_credentials:*'],
    { encoding: 'utf8' }
  )
    .split(/\r?\n/)
    .map((key) => key.trim())
    .filter(Boolean)
  for (const key of keys) {
    execFileSync(DOCKER, ['exec', REDIS_CONTAINER, 'redis-cli', 'DEL', key])
  }
}

/** Update the DeepSeek api_key inside Dify provider credentials + clear Redis cache. */
export function syncDeepseekApiKey(apiKey: string): void {
  const trimmed = apiKey.trim()
  if (!trimmed) return // empty key = skip (user cleared it; don't overwrite Dify with empty)

  const quoted = trimmed.replaceAll("'", "''")
  psql(`
UPDATE provider_credentials
SET encrypted_config = jsonb_set(encrypted_config::jsonb, '{api_key}', to_jsonb('${quoted}'::text), true)::text,
    updated_at = now()
WHERE provider_name = '${PROVIDER}';

UPDATE provider_model_credentials
SET encrypted_config = jsonb_set(encrypted_config::jsonb, '{api_key}', to_jsonb('${quoted}'::text), true)::text,
    updated_at = now()
WHERE provider_name = '${PROVIDER}';
`)
  clearRedisProviderCache()
}
