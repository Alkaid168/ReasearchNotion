import type { ModelProvider } from './types'

/** 厂商范围内可用的模型预设，供设置页编辑表单联动（选厂商后预填模型下拉）。
 *  放在 shared/ 以便 main 与 renderer 共用。 */
export const MODEL_PROVIDER_PRESETS: Record<
  ModelProvider,
  { label: string; models: Array<{ name: string; label: string; contextWindow: number }> }
> = {
  deepseek: {
    label: 'DeepSeek',
    models: [
      { name: 'deepseek-chat', label: 'DeepSeek Chat', contextWindow: 64000 },
      { name: 'deepseek-reasoner', label: 'DeepSeek Reasoner', contextWindow: 64000 }
    ]
  },
  qwen: {
    label: '通义千问',
    models: [
      { name: 'qwen-max', label: 'Qwen Max', contextWindow: 32000 },
      { name: 'qwen-plus', label: 'Qwen Plus', contextWindow: 131072 },
      { name: 'qwen-turbo', label: 'Qwen Turbo', contextWindow: 1000000 }
    ]
  },
  zhipu: {
    label: '智谱',
    models: [
      { name: 'glm-4', label: 'GLM-4', contextWindow: 131072 },
      { name: 'glm-4-air', label: 'GLM-4 Air', contextWindow: 131072 },
      { name: 'glm-4-flash', label: 'GLM-4 Flash', contextWindow: 131072 }
    ]
  }
}

export const MODEL_PROVIDER_LABELS: Record<ModelProvider, string> = Object.fromEntries(
  (Object.keys(MODEL_PROVIDER_PRESETS) as ModelProvider[]).map((provider) => [
    provider,
    MODEL_PROVIDER_PRESETS[provider].label
  ])
) as Record<ModelProvider, string>

export const MODEL_PROVIDER_ORDER: ModelProvider[] = ['deepseek', 'qwen', 'zhipu']

/** 默认上下文窗口，用于新增档时未匹配预设模型的兜底。 */
export const DEFAULT_CONTEXT_WINDOW_TOKENS = 64000
