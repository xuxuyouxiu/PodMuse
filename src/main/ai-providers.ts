import type { AIProviderId, AIProviderPreset, AIProviderConfig } from '../shared/types'
import { AI_PROVIDER_PRESETS } from '../shared/ai-provider-presets'

// 重新导出预设数据，保持向后兼容
export { AI_PROVIDER_PRESETS } from '../shared/ai-provider-presets'

// 获取供应商预设
export function getProviderPreset(providerId: AIProviderId): AIProviderPreset | undefined {
  return AI_PROVIDER_PRESETS.find(p => p.id === providerId)
}

// 创建默认供应商配置
export function createDefaultProviderConfig(
  providerId: AIProviderId,
): AIProviderConfig | undefined {
  const preset = getProviderPreset(providerId)
  if (!preset) return undefined

  return {
    id: preset.id,
    name: preset.name,
    apiKey: '',
    baseUrl: preset.baseUrl,
    model: preset.defaultModel,
    availableModels: preset.availableModels,
    website: preset.website,
    description: preset.description,
  }
}

// 创建自定义供应商默认配置
export function createCustomProviderConfig(): AIProviderConfig {
  return {
    id: 'custom',
    name: '自定义供应商',
    apiKey: '',
    baseUrl: '',
    model: '',
    availableModels: [],
    isCustom: true,
  }
}

// 获取所有供应商的默认配置
export function getAllDefaultProviderConfigs(): Record<AIProviderId, AIProviderConfig> {
  const configs: Partial<Record<AIProviderId, AIProviderConfig>> = {}

  for (const preset of AI_PROVIDER_PRESETS) {
    configs[preset.id] = createDefaultProviderConfig(preset.id)!
  }

  configs.custom = createCustomProviderConfig()

  return configs as Record<AIProviderId, AIProviderConfig>
}

/**
 * 归一化 baseUrl：去尾斜杠；已有版本段（/v1、/v4 等）保持原样，否则补 /v1。
 * 注意：智谱官方端点是 /api/paas/v4（不含 /v1），机械追加 /v1 会得到
 * 未文档化的 /v4/v1 路径——所有拼 URL 的地方必须统一走本函数。
 */
export function normalizeBaseUrl(baseUrl: string): string {
  const url = baseUrl.trim().replace(/\/+$/, '')
  // 已含 /v1（任意位置，兼容用户粘贴完整 chat/completions 地址）或
  // 以版本段结尾（如智谱 /api/paas/v4）→ 保持原样；否则补 /v1
  if (!url || url.includes('/v1') || /\/v\d+$/.test(url)) return url
  return url + '/v1'
}

// 获取当前活跃供应商的API配置
export function getActiveProviderConfig(
  providerId: AIProviderId,
  providers: Record<AIProviderId, AIProviderConfig>,
): { baseUrl: string; apiKey: string; model: string } | null {
  const config = providers[providerId]
  if (!config || !config.apiKey?.trim()) return null

  return {
    baseUrl: normalizeBaseUrl(config.baseUrl),
    apiKey: config.apiKey,
    model: config.model,
  }
}
