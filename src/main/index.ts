import { app, BrowserWindow, ipcMain, Menu, dialog } from 'electron'
import { join } from 'path'
import { loadConfig, loadState, saveConfig, saveState } from './config'
import { FeishuMonitor } from './feishu'
import { processPodcast } from './podcast'
import { fetchPodcastTitle } from './podcast'
import { migrateExistingNotes } from './obsidian-categories'
import { scanLocalModels, checkHardware } from './whisper-model-manager'
import * as fs from 'fs'
import { completeRecentTask, failRecentTask, getRecentTasks, removeRecentTask, startRecentTask, stopRecentTask } from './recent-task-state'

let mainWindow: BrowserWindow | null = null
let monitor: FeishuMonitor | null = null
const processedEpisodeIds = new Set<string>(loadState().processedUrls || [])
let pendingAbort: AbortController | null = null
let pendingProcessDone: (() => void) | null = null

function updateRecentState(updater: (state: ReturnType<typeof loadState>) => ReturnType<typeof loadState>) {
  const current = loadState()
  saveState(updater(current))
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

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 680,
    title: '播客笔记助手',
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

  ipcMain.handle('podcast:process', async (_event, { url, force, taskId }: { url: string; force?: boolean; taskId?: string }) => {
    const episodeMatch = url.match(/xiaoyuzhoufm\.com\/episode\/([a-zA-Z0-9]+)/)
    const episodeId = episodeMatch ? episodeMatch[1] : null
    if (!force && episodeId && processedEpisodeIds.has(episodeId)) {
      mainWindow?.webContents.send('log', `⏭ 该播客已处理过 (${episodeId})，跳过`)
      return { success: false, error: '该播客已处理过' }
    }
    const initialTitle = await fetchPodcastTitle(url).catch(() => null)
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
      )
      if (result) {
        if (episodeId) processedEpisodeIds.add(episodeId)
        updateRecentState(state => completeRecentTask(state, { taskId, url, episodeId, filename: result }))
      } else {
        updateRecentState(state => failRecentTask(state))
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
      return { success: false, error: err.message || String(err) }
    } finally {
      if (pendingAbort?.signal === signal) pendingAbort = null
      if (pendingProcessDone) { pendingProcessDone(); pendingProcessDone = null }
    }
  })

  ipcMain.handle('podcast:cancel', async () => {
    let cancelled = false
    if (pendingAbort) {
      pendingAbort.abort()
      cancelled = true
    }
    if (monitor?.cancelProcessing()) {
      cancelled = true
    }
    if (cancelled) {
      await new Promise<void>(resolve => { pendingProcessDone = resolve })
    }
    return cancelled
  })

  ipcMain.handle('app:cleanTemp', () => {
    try {
      const cfg = loadConfig()
      const tempDir = cfg.audio_dir || join(app.getPath('userData'), '_podcast_temp')
      if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {}
    return true
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

  ipcMain.handle('obsidian:migrateNotes', async () => {
    const config = loadConfig()
    return migrateExistingNotes(config.obsidian_dir, config.category_config_path)
  })

  ipcMain.handle('whisper:scanModels', () => {
    return scanLocalModels()
  })

  ipcMain.handle('whisper:checkHardware', (_e, modelId: string) => {
    return checkHardware(modelId)
  })

  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) { mainWindow.unmaximize() } else { mainWindow?.maximize() }
  })
  ipcMain.handle('window:close', () => mainWindow?.close())
}

app.whenReady().then(() => {
  createWindow()
  setupIPC()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  monitor?.stop()
  if (process.platform !== 'darwin') app.quit()
})
