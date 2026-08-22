/**
 * 自动更新 — electron-updater + GitHub Releases（增量：blockmap 差分）
 * 交互基调（用户确认）：版本号高亮提示，用户点击后才下载；设置可开自动下载
 *
 * 双通道检测（国内无 VPN 也可用）：
 * electron-updater 默认请求 api.github.com（国内直连常被重置/超时，且失败静默降级
 * 表现为「检查不到更新」）。这里先直连探测 GitHub API 可达性：
 * - 可达 → 走默认 GitHub 通道（增量更新体验不变）
 * - 不可达 → setFeedURL 切到镜像源（读同一份 latest.yml），检查与下载安装包都走镜像
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

/** 仓库坐标（与 package.json repository 一致；electron-builder 默认 publish 源） */
const GITHUB_OWNER = 'xuxuyouxiu'
const GITHUB_REPO = 'PodMuse'

/** 国内可达的 GitHub 加速镜像（按序尝试；与 whisper-downloader 的镜像清单保持一致风格） */
const FEED_MIRROR_PREFIXES = [
  'https://ghfast.top/',
  'https://gh-proxy.com/',
  'https://mirror.ghproxy.com/',
]

/** 直连 GitHub API 探测：快速失败（4s），2xx 即认为可达 */
async function isGithubReachable(timeoutMs = 4000): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    t.unref?.()
    const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`, {
      method: 'HEAD',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'PodMuse-Updater' },
    })
    clearTimeout(t)
    return res.status > 0 && res.status < 500
  } catch {
    return false
  }
}

function applyMirrorFeed(mirror: string): void {
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: `${mirror}https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download`,
  })
}

function applyDefaultFeed(): void {
  // 恢复 electron-builder 默认（GitHub provider）：不传 options 即按 app-update.yml 配置
  try {
    autoUpdater.setFeedURL({ provider: 'github', owner: GITHUB_OWNER, repo: GITHUB_REPO })
  } catch {}
}

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

  /**
   * 带通道选择的检查：
   * 1. 探测 api.github.com 可达性（4s 快速失败）
   * 2. 可达 → 默认 GitHub 通道
   * 3. 不可达 → 依次尝试镜像前缀，选第一个能取到 latest.yml 的作为 feed
   *    （latest.yml 位于 releases/download/v{version}/ 子目录，探测时用当前版本拼路径；
   *     electron-updater 的 generic provider 会以 feed url 为基底解析 latest.yml 内的相对路径）
   * 4. 全部不可用 → 维持 idle（后台场景静默）；错误事件照常上报
   */
  const checkWithChannel = async (): Promise<void> => {
    const direct = await isGithubReachable()
    if (!direct) {
      const currentVersion = autoUpdater.currentVersion.version
      let mirrorReady = false
      for (const prefix of FEED_MIRROR_PREFIXES) {
        try {
          const ctrl = new AbortController()
          const t = setTimeout(() => ctrl.abort(), 4000)
          t.unref?.()
          const probe = await fetch(
            `${prefix}https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${currentVersion}/latest.yml`,
            { signal: ctrl.signal },
          )
          clearTimeout(t)
          if (probe.ok) {
            applyMirrorFeed(prefix)
            mirrorReady = true
            break
          }
        } catch {}
      }
      if (!mirrorReady) {
        console.warn('[updater] GitHub 直连与镜像均不可达，跳过本次检查')
        setState({ phase: 'idle' })
        return
      }
    } else {
      applyDefaultFeed()
    }
    await autoUpdater.checkForUpdates()
  }

  const check = () => {
    if (!loadConfig().auto_update_check) return
    checkWithChannel().catch(() => {})
  }

  // 启动 10s 后首次检查；此后每 6 小时
  const first = setTimeout(check, 10_000)
  first.unref?.()
  const timer = setInterval(check, CHECK_INTERVAL_HOURS * 3600_000)
  timer.unref?.()

  return {
    manualCheck: () => {
      void checkWithChannel().catch(() => {})
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
