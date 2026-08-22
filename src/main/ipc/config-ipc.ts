import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { loadConfig, loadSafeConfig, saveConfig } from '../config'
import {
  isSafeUrl,
  isSafeFilePath,
  isSafeExecutablePath,
  isSafeDirectoryPath,
  isPathWithinBase,
} from '../security'
import { detectYtDlp } from '../platforms/yt-dlp'
import { createDefaultDirs } from '../default-dirs'
import { buildBacklinkIndex, buildTagIndex } from '../backlinks'
import type { PodcastConfig } from '@shared/types'

/**
 * 验证来自渲染进程的配置对象是否合法
 * 防止通过 config:save IPC 注入恶意数据（篡改可执行文件路径、指向系统目录等）
 */
export function validateConfigInput(config: Record<string, unknown>): string | null {
  if (!config || typeof config !== 'object') return '配置必须是对象'

  // 验证字符串字段类型
  const stringFields = [
    'ai_provider',
    'api_key',
    'feishu_app_id',
    'feishu_app_secret',
    'language',
    'feishu_chat_id',
    'obsidian_dir',
    'audio_dir',
    'whisper_exe_path',
    'whisper_model',
    'notion_oauth_client_id',
    'notion_oauth_client_secret',
    'aliyun_api_key',
    'xfyun_app_id',
    'xfyun_api_key',
  ]
  for (const field of stringFields) {
    if (field in config && typeof config[field] !== 'string') {
      return `字段 ${field} 类型无效`
    }
  }

  // 验证 ai_provider 枚举值
  const validProviders = [
    'deepseek',
    'openai',
    'moonshot',
    'zhipu',
    'qwen',
    'yi',
    'minimax',
    'custom',
  ]
  if (typeof config.ai_provider === 'string' && !validProviders.includes(config.ai_provider)) {
    return `无效的 AI 供应商: ${config.ai_provider}`
  }

  // 验证转写引擎枚举值
  if (
    config.transcribe_engine !== undefined &&
    !['local', 'aliyun', 'xfyun'].includes(config.transcribe_engine as string)
  ) {
    return `无效的转写引擎: ${config.transcribe_engine}`
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

  // 验证导出配置（嵌套对象）
  if (config.export !== undefined && config.export !== null) {
    const exp = config.export as Record<string, unknown>
    if (typeof exp.logseq_dir === 'string' && exp.logseq_dir.trim()) {
      if (!isSafeDirectoryPath(exp.logseq_dir)) {
        return `路径不安全: export.logseq_dir`
      }
    }
    if (exp.notion !== undefined && exp.notion !== null) {
      const notion = exp.notion as Record<string, unknown>
      if ('token' in notion && typeof notion.token !== 'string') {
        return `字段 export.notion.token 类型无效`
      }
      if ('database_id' in notion && typeof notion.database_id !== 'string') {
        return `字段 export.notion.database_id 类型无效`
      }
    }
  }

  // 验证 AI 供应商配置
  if (config.ai_providers && typeof config.ai_providers === 'object') {
    for (const provider of Object.values(config.ai_providers as Record<string, unknown>)) {
      if (!provider || typeof provider !== 'object') return 'AI 供应商配置无效'
    }
  }

  // 抖音 cookie 只做长度上限校验（内容不做解析；唯一写入通道是 douyin:connect/disconnect）
  if (typeof config.douyin_cookie === 'string' && config.douyin_cookie.length > 20000) {
    return '字段 douyin_cookie 过长'
  }

  return null
}

/**
 * 还原受保护字段：把 renderer 传来的脱敏值/任意值还原为主进程现有值。
 * - api_key / feishu_app_secret / AI 供应商 apiKey：传回 **** 开头的脱敏值时还原真实值
 * - douyin_cookie / douyin_login：无条件还原为主进程现有值 —— renderer 不可写，
 *   cookie 唯一写入通道是 douyin:connect / douyin:disconnect（docs/配置体系优化落地实现方案.md §2.3 第 3 步）
 */
export function restoreProtectedFields(
  incoming: Record<string, unknown>,
  currentConfig: PodcastConfig,
): Record<string, unknown> {
  const out = { ...incoming }
  const maskedPattern = /^\*{4}/
  const currentAny = currentConfig as unknown as Record<string, unknown>

  for (const field of ['api_key', 'feishu_app_secret']) {
    if (typeof out[field] === 'string' && maskedPattern.test(out[field] as string)) {
      out[field] = currentAny[field] || ''
    }
  }

  // 还原 AI 供应商 apiKey 脱敏值
  if (out.ai_providers && currentConfig.ai_providers) {
    const incomingProviders = out.ai_providers as Record<string, Record<string, unknown>>
    const currentProviders = currentConfig.ai_providers as unknown as Record<
      string,
      Record<string, unknown>
    >
    for (const [id, provider] of Object.entries(incomingProviders)) {
      if (typeof provider.apiKey === 'string' && maskedPattern.test(provider.apiKey)) {
        provider.apiKey = currentProviders[id]?.apiKey || ''
      }
    }
  }

  // 抖音凭据：renderer 传什么都以主进程现有值为准
  out.douyin_cookie = typeof currentAny.douyin_cookie === 'string' ? currentAny.douyin_cookie : ''
  if (currentAny.douyin_login !== undefined && currentAny.douyin_login !== null) {
    out.douyin_login = currentAny.douyin_login
  } else {
    delete out.douyin_login
  }

  // Notion / 飞书 OAuth 凭据与抖音 cookie 同级保护：renderer 传什么一律还原为主进程现有值
  // （token 唯一写入通道是 notion:oauth* / feishu:oauth* IPC）
  if (currentAny.notion_oauth !== undefined && currentAny.notion_oauth !== null) {
    out.notion_oauth = currentAny.notion_oauth
  } else {
    delete out.notion_oauth
  }
  if (currentAny.feishu_oauth !== undefined && currentAny.feishu_oauth !== null) {
    out.feishu_oauth = currentAny.feishu_oauth
  } else {
    delete out.feishu_oauth
  }

  // export.notion.token：config:get 前已清空（renderer 不接触明文），
  // 传回空值 = 未修改 → 还原主进程现有值防误清空；非空视为用户新输入的手动 Token。
  const currentExportNotion = (
    currentAny.export as { notion?: Record<string, unknown> } | undefined
  )?.notion
  const currentToken =
    typeof currentExportNotion?.token === 'string' ? currentExportNotion.token : ''
  const incomingExport = out.export as Record<string, unknown> | undefined
  if (incomingExport && typeof incomingExport === 'object') {
    const notionIn = incomingExport.notion as Record<string, unknown> | undefined
    if (notionIn && typeof notionIn === 'object') {
      const incomingToken = typeof notionIn.token === 'string' ? notionIn.token : ''
      if (!incomingToken && currentToken) {
        out.export = { ...incomingExport, notion: { ...notionIn, token: currentToken } }
      }
    } else if (currentExportNotion) {
      // renderer 未携带 notion 子对象（异常/旧形态 payload）：整体还原主进程值，防误清空
      out.export = { ...incomingExport, notion: { ...currentExportNotion } }
    }
  }

  return out
}

/**
 * 打通「高级模式（自建应用）」与 OAuth 连接服务：
 * 用户在设置页填写的 feishu_app_id / feishu_app_secret 同步进 feishu_oauth.appId / appSecret，
 * 否则 OAuth 卡片永远显示「连接服务准备中」（feishu_oauth 是受保护字段，renderer 无法直接写入）。
 * 非空才同步：不覆盖已有 OAuth 凭据；清空旧字段时保留 OAuth 已配置值。
 */
export function syncFeishuOAuthCredentials(
  merged: Record<string, unknown>,
  currentConfig: PodcastConfig,
): Record<string, unknown> {
  const appId =
    typeof merged.feishu_app_id === 'string' ? (merged.feishu_app_id as string).trim() : ''
  const appSecret =
    typeof merged.feishu_app_secret === 'string' ? (merged.feishu_app_secret as string).trim() : ''
  if (!appId && !appSecret) return merged

  const currentOauth = ((currentConfig as unknown as Record<string, unknown>).feishu_oauth as
    | Record<string, unknown>
    | undefined) ?? { appId: '', appSecret: '' }
  merged.feishu_oauth = {
    ...currentOauth,
    appId: appId || (typeof currentOauth.appId === 'string' ? currentOauth.appId : ''),
    appSecret:
      appSecret || (typeof currentOauth.appSecret === 'string' ? currentOauth.appSecret : ''),
  }
  return merged
}

/**
 * 打通「Notion OAuth 连接服务」凭据入口（与飞书 syncFeishuOAuthCredentials 对称）：
 * 用户在导出设置填写的 notion_oauth_client_id / notion_oauth_client_secret 同步进
 * notion_oauth.clientId / clientSecret，否则 OAuth 卡片永远显示「连接功能准备中」
 * （notion_oauth 是受保护字段，renderer 无法直接写入）。
 * 非空才同步：不覆盖已有 OAuth 凭据；清空输入时保留已配置值。
 */
export function syncNotionOAuthCredentials(
  merged: Record<string, unknown>,
  currentConfig: PodcastConfig,
): Record<string, unknown> {
  const clientId =
    typeof merged.notion_oauth_client_id === 'string'
      ? (merged.notion_oauth_client_id as string).trim()
      : ''
  const clientSecret =
    typeof merged.notion_oauth_client_secret === 'string'
      ? (merged.notion_oauth_client_secret as string).trim()
      : ''
  if (!clientId && !clientSecret) return merged

  const currentOauth = ((currentConfig as unknown as Record<string, unknown>).notion_oauth as
    | Record<string, unknown>
    | undefined) ?? { clientId: '', clientSecret: '' }
  merged.notion_oauth = {
    ...currentOauth,
    clientId: clientId || (typeof currentOauth.clientId === 'string' ? currentOauth.clientId : ''),
    clientSecret:
      clientSecret ||
      (typeof currentOauth.clientSecret === 'string' ? currentOauth.clientSecret : ''),
  }
  return merged
}

export function registerConfigIPC(mainWindow?: BrowserWindow | null): void {
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
  })

  ipcMain.handle('config:get', () => {
    try {
      return loadSafeConfig()
    } catch {
      return null
    }
  })

  // Notion 手动高级模式配置状态（token 明文已从 config:get 移除，renderer 只读布尔状态）
  ipcMain.handle('notion:exportStatus', () => {
    try {
      const cfg = loadConfig()
      const n = cfg.export?.notion
      return { configured: !!(n?.token?.trim() && n?.database_id?.trim()) }
    } catch {
      return { configured: false }
    }
  })

  ipcMain.handle('config:save', (_e, config) => {
    try {
      // 合并默认值，防止缺失字段
      const currentConfig = loadConfig()

      // 还原受保护字段：脱敏值（**** 开头）与抖音凭据一律以主进程现有值为准
      const incoming = restoreProtectedFields(config as Record<string, unknown>, currentConfig)

      const merged = { ...currentConfig, ...incoming } as Record<string, unknown>
      // 兜底保护：无论 incoming 形态如何，export.notion.token 为空时一律还原主进程现有值
      // （覆盖「更新/保存后已保存令牌丢失」：任何保存路径都不得误清空手动 Token）
      const curNotion = (currentConfig.export as { notion?: Record<string, unknown> } | undefined)
        ?.notion
      const curToken = typeof curNotion?.token === 'string' ? curNotion.token : ''
      if (curToken) {
        const mergedExport = merged.export as { notion?: Record<string, unknown> } | undefined
        const mergedToken =
          typeof mergedExport?.notion?.token === 'string' ? mergedExport.notion.token : ''
        if (!mergedToken) {
          merged.export = {
            ...(mergedExport ?? {}),
            notion: { ...(mergedExport?.notion ?? {}), token: curToken },
          }
        }
      }
      // 打通高级模式 → OAuth：顶层 App ID/Secret 同步进 feishu_oauth（见 syncFeishuOAuthCredentials）
      syncFeishuOAuthCredentials(merged, currentConfig)
      // 打通 Notion OAuth 凭据入口：顶层 Client ID/Secret 同步进 notion_oauth
      syncNotionOAuthCredentials(merged, currentConfig)
      // schema 验证
      const validationError = validateConfigInput(merged as Record<string, unknown>)
      if (validationError) {
        console.warn('Config save rejected:', validationError)
        return false
      }
      saveConfig(merged as unknown as PodcastConfig)
      return true
    } catch {
      return false
    }
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
      const config = loadConfig()
      const allowedDirs = [config.obsidian_dir, app.getPath('userData')].filter(Boolean)

      // 目录路径：仅检查是否在允许的目录范围内
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        if (!isPathWithinBase(filePath, allowedDirs)) {
          console.warn('shell:openPath blocked (dir):', filePath)
          return false
        }
        await shell.openPath(filePath)
        return true
      }

      // 文件路径：检查扩展名白名单 + 目录范围
      const allowedExts = ['.md', '.txt', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.svg']
      if (!isSafeFilePath(filePath, allowedDirs, allowedExts)) {
        console.warn('shell:openPath blocked:', filePath)
        return false
      }
      await shell.openPath(filePath)
      return true
    } catch {
      return false
    }
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
    } catch {
      return false
    }
  })

  ipcMain.handle('app:cleanTemp', () => {
    try {
      // 仅允许清理应用默认临时目录，防止 audio_dir 被篡改后误删其他目录
      const tempDir = join(app.getPath('userData'), '_podcast_temp')
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
    return true
  })

  // 一键创建默认目录：文档/PodMuse笔记 + 下载/PodMuse音频；
  // 仅当配置对应字段为空时写回（已有自定义目录不覆盖）
  ipcMain.handle('app:createDefaultDirs', () => {
    return createDefaultDirs()
  })

  ipcMain.handle('platform:detectYtDlp', () => {
    return detectYtDlp()
  })

  ipcMain.handle('backlinks:index', () => {
    const cfg = loadConfig()
    return buildBacklinkIndex(cfg.obsidian_dir || '')
  })

  ipcMain.handle('tags:getIndex', () => {
    const cfg = loadConfig()
    return buildTagIndex(cfg.obsidian_dir || '')
  })

  ipcMain.handle('shell:showInFolder', async (_e, filePath: string) => {
    try {
      if (!filePath || typeof filePath !== 'string') return false
      // 复用 shell:openPath 的路径安全检查
      const config = loadConfig()
      const allowedDirs = [config.obsidian_dir, app.getPath('userData')].filter(Boolean)
      const allowedExts = [
        '.md',
        '.txt',
        '.pdf',
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.svg',
        '.mp3',
        '.wav',
        '.m4a',
        '.mp4',
        '.json',
      ]
      if (!isSafeFilePath(filePath, allowedDirs, allowedExts)) {
        console.warn('shell:showInFolder blocked:', filePath)
        return false
      }
      shell.showItemInFolder(filePath)
      return true
    } catch {
      return false
    }
  })
}
