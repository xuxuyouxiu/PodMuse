import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'
import { PodcastConfig, FeishuState } from '@shared/types'

function findShippedConfigPath(): string {
  const isProd = !!(process as any).resourcesPath
  if (isProd) {
    const resourcesPath = (process as any).resourcesPath as string
    const inResources = path.join(resourcesPath, 'podcast_config.json')
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
  api_key: '', feishu_app_id: '', feishu_app_secret: '',
  language: 'auto', feishu_chat_id: '',
  obsidian_dir: 'G:\\xuxuya_Notes\\小宇宙播客',
  audio_dir: '',
  whisper_exe_path: 'D:\\Tools\\Faster-Whisper-XXL\\faster-whisper-xxl.exe',
  whisper_model: 'large-v3-turbo',
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

export function loadConfig(): PodcastConfig {
  // 1. 优先加载用户配置文件（已持久化的用户设置）
  try {
    const userPath = getUserConfigPath()
    if (fs.existsSync(userPath)) {
      const data = JSON.parse(fs.readFileSync(userPath, 'utf-8'))
      return { ...DEFAULTS, ...data }
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
    return { ...DEFAULTS, ...shipped }
  }

  return { ...DEFAULTS }
}

export function saveConfig(config: PodcastConfig) {
  try {
    const p = getUserConfigPath()
    const dir = path.dirname(p)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(p, JSON.stringify(config, null, 2), 'utf-8')
  } catch (e) {
    console.error('Config save error:', e)
  }
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
