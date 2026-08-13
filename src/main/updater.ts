/**
 * 自动更新 — electron-updater + GitHub Releases（增量：blockmap 差分）
 * 交互基调（用户确认）：版本号高亮提示，用户点击后才下载；设置可开自动下载
 */

import fs from 'node:fs'
import path from 'node:path'
import { autoUpdater } from 'electron-updater'
import { loadConfig } from './config'

export type UpdaterPhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdaterState {
  phase: UpdaterPhase
  version?: string
  percent?: number
  error?: string
}

const CHECK_INTERVAL_HOURS = 6

function isDev(): boolean {
  return !!process.env.VITE_DEV_SERVER_URL
}

function isPortable(): boolean {
  try {
    const exeDir = path.dirname(process.execPath)
    return fs.existsSync(path.join(exeDir, 'portable'))
  } catch {
    return false
  }
}

export interface UpdaterHandle {
  manualCheck: () => void
  download: () => void
  install: () => void
}

/**
 * 初始化自动更新。返回 null 表示本环境不支持（开发模式/便携版）。
 */
export function setupUpdater(opts: {
  send: (state: UpdaterState) => void
  /** quitAndInstall 前调用，用于置 isQuitting=true（否则窗口关闭被托盘逻辑拦截） */
  beforeQuitAndInstall: () => void
}): UpdaterHandle | null {
  if (isDev() || isPortable()) return null

  let state: UpdaterState = { phase: 'idle' }
  const setState = (next: UpdaterState) => {
    state = next
    try {
      opts.send(next)
    } catch {}
  }

  // 默认不自动下载：发现新版本只提示，用户点击后才下载（设置可改）
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => setState({ phase: 'checking' }))

  autoUpdater.on('update-available', info => {
    setState({ phase: 'available', version: info.version })
    // 设置开启「发现更新后自动下载」时直接开始下载
    if (loadConfig().auto_update_download) {
      autoUpdater.downloadUpdate().catch(() => {})
    }
  })

  autoUpdater.on('update-not-available', () => setState({ phase: 'idle' }))

  autoUpdater.on('download-progress', p => {
    setState({ phase: 'downloading', version: state.version, percent: Math.round(p.percent) })
  })

  autoUpdater.on('update-downloaded', info => {
    setState({ phase: 'downloaded', version: info.version, percent: 100 })
  })

  autoUpdater.on('error', err => {
    const msg = err && err.message ? err.message : String(err)
    console.warn('[updater]', msg)
    // 静默降级：后台检查失败不打扰；用户交互中的失败才展示错误
    if (state.phase === 'checking' || state.phase === 'idle') {
      setState({ phase: 'idle' })
    } else {
      setState({ phase: 'error', version: state.version, error: msg })
    }
  })

  const check = () => {
    if (!loadConfig().auto_update_check) return
    autoUpdater.checkForUpdates().catch(() => {})
  }

  // 启动 10s 后首次检查；此后每 6 小时
  const first = setTimeout(check, 10_000)
  first.unref?.()
  const timer = setInterval(check, CHECK_INTERVAL_HOURS * 3600_000)
  timer.unref?.()

  return {
    manualCheck: () => {
      autoUpdater.checkForUpdates().catch(() => {})
    },
    download: () => {
      autoUpdater.downloadUpdate().catch(() => {})
    },
    install: () => {
      opts.beforeQuitAndInstall()
      setImmediate(() => autoUpdater.quitAndInstall(true, true))
    },
  }
}
