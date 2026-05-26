import * as path from 'path'
import * as fs from 'fs'
import { PodcastConfig, FeishuState } from '@shared/types'

function findConfigPath(): string {
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

  return nextToExe
}

function findStatePath(): string {
  const configDir = path.dirname(findConfigPath())
  return path.join(configDir, 'feishu_state.json')
}

let _configPath: string | null = null
let _statePath: string | null = null

function getConfigPath() { if (!_configPath) _configPath = findConfigPath(); return _configPath }
function getStatePath() { if (!_statePath) _statePath = findStatePath(); return _statePath }

const DEFAULTS: PodcastConfig = {
  api_key: '', feishu_app_id: '', feishu_app_secret: '',
  language: 'auto', feishu_chat_id: '',
  obsidian_dir: 'D:\\Obsidian\\播客笔记',
  audio_dir: '',
  category_config_path: '',
}

export function loadConfig(): PodcastConfig {
  try {
    const p = getConfigPath()
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
      return { ...DEFAULTS, ...data }
    }
  } catch (e) {
    console.error('Config load error:', e)
  }
  return { ...DEFAULTS }
}

export function saveConfig(config: PodcastConfig) {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8')
  } catch (e) {
    console.error('Config save error:', e)
  }
}

export function loadState(): FeishuState {
  try {
    const p = getStatePath()
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
    fs.writeFileSync(getStatePath(), JSON.stringify(state, null, 2), 'utf-8')
  } catch {}
}
