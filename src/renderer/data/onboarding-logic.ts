/**
 * 首次启动向导判定与恢复步骤（纯函数，供 OnboardingWizard / App.tsx 与 vitest 复用）。
 * 设计依据：docs/无感配置方案.md §3.1（状态持久化续接）/ §3.2（首次启动判定与打扰策略）。
 *
 * 核心三步：1 AI Key → 2 笔记目录 → 3 Whisper；4 = 完成页。
 * 弹窗判定只看 AI Key 与目录（Whisper 可跳过，不构成弹窗条件）。
 */
import type { AIProviderConfig, AIProviderId, PodcastConfig } from '@shared/types'

export const ONBOARDING_VERSION = 1
/** 核心步骤数；DONE_STEP 为完成页 */
export const FIRST_STEP = 1
export const DONE_STEP = 4

/** 当前活跃供应商的 API Key（deepseek 时兜底 legacy api_key） */
export function getActiveProviderKey(config: PodcastConfig): string {
  const providerId: AIProviderId = config.ai_provider || 'deepseek'
  const provider: AIProviderConfig | undefined = config.ai_providers?.[providerId]
  const key = provider?.apiKey?.trim()
  if (key) return key
  // 旧字段兼容：仅当活跃供应商是 deepseek 时 api_key 才代表它
  if (providerId === 'deepseek') return (config.api_key || '').trim()
  return ''
}

/** 是否存在 legacy api_key（任意供应商） */
export function hasLegacyApiKey(config: PodcastConfig): boolean {
  return Boolean(config.api_key?.trim())
}

/**
 * 核心三步是否全部配齐（Key 任一来源 + 目录 + Whisper 引擎）。
 * 用于完成页汇总与「老用户升级不打扰」判定。
 */
export function isCoreConfigured(config: PodcastConfig): boolean {
  return (
    (Boolean(getActiveProviderKey(config)) || hasLegacyApiKey(config)) &&
    Boolean(config.obsidian_dir?.trim()) &&
    Boolean(config.whisper_exe_path?.trim())
  )
}

/**
 * 是否应弹向导（App.tsx 启动 config:get 后调用一次）。
 * - completed / neverShowAgain → 不弹
 * - 核心未配齐（活跃供应商无 key 且无 legacy api_key，或目录为空）→ 弹
 * - 核心已配齐 → 不打扰（老用户升级场景）
 */
export function shouldShowWizard(config: PodcastConfig): boolean {
  const ob = config.onboarding
  if (ob?.completed || ob?.neverShowAgain) return false
  const keyMissing = !getActiveProviderKey(config) && !hasLegacyApiKey(config)
  const dirMissing = !config.obsidian_dir?.trim()
  return keyMissing || dirMissing
}

/** 指定步是否已满足（恢复时跳过已完成的步） */
export function stepSatisfied(config: PodcastConfig, step: number): boolean {
  switch (step) {
    case 1:
      return Boolean(getActiveProviderKey(config))
    case 2:
      return Boolean(config.obsidian_dir?.trim())
    case 3:
      return Boolean(config.whisper_exe_path?.trim())
    default:
      return false
  }
}

/**
 * 计算恢复步：以 onboarding.lastStep 为起点（缺失/非法取 1），
 * 依次跳过已满足的前置步，封顶 DONE_STEP。
 */
export function computeStep(config: PodcastConfig): number {
  const raw = config.onboarding?.lastStep
  let step = typeof raw === 'number' && Number.isFinite(raw) ? Math.trunc(raw) : FIRST_STEP
  step = Math.min(Math.max(FIRST_STEP, step), DONE_STEP)
  while (step < DONE_STEP && stepSatisfied(config, step)) step += 1
  return step
}
