/**
 * 剪贴板链接检测 — 复制链接一键入队（浏览器剪藏）
 * 1s 轮询剪贴板；命中平台注册表/RSS 链接时弹右下角浮窗；
 * 支持 podmuse:// 协议唤起（URL 链接直接入队）
 */

import { app, clipboard, BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { loadConfig } from './config'
import { platformRegistry } from './platforms'
import { processedEpisodeIds } from './dedup-store'
import { fetchPodcastTitle } from './podcast'

const POLL_INTERVAL_MS = 1000
const DEDUP_WINDOW_MS = 10_000
const TOAST_WIDTH = 340
const TOAST_HEIGHT = 108

interface ClipItem {
  url: string
  kind: 'episode' | 'rss' | 'processed'
  title?: string
}

/** 10s 内去重 + 已处理去重 */
const recentClip = new Map<string, number>()

function isRssLike(url: string): boolean {
  return /\.(xml|rss)$/i.test(url) || /\/feed/i.test(url) || /feeds?\./i.test(url)
}

function isSupported(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false
  if (platformRegistry.findAdapter(url)) return true
  return isRssLike(url)
}

function detect(url: string): ClipItem | null {
  if (!isSupported(url)) return null
  const now = Date.now()
  const last = recentClip.get(url)
  if (last && now - last < DEDUP_WINDOW_MS) return null
  recentClip.set(url, now)
  // 已处理过的单集不再入队
  if (platformRegistry.findAdapter(url)) {
    const episodeId = platformRegistry.findAdapter(url)?.adapter.getDedupKey(url)
    if (episodeId && processedEpisodeIds.has(episodeId)) {
      return { url, kind: 'processed' }
    }
  }
  return { url, kind: isRssLike(url) ? 'rss' : 'episode' }
}

async function fetchTitle(url: string): Promise<string | undefined> {
  try {
    const title = await fetchPodcastTitle(url)
    return title || undefined
  } catch {
    return undefined
  }
}

let toastWindow: BrowserWindow | null = null

function showToast(item: ClipItem): void {
  try {
    if (toastWindow && !toastWindow.isDestroyed()) {
      toastWindow.close()
    }
  } catch {}

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { x, y, width, height } = display.workArea
  const posX = Math.round(x + width - TOAST_WIDTH - 24)
  const posY = Math.round(y + height - TOAST_HEIGHT - 24)

  toastWindow = new BrowserWindow({
    width: TOAST_WIDTH,
    height: TOAST_HEIGHT,
    x: posX,
    y: posY,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    focusable: false,
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const lang = loadConfig().language === 'en' ? 'en' : 'zh'
  toastWindow
    .loadFile(join(__dirname, '..', '..', 'dist', 'clip-toast.html'), {
      query: {
        url: item.url,
        kind: item.kind,
        title: item.title || '',
        lang,
      },
    })
    .then(() => {
      toastWindow?.showInactive()
      // 10s 无操作自动关闭
      setTimeout(() => {
        if (toastWindow && !toastWindow.isDestroyed()) toastWindow.close()
      }, 10_000)
    })
    .catch(e => console.warn('[clipwatch] toast load failed:', e))

  toastWindow.on('closed', () => {
    toastWindow = null
  })
}

/** 浮窗页面请求关闭（忽略/知道了按钮；transparent 窗口 window.close() 不可靠） */
export function closeToastWindow(): void {
  try {
    if (toastWindow && !toastWindow.isDestroyed()) toastWindow.close()
  } catch {}
}

let timer: ReturnType<typeof setInterval> | null = null
let lastClip = ''

export function startClipboardWatcher(): void {
  if (timer) return
  lastClip = clipboard.readText()
  timer = setInterval(() => {
    // 开关即时生效（每次 tick 读配置）
    if (loadConfig().clipboard_watch_enabled === false) return
    let text = ''
    try {
      text = clipboard.readText()
    } catch {
      return
    }
    if (!text || text === lastClip) return
    lastClip = text
    processUrl(text)
  }, POLL_INTERVAL_MS)
}

export function stopClipboardWatcher(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/** 统一入口：识别链接并弹浮窗（剪贴板 / podmuse:// 协议 / 浏览器扩展共用） */
export function processUrl(rawUrl: string): void {
  const url = rawUrl.trim()
  const item = detect(url)
  if (!item) return
  void fetchTitle(url).then(title => {
    if (title) item.title = title
    showToast(item)
  })
}

export function handleProtocolUrl(rawUrl: string): void {
  try {
    const u = new URL(rawUrl)
    const url = u.searchParams.get('url')
    if (!url) return
    processUrl(url)
  } catch (e) {
    console.warn('[clipwatch] protocol parse failed:', e)
  }
}

/** 是否可注册/处理 podmuse:// 协议（Windows） */
export function registerProtocol(): void {
  try {
    if (process.platform === 'win32') {
      app.setAsDefaultProtocolClient('podmuse')
    }
  } catch (e) {
    console.warn('[clipwatch] protocol register failed:', e)
  }
}
