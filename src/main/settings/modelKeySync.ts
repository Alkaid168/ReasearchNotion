import { execFileSync } from 'node:child_process'
import type { ModelProvider } from '../../shared/types'

/**
 * 把模型档配置（provider + llm_api_key + model_name）同步到本机 Dify：
 *   ① provider_credentials.api_key  （LLM 厂商密钥，Dify 调 LLM 用）
 *   ② app_model_configs.model JSON  （Tool Agent app 用哪个 provider+model）
 *   ③ 清 Redis provider 缓存
 *
 * 复用 syncDeepseekApiKey 已验证的 psql + redis 模式。best-effort：若 Docker /
 * Dify 不可用，调用静默失败（不应因 Dify 没开就阻止保存模型档）。
 *
 * 前提：用户需在 Dify 控制台为 Qwen / Zhipu 配置一次 credentials（建行），
 * 之后桌面端改 key 走 UPDATE。DeepSeek 是 image 预装，已有行。
 */

const DB_CONTAINER = process.env.DIFY_DB_CONTAINER || 'docker-db_postgres-1'
const REDIS_CONTAINER = process.env.DIFY_REDIS_CONTAINER || 'docker-redis-1'
const PROVIDER = 'langgenius/deepseek/deepseek'
const DOCKER = process.platform === 'win32' ? 'C:/Program Files/Docker/Docker/resources/bin/docker.exe' : 'docker'
const TOOL_AGENT_APP_NAME = process.env.DIFY_TOOL_AGENT_APP_NAME || 'ResearchNotion Tool Agent'

/** ResearchNotion ModelProvider → Dify provider_name（plugin identifier）。
 *  Qwen/Zhipu 的确切名待装完插件后从 providers 表核对（当前为推测值）。 */
const PROVIDER_NAME: Record<ModelProvider, string> = {
  deepseek: 'langgenius/deepseek/deepseek',
  qwen: 'langgenius/tongyi/tongyi',
  zhipu: 'langgenius/zhipuai/zhipuai'
}

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

/** Update the api_key inside Dify provider credentials（保留 encrypted_config 其他字段）。
 *  要求该 provider 在 Dify 已配置（行存在）；否则 UPDATE 0 行，需用户先去控制台配。 */
function syncProviderApiKey(provider: ModelProvider, apiKey: string): void {
  const trimmed = apiKey.trim()
  if (!trimmed) return
  const providerName = PROVIDER_NAME[provider]
  const quoted = trimmed.replaceAll("'", "''")
  psql(`
UPDATE provider_credentials
SET encrypted_config = jsonb_set(encrypted_config::jsonb, '{api_key}', to_jsonb('${quoted}'::text), true)::text,
    updated_at = now()
WHERE provider_name = '${providerName}';

UPDATE provider_model_credentials
SET encrypted_config = jsonb_set(encrypted_config::jsonb, '{api_key}', to_jsonb('${quoted}'::text), true)::text,
    updated_at = now()
WHERE provider_name = '${providerName}';
`)
}

/** 改 Tool Agent app 当前 model_config 的 model JSON 指向新 provider+model。
 *  保留 completion_params（temperature/top_p 等），但删除 max_tokens —— 不同模型
 *  max_tokens 上限不同（如 GLM-4-Flash ≤ 4095，DeepSeek 384K），保留旧值会超限报错。
 *  删除后由 Dify 用目标模型自己的默认上限。 */
function updateAppModelConfig(provider: ModelProvider, modelName: string): void {
  const providerName = PROVIDER_NAME[provider]
  const modelQuoted = modelName.replaceAll("'", "''")
  psql(`
UPDATE app_model_configs
SET model = jsonb_build_object(
      'provider', '${providerName}',
      'name', '${modelQuoted}',
      'mode', 'chat',
      'completion_params', COALESCE((model::jsonb)->'completion_params', '{}'::jsonb) - 'max_tokens'
    )::text,
    updated_at = now()
WHERE id = (SELECT app_model_config_id FROM apps WHERE name = '${TOOL_AGENT_APP_NAME}');
`)
}

/** 应用一个模型档：同步 key + 改 app model + 清缓存。原子 best-effort。 */
export function applyModelProfile(provider: ModelProvider, apiKey: string, modelName: string): void {
  if (!apiKey.trim()) return
  syncProviderApiKey(provider, apiKey)
  updateAppModelConfig(provider, modelName)
  clearRedisProviderCache()
}

/** 兼容旧 settings.save 路径：仅同步 DeepSeek key（不动 app model）。 */
export function syncDeepseekApiKey(apiKey: string): void {
  const trimmed = apiKey.trim()
  if (!trimmed) return
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
