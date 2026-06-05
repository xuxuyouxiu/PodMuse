import * as path from 'path'
import * as fs from 'fs'
import { app, safeStorage } from 'electron'
import { PodcastConfig, FeishuState } from '@shared/types'
import { getAllDefaultProviderConfigs } from './ai-providers'
import { encryptField, decryptField } from './security'

/** 需要加密保护的敏感字段 */
const SENSITIVE_FIELDS = ['api_key', 'feishu_app_secret'] as const

/** 配置中所有路径类型的字段 */
const PATH_FIELDS = ['obsidian_dir', 'audio_dir', 'whisper_exe_path'] as const

function findShippedConfigPath(): string {
  const isProd = !!process.resourcesPath
  if (isProd && process.resourcesPath) {
    const inResources = path.join(process.resourcesPath, 'podcast_config.json')
    if (fs.existsSync(inResources)) return inResources
  }
  const exeDir = path.dirname(process.execPath)
  const nextToExe = path.join(exeDir, 'podcast_config.json')
  if (fs.existsSync(nextToExe)) return nextToExe
  const cwdPath = path.join(process.cwd(), 'podcast_config.json')
  if (fs.existsSync(cwdPath)) return cwdPath
  return ''
}

let _userDataDir: string | null = null

function getUserDataDir(): string {
  if (!_userDataDir) {
    try {
      _userDataDir = app.getPath('userData')
    } catch {
      _userDataDir = path.join(process.env.APPDATA || process.cwd(), '播客笔记助手')
    }
  }
  return _userDataDir
}

function getUserConfigPath(): string {
  return path.join(getUserDataDir(), 'podcast_config.json')
}

function getUserStatePath(): string {
  return path.join(getUserDataDir(), 'feishu_state.json')
}

const DEFAULTS: PodcastConfig = {
  // AI 供应商配置
  ai_provider: 'deepseek',
  ai_providers: getAllDefaultProviderConfigs(),
  
  // 旧字段保留兼容
  api_key: '',
  
  feishu_app_id: '', feishu_app_secret: '',
  language: 'auto', feishu_chat_id: '',
  obsidian_dir: '',
  audio_dir: '',
  whisper_exe_path: '',
  whisper_model: 'large-v3-turbo',
  notification_enabled: true,
}

function loadShippedConfig(): PodcastConfig | null {
  try {
    const p = findShippedConfigPath()
    if (p && fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, 'utf-8'))
    }
  } catch {}
  return null
}

/** 解密配置中的敏感字段（自动兼容旧版明文配置） */
function decryptConfigFields(config: PodcastConfig): PodcastConfig {
  const result = { ...config }
  const configAny = config as unknown as Record<string, unknown>
  const resultAny = result as unknown as Record<string, unknown>
  try {
    if (!safeStorage.isEncryptionAvailable()) return result
    for (const field of SENSITIVE_FIELDS) {
      const encKey = `_${field}_enc`
      const encVal = configAny[encKey]
      if (typeof encVal === 'string' && encVal) {
        resultAny[field] = decryptField(safeStorage, encVal)
      }
    }
    // 解密 AI 供应商的 apiKey
    if (config.ai_providers) {
      const decryptedProviders = { ...config.ai_providers }
      for (const [id, provider] of Object.entries(decryptedProviders)) {
        const providerAny = provider as unknown as Record<string, unknown>
        const encVal = providerAny['_apiKey_enc']
        if (typeof encVal === 'string' && encVal) {
          decryptedProviders[id as keyof typeof decryptedProviders] = {
            ...provider,
            apiKey: decryptField(safeStorage, encVal),
          }
        }
      }
      result.ai_providers = decryptedProviders
    }
  } catch (e) {
    console.warn('Config decryption warning:', e)
  }
  return result
}

export function loadConfig(): PodcastConfig {
  // 1. 优先加载用户配置文件（已持久化的用户设置）
  try {
    const userPath = getUserConfigPath()
    if (fs.existsSync(userPath)) {
      const data = JSON.parse(fs.readFileSync(userPath, 'utf-8'))
      const merged = { ...DEFAULTS, ...data }
      return decryptConfigFields(merged)
    }
  } catch {}

  // 2. 用户配置不存在时，尝试加载打包自带的配置文件
  const shipped = loadShippedConfig()
  if (shipped) {
    // 首次启动：将打包配置迁移到用户目录，后续修改不会影响打包文件
    try {
      const userPath = getUserConfigPath()
      const dir = path.dirname(userPath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(userPath, JSON.stringify(shipped, null, 2), 'utf-8')
    } catch {}
    return decryptConfigFields({ ...DEFAULTS, ...shipped })
  }

  return { ...DEFAULTS }
}

/**
 * 将敏感字段以加密形式存储到配置对象中
 * 加密结果写入 _${field}_enc 字段，同时清空明文字段避免磁盘泄露
 */
function encryptConfigForSave(config: PodcastConfig): Record<string, unknown> {
  const toSave: Record<string, unknown> = { ...config }
  const configAny = config as unknown as Record<string, unknown>
  try {
    if (!safeStorage.isEncryptionAvailable()) return toSave
    for (const field of SENSITIVE_FIELDS) {
      const value = configAny[field]
      if (typeof value === 'string' && value) {
        toSave[`_${field}_enc`] = encryptField(safeStorage, value)
      }
      toSave[field] = '' // 清空明文
    }
    // 加密 AI 供应商的 apiKey
    if (config.ai_providers) {
      const providersCopy: Record<string, unknown> = {}
      for (const [id, provider] of Object.entries(config.ai_providers)) {
        const pCopy = { ...provider, apiKey: '' } as Record<string, unknown>
        if (provider.apiKey) {
          pCopy['_apiKey_enc'] = encryptField(safeStorage, provider.apiKey)
        }
        providersCopy[id] = pCopy
      }
      toSave['ai_providers'] = providersCopy
    }
  } catch (e) {
    console.warn('Config encryption warning:', e)
  }
  return toSave
}

export function saveConfig(config: PodcastConfig) {
  try {
    const p = getUserConfigPath()
    const dir = path.dirname(p)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const toSave = encryptConfigForSave(config)
    fs.writeFileSync(p, JSON.stringify(toSave, null, 2), 'utf-8')
  } catch (e) {
    console.error('Config save error:', e)
  }
}

/** 对 API Key 等敏感字段做脱敏处理（仅显示后 4 位） */
function maskSecret(value: string): string {
  if (!value) return ''
  if (value.length <= 4) return '****'
  return '****' + value.slice(-4)
}

/**
 * 返回脱敏后的配置，用于通过 IPC 发送给渲染进程
 * 敏感字段仅显示后 4 位，防止前端泄露
 */
export function loadSafeConfig(): PodcastConfig {
  const config = loadConfig()
  const safe = { ...config }
  // 脱敏顶层敏感字段
  for (const field of SENSITIVE_FIELDS) {
    const val = (safe as Record<string, unknown>)[field]
    if (typeof val === 'string' && val) {
      (safe as Record<string, unknown>)[field] = maskSecret(val)
    }
  }
  // 脱敏 AI 供应商的 apiKey
  if (safe.ai_providers) {
    const maskedProviders = { ...safe.ai_providers }
    for (const [id, provider] of Object.entries(maskedProviders)) {
      maskedProviders[id as keyof typeof maskedProviders] = {
        ...provider,
        apiKey: provider.apiKey ? maskSecret(provider.apiKey) : '',
      }
    }
    safe.ai_providers = maskedProviders
  }
  return safe
}

export function loadState(): FeishuState {
  try {
    const p = getUserStatePath()
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
      return {
        processed: data.processed || [],
        processedUrls: data.processedUrls || [],
        activeTasks: data.activeTasks || [],
        recentTasks: data.recentTasks || (data.recentTask ? [data.recentTask] : []),
      }
    }
  } catch {}
  return { processed: [], processedUrls: [], activeTasks: [], recentTasks: [] }
}

export function saveState(state: FeishuState) {
  try {
    const p = getUserStatePath()
    const dir = path.dirname(p)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(p, JSON.stringify(state, null, 2), 'utf-8')
  } catch {}
}
