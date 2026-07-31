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

// 获取当前活跃供应商的API配置
export function getActiveProviderConfig(
  providerId: AIProviderId,
  providers: Record<AIProviderId, AIProviderConfig>,
): { baseUrl: string; apiKey: string; model: string } | null {
  const config = providers[providerId]
  if (!config || !config.apiKey) return null

  // 确保 baseUrl 以 /v1 结尾或包含 /v1/
  let baseUrl = config.baseUrl
  if (baseUrl && !baseUrl.includes('/v1')) {
    baseUrl = baseUrl.replace(/\/+$/, '') + '/v1'
  }

  return {
    baseUrl,
    apiKey: config.apiKey,
    model: config.model,
  }
}
