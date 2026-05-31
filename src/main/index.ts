import { app, BrowserWindow, ipcMain, Menu, Tray, dialog, nativeImage } from 'electron'
import { join, basename, extname } from 'path'
import { loadConfig, loadState, saveConfig, saveState } from './config'
import { FeishuMonitor } from './feishu'
import { processPodcast } from './podcast'
import { fetchPodcastTitle } from './podcast'
import { scanLocalModels, checkHardware } from './whisper-model-manager'
import * as fs from 'fs'
import { completeRecentTask, failRecentTask, getRecentTasks, removeRecentTask, startRecentTask, stopRecentTask } from './recent-task-state'
import { runStartupRecovery, startConsistencyChecker, stopConsistencyChecker, getRecoveryLogs, runConsistencyCheck } from './task-recovery'
import { sendNotification, setupNotificationAppId } from './notify'

let mainWindow: BrowserWindow | null = null
let monitor: FeishuMonitor | null = null
const processedEpisodeIds = new Set<string>(loadState().processedUrls || [])
let pendingAbort: AbortController | null = null
let pendingProcessDone: (() => void) | null = null
let tray: Tray | null = null
let isQuitting = false

function hasActiveProcess(): boolean {
  if (pendingAbort && !pendingAbort.signal.aborted) return true
  if (monitor) {
    try {
      const dispatcher = (monitor as any)._dispatcher
      if (dispatcher?.abortRef && !dispatcher.abortRef.signal.aborted) return true
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
      (process as any).resourcesPath,
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
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
  })

  ipcMain.handle('config:get', () => {
    try { return loadConfig() } catch (e: any) { return null }
  })

  ipcMain.handle('config:save', (_e, config) => {
    try { saveConfig(config); return true } catch { return false }
  })

  ipcMain.handle('task:getRecent', () => {
    return getRecentTasks(loadState())
  })

  ipcMain.handle('task:getAll', () => {
    const state = loadState()
    return {
      activeTasks: state.activeTasks,
      recentTasks: state.recentTasks
    }
  })

  ipcMain.handle('task:removeRecent', (_event, taskId: string) => {
    updateRecentState(state => removeRecentTask(state, taskId))
    const state = loadState()
    return {
      activeTasks: state.activeTasks,
      recentTasks: state.recentTasks
    }
  })

  ipcMain.handle('feishu:start', async () => {
    if (monitor) monitor.stop()
    const config = loadConfig()
    monitor = new FeishuMonitor(
      config,
      (msg: string) => { try { mainWindow?.webContents.send('log', msg) } catch {} },
      (status: any) => { try { mainWindow?.webContents.send('feishu:status', status) } catch {} },
      (step: any) => { try { mainWindow?.webContents.send('podcast:step', step) } catch {} },
      (p: boolean, url?: string) => {
        try { mainWindow?.webContents.send('podcast:processing', p, url) } catch {}
        if (!p && pendingProcessDone) { pendingProcessDone(); pendingProcessDone = null }
      },
      () => { try { mainWindow?.webContents.send('task:state-changed') } catch {} },
    )
    await monitor.start()
    return monitor.getStatus()
  })

  ipcMain.handle('feishu:stop', () => {
    monitor?.stop()
    return { connected: monitor?.isConnected() ?? false, monitoring: false, chatId: '' }
  })

  ipcMain.handle('feishu:status', () => {
    return monitor?.getStatus() ?? { connected: false, monitoring: false, chatId: '' }
  })

  ipcMain.handle('podcast:process', async (_event, { url, force, taskId, isLocalFile }: { url: string; force?: boolean; taskId?: string; isLocalFile?: boolean }) => {
    if (!isLocalFile) {
      const episodeMatch = url.match(/xiaoyuzhoufm\.com\/episode\/([a-zA-Z0-9]+)/)
      const episodeId = episodeMatch ? episodeMatch[1] : null
      if (!force && episodeId && processedEpisodeIds.has(episodeId)) {
        mainWindow?.webContents.send('log', `⏭ 该播客已处理过 (${episodeId})，跳过`)
        return { success: false, error: '该播客已处理过' }
      }
    }
    const initialTitle = isLocalFile ? basename(url, extname(url)) : await fetchPodcastTitle(url).catch(() => null)
    const episodeId = isLocalFile ? null : (url.match(/xiaoyuzhoufm\.com\/episode\/([a-zA-Z0-9]+)/)?.[1] || null)
    updateRecentState(state => startRecentTask(state, { id: taskId, url, episodeId, title: initialTitle }))
    pendingAbort = new AbortController()
    const signal = pendingAbort.signal
    const config = loadConfig()
    try {
      const result = await processPodcast(
        url, config.api_key, config.language,
        config.obsidian_dir, config.audio_dir,
        (step: any) => { try { mainWindow?.webContents.send('podcast:step', step) } catch {} },
        (msg: string) => { try { mainWindow?.webContents.send('log', msg) } catch {} },
        signal,
        isLocalFile,
      )
      if (result) {
        if (episodeId) processedEpisodeIds.add(episodeId)
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
    } catch (err: any) {
      if (err?.name === 'AbortError' || signal.aborted) {
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
        sendNotification('播客笔记助手', `处理出错：${err.message || String(err)}`)
      }
      return { success: false, error: err.message || String(err) }
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

  ipcMain.handle('task:getRecoveryLogs', () => {
    return getRecoveryLogs()
  })

  ipcMain.handle('app:cleanTemp', () => {
    try {
      const cfg = loadConfig()
      const tempDir = cfg.audio_dir || join(app.getPath('userData'), '_podcast_temp')
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
    return true
  })

  ipcMain.handle('search:notes', (_e, keyword: string) => {
    const config = loadConfig()
    const obsidianDir = config.obsidian_dir?.trim()
    if (!obsidianDir || !fs.existsSync(obsidianDir)) return []

    const results: { path: string; name: string; excerpt: string; type: string }[] = []
    const query = keyword.trim().toLowerCase()
    if (!query) return []

    function walkDir(dir: string) {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const entry of entries) {
          const fullPath = join(dir, entry.name)
          if (entry.isDirectory()) {
            walkDir(fullPath)
          } else if (entry.name.endsWith('.md')) {
            const nameLower = entry.name.toLowerCase()
            let content = ''
            try { content = fs.readFileSync(fullPath, 'utf-8') } catch {}
            const contentLower = content.toLowerCase()

            if (nameLower.includes(query) || contentLower.includes(query)) {
              // 提取匹配处的上下文作为摘要
              let excerpt = ''
              const idx = contentLower.indexOf(query)
              if (idx >= 0) {
                const start = Math.max(0, idx - 40)
                const end = Math.min(content.length, idx + query.length + 80)
                excerpt = (start > 0 ? '...' : '') + content.slice(start, end).replace(/\n/g, ' ').trim() + (end < content.length ? '...' : '')
              } else {
                excerpt = content.slice(0, 120).replace(/\n/g, ' ').trim()
              }

              // 判断类型
              let type = '笔记'
              const relPath = fullPath.slice(obsidianDir.length)
              if (relPath.includes('人物')) type = '人物'
              else if (relPath.includes('项目')) type = '项目'
              else if (relPath.includes('概念')) type = '概念'
              else if (relPath.includes('术语')) type = '术语'

              results.push({
                path: fullPath,
                name: entry.name.replace(/\.md$/, ''),
                excerpt,
                type,
              })
            }
          }
        }
      } catch {}
    }

    walkDir(obsidianDir)
    return results.slice(0, 30) // 最多返回 30 条
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
      filters: [{ name: '可执行文件', extensions: ['exe', 'bat', 'cmd'] }],
    })
    return result.canceled ? null : result.filePaths[0] || null
  })

  ipcMain.handle('shell:openPath', async (_e, filePath: string) => {
    try {
      const { shell } = require('electron')
      await shell.openPath(filePath)
      return true
    } catch { return false }
  })

  ipcMain.handle('whisper:scanModels', () => {
    const config = loadConfig()
    return scanLocalModels(config.whisper_exe_path)
  })

  ipcMain.handle('whisper:checkHardware', (_e, modelId: string) => {
    return checkHardware(modelId)
  })

  // 获取AI供应商模型列表
  ipcMain.handle('ai:fetchModels', async (_e, { baseUrl, apiKey }: { baseUrl: string; apiKey: string }) => {
    try {
      if (!baseUrl || !apiKey) {
        return { success: false, error: '请先填写API地址和API Key', models: [] }
      }

      // 确保URL格式正确
      let url = baseUrl.replace(/\/+$/, '')
      if (!url.endsWith('/v1')) {
        url += '/v1'
      }
      url += '/models'

      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10秒超时
      })

      if (!resp.ok) {
        const errorText = await resp.text().catch(() => '')
        return { success: false, error: `HTTP ${resp.status}: ${errorText}`, models: [] }
      }

      const data = await resp.json() as any
      const models = (data.data || [])
        .map((m: any) => ({
          id: m.id,
          name: m.id,
        }))
        .sort((a: any, b: any) => a.id.localeCompare(b.id))

      return { success: true, models }
    } catch (err: any) {
      return { success: false, error: err.message || '获取模型列表失败', models: [] }
    }
  })

  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) { mainWindow.unmaximize() } else { mainWindow?.maximize() }
  })
  ipcMain.handle('window:close', () => mainWindow?.hide())
}

function createTray() {
  let icon: Electron.NativeImage | undefined
  try {
    const baseDirs = [
      (process as any).resourcesPath,
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
