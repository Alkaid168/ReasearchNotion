import type { ModelProvider } from './types'

/**
 * 厂商范围内可用的模型预设，供设置页编辑表单联动（选厂商后预填模型下拉）。
 * 放在 shared/ 以便 main 与 renderer 共用。
 *
 * 模型名与上下文窗口对齐各厂商官方文档（2026-08 核对）：
 * - DeepSeek: https://api-docs.deepseek.com/quick_start/pricing
 * - 智谱 GLM: https://docs.bigmodel.cn/cn/guide/start/model-overview
 * - 通义千问 Qwen: https://help.aliyun.com/zh/model-studio/text-generation-model
 *
 * 注：model_name 在本应用中仅作 metadata（实际模型由 Dify agent app 配置决定），
 *     预设仅用于填表便捷 + contextWindow 用作 token 占用显示的分母。用户可手填任意 model_name。
 */
export const MODEL_PROVIDER_PRESETS: Record<
  ModelProvider,
  { label: string; models: Array<{ name: string; label: string; contextWindow: number }> }
> = {
  deepseek: {
    label: 'DeepSeek',
    models: [
      { name: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash（轻量快速，默认）', contextWindow: 1048576 },
      { name: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro（旗舰）', contextWindow: 1048576 }
    ]
  },
  qwen: {
    label: '通义千问',
    models: [
      { name: 'qwen3.8-max', label: 'Qwen3.8 Max（最强推理）', contextWindow: 1048576 },
      { name: 'qwen3.7-plus', label: 'Qwen3.7 Plus（推荐，平衡）', contextWindow: 1048576 },
      { name: 'qwen3.7-flash', label: 'Qwen3.7 Flash（轻量低成本）', contextWindow: 1048576 },
      { name: 'qwen-long', label: 'Qwen Long（超长文档 10M）', contextWindow: 10485760 }
    ]
  },
  zhipu: {
    label: '智谱',
    models: [
      { name: 'glm-5.2', label: 'GLM-5.2（旗舰，1M 上下文）', contextWindow: 1048576 },
      { name: 'glm-4.7', label: 'GLM-4.7（通用升级）', contextWindow: 204800 },
      { name: 'glm-4.5-air', label: 'GLM-4.5 Air（高性价比）', contextWindow: 131072 },
      { name: 'glm-4-flash-250414', label: 'GLM-4 Flash（免费）', contextWindow: 131072 }
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
export const DEFAULT_CONTEXT_WINDOW_TOKENS = 1048576
