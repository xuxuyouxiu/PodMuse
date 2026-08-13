import * as path from 'path'
import * as fs from 'fs'
import { app, safeStorage, BrowserWindow } from 'electron'
import { PodcastConfig, FeishuState } from '@shared/types'
import { getAllDefaultProviderConfigs } from './ai-providers'
import { decryptField } from './security'

/** 需要加密保护的敏感字段 */
const SENSITIVE_FIELDS = ['api_key', 'feishu_app_secret'] as const

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

/**
 * 便携模式检测：如果 exe 同级目录存在 portable 标记文件，
 * 则将配置存储在 exeDir/data/ 下（便携版）；
 * 否则使用标准的 %APPDATA%/podcast-notes（安装版）
 */
function isPortableMode(): boolean {
  try {
    const exeDir = path.dirname(process.execPath)
    return fs.existsSync(path.join(exeDir, 'portable'))
  } catch {
    return false
  }
}

export function getUserDataDir(): string {
  if (!_userDataDir) {
    if (isPortableMode()) {
      const exeDir = path.dirname(process.execPath)
      _userDataDir = path.join(exeDir, 'data')
      if (!fs.existsSync(_userDataDir)) {
        fs.mkdirSync(_userDataDir, { recursive: true })
      }
    } else {
      try {
        _userDataDir = app.getPath('userData')
      } catch {
        _userDataDir = path.join(process.env.APPDATA || process.cwd(), 'PodMuse')
      }
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

  feishu_app_id: '',
  feishu_app_secret: '',
  language: 'auto',
  feishu_chat_id: '',
  obsidian_dir: '',
  audio_dir: '',
  whisper_exe_path: '',
  whisper_model: 'large-v3-turbo',
  notification_enabled: true,
  douyin_cookie: '',
  subscriptions: [],
  subscription_check_interval_hours: 6,
  rsshub_base_url: 'https://rsshub.app',
  auto_update_check: true,
  auto_update_download: false,

  // 导出配置默认值
  export: {
    logseq_dir: '',
    notion: { token: '', database_id: '' },
  },
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

/**
 * 迁移旧版 safeStorage 加密字段（一次性操作）
 * 尝试解密 _enc 字段，成功则还原为明文；失败则留空让用户重新输入
 */
function migrateEncryptedFields(config: PodcastConfig): PodcastConfig {
  const result = { ...config }
  const configAny = config as unknown as Record<string, unknown>
  const resultAny = result as unknown as Record<string, unknown>

  try {
    if (!safeStorage.isEncryptionAvailable()) return result

    for (const field of SENSITIVE_FIELDS) {
      const encKey = `_${field}_enc`
      const encVal = configAny[encKey]
      // 如果明文已有值，跳过（不再依赖加密值）
      if (typeof resultAny[field] === 'string' && resultAny[field]) continue
      // 尝试解密旧加密值
      if (typeof encVal === 'string' && encVal) {
        try {
          resultAny[field] = decryptField(safeStorage, encVal)
        } catch {
          // 解密失败，留空
        }
      }
    }

    // 迁移 AI 供应商的 apiKey
    if (result.ai_providers) {
      for (const [, provider] of Object.entries(result.ai_providers)) {
        const p = provider as unknown as Record<string, unknown>
        if (p.apiKey) continue
        const encVal = p['_apiKey_enc']
        if (typeof encVal === 'string' && encVal) {
          try {
            p.apiKey = decryptField(safeStorage, encVal)
          } catch {
            // 解密失败，留空
          }
        }
      }
    }
  } catch (e) {
    console.warn('Config migration warning:', e)
  }

  return result
}

/**
 * 清理保存时的加密遗留字段，凭据以明文存储
 * 配置文件位于用户数据目录，已有操作系统权限保护
 */
function cleanConfigForSave(config: PodcastConfig): Record<string, unknown> {
  const toSave: Record<string, unknown> = { ...config }
  // 移除旧的 _enc 字段
  for (const field of SENSITIVE_FIELDS) {
    delete toSave[`_${field}_enc`]
  }
  // 移除 AI 供应商的 _apiKey_enc 字段
  if (toSave.ai_providers && typeof toSave.ai_providers === 'object') {
    const providers = { ...(toSave.ai_providers as Record<string, Record<string, unknown>>) }
    for (const [id, provider] of Object.entries(providers)) {
      const p = { ...provider }
      delete p['_apiKey_enc']
      providers[id] = p
    }
    toSave.ai_providers = providers
  }
  // 移除运行时字段
  delete toSave['_decryptionFailedFields']
  return toSave
}

/** 清理旧版 example config 遗留的占位值（以"你的"开头的中文提示） */
export function stripPlaceholderValues(config: PodcastConfig): PodcastConfig {
  const result = { ...config }
  const placeholderPattern = /^你的/
  const fieldsToClean: (keyof PodcastConfig)[] = [
    'api_key',
    'feishu_app_id',
    'feishu_app_secret',
    'feishu_chat_id',
    'obsidian_dir',
    'whisper_exe_path',
  ]
  for (const field of fieldsToClean) {
    const val = result[field]
    if (typeof val === 'string' && placeholderPattern.test(val)) {
      ;(result as Record<string, unknown>)[field] = ''
    }
  }
  return result
}

let configCache: PodcastConfig | null = null
export function clearConfigCache(): void { configCache = null }

export function loadConfig(): PodcastConfig {
  if (configCache) return configCache
  // 1. 优先加载用户配置文件（已持久化的用户设置）
  try {
    const userPath = getUserConfigPath()
    if (fs.existsSync(userPath)) {
      const data = JSON.parse(fs.readFileSync(userPath, 'utf-8'))
      const merged = { ...DEFAULTS, ...data }
      const cleaned = stripPlaceholderValues(merged)
      configCache = migrateEncryptedFields(cleaned)
      return configCache
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
    return migrateEncryptedFields({ ...DEFAULTS, ...shipped })
  }

  return { ...DEFAULTS }
}

/**
 * 保存配置到磁盘，凭据以明文存储
 * 配置文件位于用户数据目录，已有操作系统权限保护
 */
function prepareConfigForSave(config: PodcastConfig): Record<string, unknown> {
  return cleanConfigForSave(config)
}

export function saveConfig(config: PodcastConfig) {
  try {
    configCache = null // 写入前清除缓存
    const p = getUserConfigPath()
    const dir = path.dirname(p)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const toSave = prepareConfigForSave(config)
    fs.writeFileSync(p, JSON.stringify(toSave, null, 2), 'utf-8')
  } catch (e) {
    console.error('Config save error:', e)
  }
}

/** 对 API Key 等敏感字段做脱敏处理（仅显示后 4 位） */
export function maskSecret(value: string): string {
  if (!value) return ''
  if (value.length <= 4) return '****'
  return '****' + value.slice(-4)
}

/**
 * 返回配置，用于通过 IPC 发送给渲染进程
 * 前端使用 type="password" 隐藏敏感字段的显示值，无需后端脱敏
 * 后端脱敏会导致 UI state 持有 **** 值，进而导致 API 调用使用无效凭据
 */
export function loadSafeConfig(): PodcastConfig {
  return loadConfig()
}

let stateCache: FeishuState | null = null

export function loadState(): FeishuState {
  if (stateCache) return stateCache
  try {
    const p = getUserStatePath()
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
      stateCache = {
        processed: data.processed || [],
        processedUrls: data.processedUrls || [],
        activeTasks: data.activeTasks || [],
        recentTasks: data.recentTasks || (data.recentTask ? [data.recentTask] : []),
      }
      return stateCache
    }
  } catch {}
  return { processed: [], processedUrls: [], activeTasks: [], recentTasks: [] }
}

export function saveState(state: FeishuState) {
  try {
    stateCache = null // 写入前清除缓存，确保下次 loadState 读到最新
    const p = getUserStatePath()
    const dir = path.dirname(p)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(p, JSON.stringify(state, null, 2), 'utf-8')
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[config] saveState failed:', msg)
    // 通知前端显示 toast，让用户感知状态可能未持久化
    try {
      const win = BrowserWindow.getAllWindows()[0]
      win?.webContents.send('toast', { message: `状态保存失败：${msg}`, type: 'error' })
    } catch {
      // window 不可用时不阻塞调用方
    }
  }
}
