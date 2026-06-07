import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage } from 'electron'
import { join, basename, extname } from 'path'
import { loadConfig, saveState, loadState, maskSecret } from './config'
import { isSafeUrl } from './security'
import { registerCoreIPC } from './ipc'
import { FeishuMonitor } from './feishu'
import { processPodcast } from './podcast'
import { getActiveProviderConfig } from './ai-providers'
import { fetchPodcastTitle } from './podcast'
import { scanLocalModels, checkHardware } from './whisper-model-manager'
import * as fs from 'fs'
import { completeRecentTask, failRecentTask, startRecentTask, stopRecentTask } from './recent-task-state'
import { runStartupRecovery, startConsistencyChecker, stopConsistencyChecker, runConsistencyCheck } from './task-recovery'
import { sendNotification, setupNotificationAppId } from './notify'
import type { StepInfo, FeishuStatus } from '@shared/types'

let mainWindow: BrowserWindow | null = null
let monitor: FeishuMonitor | null = null
const processedEpisodeIds = new Set<string>(loadState().processedUrls || [])
const lastProcessedContentTypes = new Map<string, string>() // 记录每个episodeId上次使用的contentType
let pendingAbort: AbortController | null = null
let pendingProcessDone: (() => void) | null = null
let tray: Tray | null = null
let isQuitting = false

function hasActiveProcess(): boolean {
  if (pendingAbort && !pendingAbort.signal.aborted) return true
  if (monitor) {
    try {
      if (monitor.hasActiveProcess()) return true
    } catch {}
  }
  return false
}

function updateRecentState(updater: (state: ReturnType<typeof loadState>) => ReturnType<typeof loadState>) {
  const current = loadState()
  saveState(updater(current))
  try { mainWindow?.webContents.send('task:state-changed') } catch {}
}

function getResourcePath(...segments: string[]) {
  const isDev = !!process.env.VITE_DEV_SERVER_URL
  if (isDev) {
    return join(__dirname, '..', ...segments)
  }
  return join(__dirname, '..', ...segments)
}

function createWindow() {
  Menu.setApplicationMenu(null)

  let icon: Electron.NativeImage | undefined
  try {
    const fs = require('fs')
    const baseDirs = [
      process.resourcesPath,
      join(__dirname, '..', '..'),
      app.getAppPath(),
    ].filter(Boolean)

    const iconCandidates = [
      'build/icon.png',
      '播客笔记_256.png',
      '播客笔记.png',
    ]

    for (const base of baseDirs) {
      for (const candidate of iconCandidates) {
        const p = join(base, candidate)
        if (fs.existsSync(p)) { icon = nativeImage.createFromPath(p); console.log('图标已加载:', p); break }
      }
      if (icon) break
    }
    if (!icon) console.log('⚠ 未找到图标文件，尝试过的路径:', baseDirs.flatMap(d => iconCandidates.map(c => join(d, c))))
  } catch (e) { console.log('图标加载异常:', e) }

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 680,
    title: '播客笔记助手',
    icon,
    backgroundColor: '#0a0a0f',
    show: false,
    frame: false,
    transparent: false,
    resizable: true,
    webPreferences: {
      preload: getResourcePath('preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // 拦截窗口关闭事件，隐藏到系统托盘而非退出
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error(`Page load failed: ${code} - ${desc}`)
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    const htmlPath = join(__dirname, '..', '..', 'dist', 'index.html')
    mainWindow.loadFile(htmlPath)
  }
}

function setupIPC() {
  // 注册无状态/轻量级 IPC handler（配置、任务、搜索、窗口、对话框等）
  registerCoreIPC(mainWindow)

  // ---- 以下为涉及模块级状态的 handler，保留在 index.ts 中 ----

  ipcMain.handle('feishu:start', async () => {
    try {
      if (monitor) monitor.stop()
      const config = loadConfig()

      // 检测敏感字段解密是否失败
      const failedFields = (config as unknown as Record<string, unknown>)._decryptionFailedFields as string[] | undefined
      if (failedFields?.length) {
        const msg = `⚠ 凭据解密失败（${failedFields.join(', ')}），请在设置中重新输入飞书 App Secret 和 API Key`
        try { mainWindow?.webContents.send('log', msg) } catch {}
      }

      monitor = new FeishuMonitor(
        config,
        (msg: string) => { try { mainWindow?.webContents.send('log', msg) } catch {} },
        (status: FeishuStatus) => { try { mainWindow?.webContents.send('feishu:status', status) } catch {} },
        (step: StepInfo) => { try { mainWindow?.webContents.send('podcast:step', step) } catch {} },
        (p: boolean, url?: string) => {
          try { mainWindow?.webContents.send('podcast:processing', p, url) } catch {}
          if (!p && pendingProcessDone) { pendingProcessDone(); pendingProcessDone = null }
        },
        () => { try { mainWindow?.webContents.send('task:state-changed') } catch {} },
      )
      await monitor.start()
      return monitor.getStatus()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('feishu:start error:', msg)
      try { mainWindow?.webContents.send('log', `⚠ 飞书启动异常: ${msg}`) } catch {}
      return { connected: false, monitoring: false, chatId: '' }
    }
  })

  ipcMain.handle('feishu:stop', () => {
    monitor?.stop()
    return { connected: monitor?.isConnected() ?? false, monitoring: false, chatId: '' }
  })

  ipcMain.handle('feishu:status', () => {
    return monitor?.getStatus() ?? { connected: false, monitoring: false, chatId: '' }
  })

  ipcMain.handle('podcast:process', async (_event, { url, force, taskId, isLocalFile, contentType }: { url: string; force?: boolean; taskId?: string; isLocalFile?: boolean; contentType?: string }) => {
    if (!isLocalFile) {
      const episodeMatch = url.match(/xiaoyuzhoufm\.com\/episode\/([a-zA-Z0-9]+)/)
      const episodeId = episodeMatch ? episodeMatch[1] : null
      const config = loadConfig()
      const effectiveContentType = contentType || config.content_type || 'default'
      if (!force && episodeId && processedEpisodeIds.has(episodeId)) {
        const lastContentType = lastProcessedContentTypes.get(episodeId)
        if (lastContentType === effectiveContentType) {
          mainWindow?.webContents.send('log', `⏭ 该播客已处理过 (${episodeId})，跳过`)
          return { success: false, error: '该播客已处理过' }
        }
        mainWindow?.webContents.send('log', `🔄 内容类型已更改，重新处理播客 (${episodeId})`)
      }
    }
    const initialTitle = isLocalFile ? basename(url, extname(url)) : await fetchPodcastTitle(url).catch(() => null)
    const episodeId = isLocalFile ? null : (url.match(/xiaoyuzhoufm\.com\/episode\/([a-zA-Z0-9]+)/)?.[1] || null)
    updateRecentState(state => startRecentTask(state, { id: taskId, url, episodeId, title: initialTitle }))
    pendingAbort = new AbortController()
    const signal = pendingAbort.signal
    const config = loadConfig()
    // 获取活跃 AI 供应商配置，回退到旧 api_key 字段
    let activeProvider = getActiveProviderConfig(config.ai_provider, config.ai_providers)
    if (!activeProvider && config.api_key) {
      activeProvider = { baseUrl: 'https://api.deepseek.com', apiKey: config.api_key, model: 'deepseek-chat' }
    }
    try {
      const result = await processPodcast(
        url, activeProvider, config.ai_provider, config.language,
        config.obsidian_dir, config.audio_dir,
        (step: StepInfo) => { try { mainWindow?.webContents.send('podcast:step', step) } catch {} },
        (msg: string) => { try { mainWindow?.webContents.send('log', msg) } catch {} },
        signal,
        isLocalFile,
        contentType || config.content_type || 'default',
      )
      if (result) {
        if (episodeId) {
          processedEpisodeIds.add(episodeId)
          lastProcessedContentTypes.set(episodeId, contentType || config.content_type || 'default')
        }
        updateRecentState(state => completeRecentTask(state, { taskId, url, episodeId, filename: result }))
        if (config.notification_enabled !== false) {
          sendNotification('播客笔记助手', `笔记已生成：${result}`)
        }
      } else {
        updateRecentState(state => failRecentTask(state))
        if (config.notification_enabled !== false) {
          sendNotification('播客笔记助手', '处理失败，请检查日志')
        }
      }
      return { success: true, filename: result }
    } catch (err: unknown) {
      const errName = err instanceof Error ? err.name : ''
      const errMsg = err instanceof Error ? err.message : String(err)
      if (errName === 'AbortError' || signal.aborted) {
        updateRecentState(state => stopRecentTask(state))
        mainWindow?.webContents.send('log', '■ 处理已取消')
        for (let i = 1; i <= 5; i++) {
          const titles = ['解析页面', '下载音频', '语音转文字', '修正专有名词', 'AI 提炼笔记']
          mainWindow?.webContents.send('podcast:step', { step: i, title: titles[i - 1], subtitle: '已取消', status: 'stopped', detail: '用户取消了处理' })
        }
        return { success: false, error: '处理已取消' }
      }
      updateRecentState(state => failRecentTask(state))
      if (config.notification_enabled !== false) {
        sendNotification('播客笔记助手', `处理出错：${errMsg}`)
      }
      return { success: false, error: errMsg }
    } finally {
      if (pendingAbort?.signal === signal) pendingAbort = null
      if (pendingProcessDone) { pendingProcessDone(); pendingProcessDone = null }
    }
  })

  ipcMain.handle('podcast:cancel', async () => {
    let cancelled = false

    if (pendingAbort && !pendingAbort.signal.aborted) {
      pendingAbort.abort()
      cancelled = true
    }

    if (monitor?.cancelProcessing()) {
      cancelled = true
    }

    if (!cancelled) {
      const state = loadState()
      const zombieCount = state.activeTasks.filter(t => t.status === 'running').length
      if (zombieCount > 0) {
        const fixed = runConsistencyCheck(hasActiveProcess, (msg: string) => {
          try { mainWindow?.webContents.send('log', msg) } catch {}
        })
        if (fixed > 0) {
          cancelled = true
          try { mainWindow?.webContents.send('task:state-changed') } catch {}
        }
      }
    }

    if (cancelled && pendingAbort) {
      await new Promise<void>(resolve => { pendingProcessDone = resolve })
    }

    return cancelled
  })

  ipcMain.handle('whisper:scanModels', () => {
    const config = loadConfig()
    return scanLocalModels(config.whisper_exe_path)
  })

  ipcMain.handle('whisper:checkHardware', (_e, modelId: string) => {
    return checkHardware(modelId)
  })

  ipcMain.handle('ai:fetchModels', async (_e, { baseUrl, apiKey }: { baseUrl: string; apiKey: string }) => {
    try {
      // 如果 apiKey 是脱敏值（以 **** 开头），从配置文件读取真实值
      if (apiKey && /^\*{4}/.test(apiKey)) {
        const config = loadConfig()
        const realKey = config.ai_providers
          ? Object.values(config.ai_providers).find(p => p.apiKey && maskSecret(p.apiKey) === apiKey)?.apiKey
          : undefined
        if (realKey) {
          apiKey = realKey
        } else if (config.api_key && maskSecret(config.api_key) === apiKey) {
          apiKey = config.api_key
        } else {
          return { success: false, error: 'API Key 是脱敏值，无法获取真实密钥。请在设置中重新输入 API Key', models: [] }
        }
      }

      if (!baseUrl || !apiKey) {
        return { success: false, error: '请先填写API地址和API Key', models: [] }
      }
      if (!isSafeUrl(baseUrl)) {
        return { success: false, error: 'API 地址必须使用 http:// 或 https:// 协议', models: [] }
      }
      let url = baseUrl.replace(/\/+$/, '')
      if (!url.endsWith('/v1')) { url += '/v1' }
      url += '/models'

      const resp = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
      })

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => '')
        return { success: false, error: `HTTP ${resp.status}: ${errorText}`, models: [] }
      }

      const data = await resp.json() as { data?: Array<{ id: string }> }
      const models = (data.data || [])
        .map((m) => ({ id: m.id, name: m.id }))
        .sort((a, b) => a.id.localeCompare(b.id))

      return { success: true, models }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '获取模型列表失败'
      return { success: false, error: msg, models: [] }
    }
  })
}

function createTray() {
  let icon: Electron.NativeImage | undefined
  try {
    const baseDirs = [
      process.resourcesPath,
      join(__dirname, '..', '..'),
      app.getAppPath(),
    ].filter(Boolean)

    const iconCandidates = [
      'build/icon.png',
      '播客笔记_256.png',
      '播客笔记.png',
    ]

    for (const base of baseDirs) {
      for (const candidate of iconCandidates) {
        const p = join(base, candidate)
        if (fs.existsSync(p)) { icon = nativeImage.createFromPath(p); break }
      }
      if (icon) break
    }
  } catch {}

  tray = new Tray(icon || nativeImage.createEmpty())
  tray.setToolTip('播客笔记助手')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  // 双击托盘图标显示窗口
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

app.whenReady().then(() => {
  // 设置 AppUserModelID 以支持 Windows 通知
  setupNotificationAppId()
  
  runStartupRecovery((msg: string) => {
    console.log(msg)
  })

  createWindow()
  setupIPC()
  createTray()

  startConsistencyChecker(
    hasActiveProcess,
    (msg: string) => {
      console.log(msg)
      try { mainWindow?.webContents.send('log', msg) } catch {}
    },
    (_count: number) => {
      try { mainWindow?.webContents.send('task:state-changed') } catch {}
    },
  )

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  isQuitting = true
  stopConsistencyChecker()
  if (pendingAbort && !pendingAbort.signal.aborted) {
    pendingAbort.abort()
  }
  monitor?.cancelProcessing()
  monitor?.stop()
  tray?.destroy()
  tray = null
})

app.on('window-all-closed', () => {
  // 窗口全部关闭时不退出，保持后台运行（系统托盘）
})
