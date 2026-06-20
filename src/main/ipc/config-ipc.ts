import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { loadConfig, loadSafeConfig, saveConfig } from '../config'
import { isSafeUrl, isSafeFilePath, isSafeExecutablePath, isSafeDirectoryPath } from '../security'
import { detectYtDlp } from '../platforms/yt-dlp'
import { buildBacklinkIndex } from '../backlinks'
import type { PodcastConfig } from '@shared/types'

/**
 * 验证来自渲染进程的配置对象是否合法
 * 防止通过 config:save IPC 注入恶意数据（篡改可执行文件路径、指向系统目录等）
 */
function validateConfigInput(config: Record<string, unknown>): string | null {
  if (!config || typeof config !== 'object') return '配置必须是对象'

  // 验证字符串字段类型
  const stringFields = [
    'ai_provider', 'api_key', 'feishu_app_id', 'feishu_app_secret',
    'language', 'feishu_chat_id', 'obsidian_dir', 'audio_dir',
    'whisper_exe_path', 'whisper_model',
  ]
  for (const field of stringFields) {
    if (field in config && typeof config[field] !== 'string') {
      return `字段 ${field} 类型无效`
    }
  }

  // 验证 ai_provider 枚举值
  const validProviders = ['deepseek', 'openai', 'moonshot', 'zhipu', 'qwen', 'yi', 'minimax', 'custom']
  if (typeof config.ai_provider === 'string' && !validProviders.includes(config.ai_provider)) {
    return `无效的 AI 供应商: ${config.ai_provider}`
  }

  // 验证路径字段不指向系统敏感目录
  const pathFields = ['obsidian_dir', 'audio_dir']
  for (const field of pathFields) {
    const value = config[field]
    if (typeof value === 'string' && value.trim() && !isSafeDirectoryPath(value)) {
      return `路径不安全: ${field}`
    }
  }

  // 验证可执行文件路径
  if (typeof config.whisper_exe_path === 'string' && config.whisper_exe_path.trim()) {
    if (!isSafeExecutablePath(config.whisper_exe_path)) {
      return `可执行文件路径不安全: ${config.whisper_exe_path}`
    }
  }

  // 验证 AI 供应商配置
  if (config.ai_providers && typeof config.ai_providers === 'object') {
    for (const provider of Object.values(config.ai_providers as Record<string, unknown>)) {
      if (!provider || typeof provider !== 'object') return 'AI 供应商配置无效'
    }
  }

  return null
}

export function registerConfigIPC(mainWindow?: BrowserWindow | null): void {
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
  })

  ipcMain.handle('config:get', () => {
    try { return loadSafeConfig() } catch { return null }
  })

  ipcMain.handle('config:save', (_e, config) => {
    try {
      // 合并默认值，防止缺失字段
      const currentConfig = loadConfig()

      // 还原脱敏字段：如果前端传回的是脱敏值（以 **** 开头），保留已有的真实值
      const incoming = { ...config } as Record<string, unknown>
      const maskedPattern = /^\*{4}/
      const currentAny = currentConfig as unknown as Record<string, unknown>
      for (const field of ['api_key', 'feishu_app_secret']) {
        if (typeof incoming[field] === 'string' && maskedPattern.test(incoming[field] as string)) {
          incoming[field] = currentAny[field] || ''
        }
      }
      // 还原 AI 供应商 apiKey 脱敏值
      if (incoming.ai_providers && currentConfig.ai_providers) {
        const incomingProviders = incoming.ai_providers as Record<string, Record<string, unknown>>
        const currentProviders = currentConfig.ai_providers as unknown as Record<string, Record<string, unknown>>
        for (const [id, provider] of Object.entries(incomingProviders)) {
          if (typeof provider.apiKey === 'string' && maskedPattern.test(provider.apiKey)) {
            provider.apiKey = currentProviders[id]?.apiKey || ''
          }
        }
      }

      const merged = { ...currentConfig, ...incoming }
      // schema 验证
      const validationError = validateConfigInput(merged as Record<string, unknown>)
      if (validationError) {
        console.warn('Config save rejected:', validationError)
        return false
      }
      saveConfig(merged as PodcastConfig)
      return true
    } catch { return false }
  })

  ipcMain.handle('dialog:selectDir', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0] || null
  })

  ipcMain.handle('dialog:selectFile', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: '可执行文件', extensions: ['exe'] }],
    })
    return result.canceled ? null : result.filePaths[0] || null
  })

  ipcMain.handle('shell:openPath', async (_e, filePath: string) => {
    try {
      if (!filePath || typeof filePath !== 'string') return false
      // 仅允许打开 Obsidian 目录和应用数据目录内的安全文件类型
      const config = loadConfig()
      const allowedDirs = [config.obsidian_dir, app.getPath('userData')].filter(Boolean)
      const allowedExts = ['.md', '.txt', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.svg']
      if (!isSafeFilePath(filePath, allowedDirs, allowedExts)) {
        console.warn('shell:openPath blocked:', filePath)
        return false
      }
      await shell.openPath(filePath)
      return true
    } catch { return false }
  })

  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    try {
      // 仅允许 http:// 和 https:// 协议
      if (!isSafeUrl(url)) {
        console.warn('shell:openExternal blocked:', url)
        return false
      }
      await shell.openExternal(url)
      return true
    } catch { return false }
  })

  ipcMain.handle('app:cleanTemp', () => {
    try {
      const cfg = loadConfig()
      const tempDir = cfg.audio_dir || join(app.getPath('userData'), '_podcast_temp')
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
    return true
  })

  ipcMain.handle('platform:detectYtDlp', () => {
    return detectYtDlp()
  })

  ipcMain.handle('backlinks:index', () => {
    const cfg = loadConfig()
    return buildBacklinkIndex(cfg.obsidian_dir || '')
  })

  ipcMain.handle('shell:showInFolder', async (_e, filePath: string) => {
    try {
      if (!filePath || typeof filePath !== 'string') return false
      shell.showItemInFolder(filePath)
      return true
    } catch { return false }
  })
}
