import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, session } from 'electron'
import { join, basename, extname } from 'path'
import { loadConfig, saveState, loadState, maskSecret } from './config'
import { isSafeUrl } from './security'
import { registerCoreIPC } from './ipc'
import { FeishuMonitor } from './feishu'
import { processPodcast } from './podcast'
import { getActiveProviderConfig } from './ai-providers'
import { fetchPodcastTitle } from './podcast'
import { platformRegistry } from './platforms'
import { scanLocalModels, checkHardware } from './whisper-model-manager'
import { setPromptDir, exportBuiltInTemplates } from './ai-client'
import * as fs from 'fs'
import {
  completeRecentTask,
  failRecentTask,
  startRecentTask,
  stopRecentTask,
} from './recent-task-state'
import {
  runStartupRecovery,
  startConsistencyChecker,
  stopConsistencyChecker,
  runConsistencyCheck,
} from './task-recovery'
import { sendNotification, setupNotificationAppId } from './notify'
import { BatchQueueService } from './batch-queue'
import { registerBatchIPC } from './ipc/batch-ipc'
import { processedEpisodeIds, addProcessedId } from './dedup-store'
import type { StepInfo, FeishuStatus } from '@shared/types'

let mainWindow: BrowserWindow | null = null
let monitor: FeishuMonitor | null = null
let pendingAbort: AbortController | null = null
let pendingProcessDone: (() => void) | null = null
let tray: Tray | null = null
let isQuitting = false
let batchQueueService: BatchQueueService | null = null

// 单实例锁：防止重复打开，第二次启动时聚焦已有窗口
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function hasActiveProcess(): boolean {
  if (pendingAbort && !pendingAbort.signal.aborted) return true
  if (monitor) {
    try {
      if (monitor.hasActiveProcess()) return true
    } catch {}
  }
  return false
}

function updateRecentState(
  updater: (state: ReturnType<typeof loadState>) => ReturnType<typeof loadState>,
): ReturnType<typeof loadState> {
  const current = loadState()
  const updated = updater(current)
  saveState(updated)
  try {
    mainWindow?.webContents.send('task:state-changed')
  } catch {}
  return updated
}

function getResourcePath(...segments: string[]) {
  return join(__dirname, '..', ...segments)
}

function createWindow() {
  Menu.setApplicationMenu(null)

  let icon: Electron.NativeImage | undefined
  try {
    const fs = require('fs')
    const baseDirs = [process.resourcesPath, join(__dirname, '..', '..'), app.getAppPath()].filter(
      Boolean,
    )

    const iconCandidates = ['build/icon.png', '播客笔记_256.png', '播客笔记.png']

    for (const base of baseDirs) {
      for (const candidate of iconCandidates) {
        const p = join(base, candidate)
        if (fs.existsSync(p)) {
          icon = nativeImage.createFromPath(p)
          console.log('图标已加载:', p)
          break
        }
      }
      if (icon) break
    }
    if (!icon)
      console.log(
        '⚠ 未找到图标文件，尝试过的路径:',
        baseDirs.flatMap(d => iconCandidates.map(c => join(d, c))),
      )
  } catch (e) {
    console.log('图标加载异常:', e)
  }

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 680,
    title: 'PodMuse',
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
  mainWindow.on('close', e => {
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
  registerCoreIPC(mainWindow, monitor)

  // 初始化批量处理队列引擎
  batchQueueService = new BatchQueueService({
    onTaskUpdate: (index, task) => {
      try {
        mainWindow?.webContents.send('batch:task-update', index, task)
      } catch {}
    },
    onQueueStateChange: () => {
      try {
        const state = batchQueueService?.getState()
        mainWindow?.webContents.send('batch:queue-state', state)
        // Sync batch mode to Feishu dispatcher
        const isBatchActive = state && (state.status === 'running' || state.status === 'paused')
        monitor?.setBatchMode(!!isBatchActive)
      } catch {}
    },
    onQueueComplete: summary => {
      try {
        mainWindow?.webContents.send('batch:queue-complete', summary)
      } catch {}
    },
    sendStep: step => {
      try {
        mainWindow?.webContents.send('podcast:step', step)
      } catch {}
    },
    sendLog: msg => {
      try {
        mainWindow?.webContents.send('log', msg)
      } catch {}
    },
    updateRecentState: updater => {
      updateRecentState(updater)
    },
  })
  registerBatchIPC(mainWindow, batchQueueService)

  // ---- 抖音下载器安装检查 ----
  ipcMain.handle('douyin:setup', async () => {
    const { execSync } = await import('child_process')
    const downloadPath = process.env.DOUYIN_DOWNLOADER_PATH || 'G:\\douyin-downloader-main'
    const scriptPath = join(downloadPath, 'douyin-cli.py')

    // 检查 Python
    let pythonOk = false
    try {
      const ver = execSync('python --version', { encoding: 'utf-8' }).trim()
      pythonOk = ver.includes('3.')
    } catch {}

    if (!pythonOk) {
      return { success: false, error: '请先安装 Python 3.8+：https://www.python.org/downloads/\n安装时勾选 Add Python to PATH' }
    }

    // 检查 douyin-downloader 是否存在
    if (!fs.existsSync(scriptPath)) {
      return { success: false, error: '请下载抖音下载器并解压到 ' + downloadPath + '\n下载地址: https://github.com/jiji262/douyin-downloader/archive/refs/heads/main.zip' }
    }

    // 安装依赖
    try {
      execSync('pip install -r requirements.txt', { cwd: downloadPath, encoding: 'utf-8', timeout: 120000 })
    } catch (e: unknown) {
      return { success: false, error: '安装依赖失败: ' + (e instanceof Error ? e.message : String(e)) }
    }

    return { success: true, path: downloadPath }
  })

  // ---- 抖音 Cookie 登录 ----
  ipcMain.handle('douyin:login', async () => {
    return new Promise((resolve, reject) => {
      const loginWin = new BrowserWindow({
        width: 500,
        height: 700,
        title: '登录抖音',
        parent: mainWindow || undefined,
        modal: true,
        webPreferences: {
          session: session.defaultSession,
          nodeIntegration: false,
          contextIsolation: true,
        },
      })

      loginWin.loadURL('https://www.douyin.com/')

      // 检查是否已登录（每3秒检查一次 cookie）
      const checkInterval = setInterval(async () => {
        try {
          const cookies = await session.defaultSession.cookies.get({ domain: '.douyin.com' })
          const hasLogin = cookies.some(c => c.name === 'sid_guard' || c.name === 'sessionid')
          if (hasLogin) {
            clearInterval(checkInterval)
            // 收集所有抖音 cookie
            const allCookies = await session.defaultSession.cookies.get({})
            const douyinCookies = allCookies.filter(c =>
              (c.domain?.includes('douyin.com') || c.domain?.includes('iesdouyin.com'))
            )
            const cookieStr = douyinCookies.map(c => c.name + '=' + c.value).join('; ')
            loginWin.close()
            resolve(cookieStr)
          }
        } catch {}
      }, 3000)

      loginWin.on('closed', () => {
        clearInterval(checkInterval)
        resolve('') // 用户关闭窗口，返回空
      })

      loginWin.webContents.on('did-fail-load', (_e, code, desc) => {
        clearInterval(checkInterval)
        loginWin.close()
        reject(new Error('页面加载失败: ' + desc))
      })
    })
  })

  // ---- 以下为涉及模块级状态的 handler，保留在 index.ts 中 ----

  ipcMain.handle('feishu:start', async () => {
    try {
      if (monitor) monitor.stop()
      const config = loadConfig()

      // 检测敏感字段解密是否失败
      const failedFields = (config as unknown as Record<string, unknown>)
        ._decryptionFailedFields as string[] | undefined
      if (failedFields?.length) {
        const msg = `⚠ 凭据解密失败（${failedFields.join(', ')}），请在设置中重新输入飞书 App Secret 和 API Key`
        try {
          mainWindow?.webContents.send('log', msg)
        } catch {}
      }

      monitor = new FeishuMonitor(
        config,
        (msg: string) => {
          try {
            mainWindow?.webContents.send('log', msg)
          } catch {}
        },
        (status: FeishuStatus) => {
          try {
            mainWindow?.webContents.send('feishu:status', status)
          } catch {}
        },
        (step: StepInfo) => {
          try {
            mainWindow?.webContents.send('podcast:step', step)
          } catch {}
        },
        (p: boolean, url?: string) => {
          try {
            mainWindow?.webContents.send('podcast:processing', p, url)
          } catch {}
          if (!p && pendingProcessDone) {
            pendingProcessDone()
            pendingProcessDone = null
          }
        },
        () => {
          try {
            mainWindow?.webContents.send('task:state-changed')
          } catch {}
        },
      )
      await monitor.start()
      return monitor.getStatus()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('feishu:start error:', msg)
      try {
        mainWindow?.webContents.send('log', `⚠ 飞书启动异常: ${msg}`)
      } catch {}
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

  ipcMain.handle(
    'feishu:testConnection',
    async (_e, params: { appId: string; appSecret: string; chatId: string }) => {
      try {
        const { FeishuClient } = await import('./feishu-client')
        const client = new FeishuClient(params.appId, params.appSecret, () => {})
        const ok = await client.ensureToken()
        if (!ok) {
          return { success: false, code: 'auth_failed' }
        }
        // 如果填了 Chat ID，验证是否有效
        if (params.chatId?.trim()) {
          const chatName = await client.getChatInfo(params.chatId.trim())
          if (chatName) {
            return { success: true, code: 'chat_ok', chatName }
          }
          return { success: false, code: 'chat_invalid' }
        }
        return { success: true, code: 'no_chat_skipped' }
      } catch (e) {
        return {
          success: false,
          code: 'test_error',
          detail: (e as Error).message,
        }
      }
    },
  )

  ipcMain.handle(
    'podcast:process',
    async (
      _event,
      {
        url,
        force,
        taskId,
        isLocalFile,
      }: { url: string; force?: boolean; taskId?: string; isLocalFile?: boolean },
    ) => {
      if (!isLocalFile) {
        // 使用平台注册表获取去重 key（通用，支持所有平台）
        const platformInfo = platformRegistry.findAdapter(url)
        const episodeId = platformInfo?.adapter.getDedupKey(url) || null
        if (!force && episodeId && processedEpisodeIds.has(episodeId)) {
          mainWindow?.webContents.send('log', `⏭ 该播客已处理过 (${episodeId})，跳过`)
          return { success: false, error: '该播客已处理过' }
        }
      }
      const initialTitle = isLocalFile
        ? basename(url, extname(url))
        : await fetchPodcastTitle(url).catch(() => null)
      const platformInfoForId = !isLocalFile ? platformRegistry.findAdapter(url) : null
      const episodeId = platformInfoForId?.adapter.getDedupKey(url) || null
      // Capture the actual taskId (auto-generated if none provided) so completeRecentTask can find it
      const stateAfterStart = updateRecentState(state =>
        startRecentTask(state, { id: taskId, url, episodeId, title: initialTitle }),
      )
      const actualTaskId =
        stateAfterStart.activeTasks.find(t => t.url === url && t.status === 'running')?.id || taskId
      pendingAbort = new AbortController()
      const signal = pendingAbort.signal
      const config = loadConfig()
      // 获取活跃 AI 供应商配置，回退到旧 api_key 字段
      let activeProvider = getActiveProviderConfig(config.ai_provider, config.ai_providers)
      if (!activeProvider && config.api_key) {
        activeProvider = {
          baseUrl: 'https://api.deepseek.com',
          apiKey: config.api_key,
          model: 'deepseek-chat',
        }
      }
      let lastErrorDetail: string | null = null
      try {
        const result = await processPodcast(
          url,
          activeProvider,
          config.ai_provider,
          config.language,
          config.obsidian_dir,
          config.audio_dir,
          (step: StepInfo) => {
            if (step.status === 'error') lastErrorDetail = step.detail || step.subtitle
            try {
              mainWindow?.webContents.send('podcast:step', step)
            } catch {}
          },
          (msg: string) => {
            try {
              mainWindow?.webContents.send('log', msg)
            } catch {}
          },
          signal,
          isLocalFile,
          force || false,
        )
        if (result) {
          if (episodeId) {
            addProcessedId(episodeId)
          }
          updateRecentState(state =>
            completeRecentTask(state, { taskId: actualTaskId, url, episodeId, filename: result }),
          )
          if (config.notification_enabled !== false) {
            sendNotification('PodMuse', `笔记已生成：${result}`)
          }
        } else {
          const errorReason = lastErrorDetail || '处理失败，请检查日志'
          updateRecentState(state => failRecentTask(state, errorReason))
          if (config.notification_enabled !== false) {
            sendNotification('PodMuse', `处理失败：${errorReason}`)
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
            mainWindow?.webContents.send('podcast:step', {
              step: i,
              title: titles[i - 1],
              subtitle: '已取消',
              status: 'stopped',
              detail: '用户取消了处理',
            })
          }
          return { success: false, error: '处理已取消' }
        }
        updateRecentState(state => failRecentTask(state, errMsg))
        if (config.notification_enabled !== false) {
          sendNotification('PodMuse', `处理出错：${errMsg}`)
        }
        return { success: false, error: errMsg }
      } finally {
        if (pendingAbort?.signal === signal) pendingAbort = null
        if (pendingProcessDone) {
          pendingProcessDone()
          pendingProcessDone = null
        }
      }
    },
  )

  ipcMain.handle('podcast:checkProcessed', (_e, url: string) => {
    const platformInfo = platformRegistry.findAdapter(url)
    const episodeId = platformInfo?.adapter.getDedupKey(url) || null
    return episodeId ? processedEpisodeIds.has(episodeId) : false
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
          try {
            mainWindow?.webContents.send('log', msg)
          } catch {}
        })
        if (fixed > 0) {
          cancelled = true
          try {
            mainWindow?.webContents.send('task:state-changed')
          } catch {}
        }
      }
    }

    if (cancelled && pendingAbort) {
      await new Promise<void>(resolve => {
        pendingProcessDone = resolve
      })
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

  ipcMain.handle(
    'ai:fetchModels',
    async (_e, { baseUrl, apiKey }: { baseUrl: string; apiKey: string }) => {
      try {
        // 如果 apiKey 是脱敏值（以 **** 开头），从配置文件读取真实值
        if (apiKey && /^\*{4}/.test(apiKey)) {
          const config = loadConfig()
          const realKey = config.ai_providers
            ? Object.values(config.ai_providers).find(
                p => p.apiKey && maskSecret(p.apiKey) === apiKey,
              )?.apiKey
            : undefined
          if (realKey) {
            apiKey = realKey
          } else if (config.api_key && maskSecret(config.api_key) === apiKey) {
            apiKey = config.api_key
          } else {
            return {
              success: false,
              error: 'API Key 是脱敏值，无法获取真实密钥。请在设置中重新输入 API Key',
              models: [],
            }
          }
        }

        if (!baseUrl || !apiKey) {
          return { success: false, error: '请先填写API地址和API Key', models: [] }
        }
        if (!isSafeUrl(baseUrl)) {
          return { success: false, error: 'API 地址必须使用 http:// 或 https:// 协议', models: [] }
        }
        let url = baseUrl.replace(/\/+$/, '')
        if (!url.endsWith('/v1')) {
          url += '/v1'
        }
        url += '/models'

        const resp = await fetch(url, {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10000),
        })

        if (!resp.ok) {
          const errorText = await resp.text().catch(() => '')
          return { success: false, error: `HTTP ${resp.status}: ${errorText}`, models: [] }
        }

        const data = (await resp.json()) as { data?: Array<{ id: string }> }
        const models = (data.data || [])
          .map(m => ({ id: m.id, name: m.id }))
          .sort((a, b) => a.id.localeCompare(b.id))

        return { success: true, models }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '获取模型列表失败'
        return { success: false, error: msg, models: [] }
      }
    },
  )
}

function createTray() {
  let icon: Electron.NativeImage | undefined
  try {
    const baseDirs = [process.resourcesPath, join(__dirname, '..', '..'), app.getAppPath()].filter(
      Boolean,
    )

    const iconCandidates = ['build/icon.png', '播客笔记_256.png', '播客笔记.png']

    for (const base of baseDirs) {
      for (const candidate of iconCandidates) {
        const p = join(base, candidate)
        if (fs.existsSync(p)) {
          icon = nativeImage.createFromPath(p)
          break
        }
      }
      if (icon) break
    }
  } catch {}

  tray = new Tray(icon || nativeImage.createEmpty())
  tray.setToolTip('PodMuse')

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
  // 项目更名后 userData 路径可能变化（podcast-notes → podmuse），迁移旧配置
  try {
    const oldData = join(app.getPath('appData'), 'podcast-notes')
    const newData = app.getPath('userData')
    if (oldData !== newData && fs.existsSync(oldData) && !fs.existsSync(newData)) {
      fs.mkdirSync(newData, { recursive: true })
      fs.cpSync(oldData, newData, { recursive: true })
      console.log('[migrate] 已从旧配置目录迁移: ' + oldData + ' -> ' + newData)
    }
  } catch (e) {
    console.error('[migrate] 配置迁移失败:', e)
  }

  // 设置 AppUserModelID 以支持 Windows 通知
  setupNotificationAppId()

  // 初始化 prompt 模板目录并导出内置模板
  const promptsDir = join(app.getPath('userData'), 'prompts')
  setPromptDir(promptsDir)
  exportBuiltInTemplates()

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
      try {
        mainWindow?.webContents.send('log', msg)
      } catch {}
    },
    (_count: number) => {
      try {
        mainWindow?.webContents.send('task:state-changed')
      } catch {}
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
  if (batchQueueService?.isRunning) {
    batchQueueService.pause()
  }
  batchQueueService?.forceFlush?.()
  monitor?.cancelProcessing()
  monitor?.stop()
  tray?.destroy()
  tray = null
})

app.on('window-all-closed', () => {
  // 窗口全部关闭时不退出，保持后台运行（系统托盘）
})
