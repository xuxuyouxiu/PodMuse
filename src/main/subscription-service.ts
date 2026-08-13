/**
 * 订阅服务 — RSS 解析 + 定时检查 + 新节目自动入队
 */

import fs from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import Parser from 'rss-parser'
import { loadConfig, saveConfig } from './config'
import type { Subscription } from '../shared/types'
import type { BatchQueueService } from './batch-queue'

interface Episode {
  key: string
  title: string
  link: string
  pubDate?: string
}

interface SubscriptionState {
  seen: string[]
  lastCheckAt: Record<string, number>
}

export interface SubscriptionInfo {
  sub: Subscription
  lastCheckAt: number | null
  newEpisodes: Episode[]
  lastError?: string
}

const MAX_SEEN = 500

export class SubscriptionService {
  private subs: Subscription[] = []
  private seen: Set<string> = new Set()
  private lastCheckAt: Record<string, number> = {}
  private timer: ReturnType<typeof setInterval> | null = null
  private checking = false
  private parser = new Parser({ timeout: 15000 })

  constructor(
    private getWindow: () => BrowserWindow | null | undefined,
    private getBatchQueue: () => BatchQueueService | null,
  ) {
    this.load()
  }

  private statePath(): string {
    return path.join(app.getPath('userData'), 'subscription_state.json')
  }

  private load(): void {
    const config = loadConfig()
    this.subs = (config.subscriptions || []).map(s => ({ ...s }))
    try {
      const raw = fs.readFileSync(this.statePath(), 'utf-8')
      const state = JSON.parse(raw) as SubscriptionState
      this.seen = new Set(state.seen || [])
      this.lastCheckAt = state.lastCheckAt || {}
    } catch {
      /* 首次运行 */
    }
  }

  private persistState(): void {
    try {
      const state: SubscriptionState = {
        seen: [...this.seen].slice(-MAX_SEEN),
        lastCheckAt: this.lastCheckAt,
      }
      fs.writeFileSync(this.statePath(), JSON.stringify(state, null, 2), 'utf-8')
    } catch (e) {
      console.warn('[subscription] persistState failed:', e)
    }
  }

  private persistSubs(): void {
    const config = loadConfig()
    config.subscriptions = this.subs
    saveConfig(config)
  }

  // ---- 订阅 CRUD ----

  list(): Subscription[] {
    return [...this.subs]
  }

  async add(name: string, url: string): Promise<{ success: boolean; error?: string }> {
    const cleanName = name.trim()
    const rawUrl = url.trim()
    if (!cleanName || !rawUrl) return { success: false, error: '名称和 RSS 地址不能为空' }
    if (!/^https?:\/\//i.test(rawUrl)) return { success: false, error: 'RSS 地址需以 http(s):// 开头' }
    if (this.subs.length >= 50) return { success: false, error: '订阅数量已达上限（50）' }
    if (this.subs.some(s => s.url === rawUrl)) {
      return { success: false, error: '该 RSS 地址已订阅' }
    }

    // YouTube feeds 源：配置了 Invidious 镜像时自动转换（国内直连 YouTube 超时）
    const cleanUrl = this.withYouTubeMirror(rawUrl)

    // 校验 RSS 有效性
    try {
      const feed = await this.parser.parseURL(cleanUrl)
      if (!feed.items || feed.items.length === 0) {
        return { success: false, error: 'RSS 解析成功但没有条目，可能不是有效的播客源' }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/timed out|timeout/i.test(msg)) {
        if (/youtube\.com\/feeds|channel_id=/i.test(cleanUrl)) {
          return {
            success: false,
            error:
              'YouTube 订阅源连接超时：直连 YouTube 需要代理网络。开启代理后重试，或在订阅设置中配置 Invidious 镜像实例',
          }
        }
        return { success: false, error: '订阅源连接超时，请检查网络后重试' }
      }
      return { success: false, error: `RSS 解析失败：${msg.slice(0, 120)}` }
    }
    const sub: Subscription = {
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: cleanName,
      url: cleanUrl,
      autoProcess: true,
      enabled: true,
      createdAt: Date.now(),
      processedCount: 0,
    }
    this.subs.push(sub)
    this.persistSubs()
    this.notify()
    // 立即检查一次
    this.checkOne(sub).catch(() => {})
    return { success: true }
  }

  /** YouTube feeds 源按配置转换为 Invidious 镜像 feed（未配置则原样返回） */
  private withYouTubeMirror(url: string): string {
    const m = url.match(/youtube\.com\/feeds\/videos\.xml\?channel_id=(UC[\w-]+)/i)
    if (!m) return url
    const config = loadConfig()
    const mirror = (config.youtube_mirror_base || '').trim().replace(/\/+$/, '')
    if (!mirror) return url
    return `${mirror}/feed/channel/${m[1]}`
  }

  remove(id: string): void {
    this.subs = this.subs.filter(s => s.id !== id)
    delete this.lastCheckAt[id]
    this.persistSubs()
    this.persistState()
    this.notify()
  }

  update(id: string, patch: Partial<Pick<Subscription, 'name' | 'autoProcess' | 'enabled'>>): void {
    this.subs = this.subs.map(s => (s.id === id ? { ...s, ...patch } : s))
    this.persistSubs()
    this.notify()
  }

  // ---- 检查 ----

  private async fetchEpisodes(sub: Subscription): Promise<Episode[]> {
    const feed = await this.parser.parseURL(sub.url)
    return (feed.items || [])
      .map(item => ({
        key: item.guid || item.link || '',
        title: item.title || '未命名节目',
        link: item.link || '',
        pubDate: item.pubDate || item.isoDate,
      }))
      .filter(ep => ep.key && ep.link)
  }

  private async checkOne(sub: Subscription): Promise<Episode[]> {
    const episodes = await this.fetchEpisodes(sub)
    const fresh = episodes.filter(ep => !this.seen.has(ep.key))
    this.lastCheckAt[sub.id] = Date.now()
    // 手动源的新节目缓存在待处理列表（自动源直接入队并标记）
    if (!sub.autoProcess && fresh.length > 0) {
      this.pendingCache.set(sub.id, fresh)
    } else {
      this.pendingCache.set(sub.id, [])
    }
    this.persistState()
    return fresh
  }

  async checkNow(id?: string): Promise<SubscriptionInfo[]> {
    if (this.checking) return this.info()
    this.checking = true
    try {
      const targets = id ? this.subs.filter(s => s.id === id) : this.subs.filter(s => s.enabled)
      for (const sub of targets) {
        try {
          const fresh = await this.checkOne(sub)
          if (fresh.length > 0) {
            console.log(`[subscription] 《${sub.name}》发现 ${fresh.length} 个新节目`)
            if (sub.autoProcess) {
              const queue = this.getBatchQueue()
              if (queue) {
                queue.addTasks(
                  fresh.map(ep => ({ source: ep.link, type: 'url' as const })),
                )
              }
              for (const ep of fresh) this.seen.add(ep.key)
              this.subs = this.subs.map(s =>
                s.id === sub.id ? { ...s, processedCount: s.processedCount + fresh.length } : s,
              )
              this.pendingCache.set(sub.id, [])
              this.persistSubs()
            }
          }
        } catch (e) {
          console.warn(`[subscription] 检查《${sub.name}》失败:`, (e as Error).message)
          this.lastCheckAt[sub.id] = Date.now()
        }
      }
      this.persistState()
      this.notify()
      return this.info()
    } finally {
      this.checking = false
    }
  }

  /** 手动源的新节目加入队列后标记已见 */
  markSeen(subId: string, episodeKeys: string[]): void {
    for (const k of episodeKeys) this.seen.add(k)
    this.pendingCache.set(subId, [])
    const sub = this.subs.find(s => s.id === subId)
    if (sub) {
      this.subs = this.subs.map(s =>
        s.id === subId ? { ...s, processedCount: s.processedCount + episodeKeys.length } : s,
      )
      this.persistSubs()
    }
    this.persistState()
    this.notify()
  }

  info(): SubscriptionInfo[] {
    return this.subs.map(sub => {
      // 手动源待处理 = 最新 RSS 条目中未 seen 的（缓存于内存）
      const pending = this.pendingCache.get(sub.id) || []
      return {
        sub,
        lastCheckAt: this.lastCheckAt[sub.id] ?? null,
        newEpisodes: pending,
        lastError: undefined,
      }
    })
  }

  private pendingCache = new Map<string, Episode[]>()

  // ---- 调度 ----

  startScheduler(): void {
    // 启动 10s 后首次检查
    const first = setTimeout(() => {
      this.checkNow().catch(() => {})
    }, 10_000)
    first.unref?.()

    const config = loadConfig()
    const hours = Math.max(1, Math.min(24, config.subscription_check_interval_hours || 6))
    this.timer = setInterval(() => {
      this.checkNow().catch(() => {})
    }, hours * 3600_000)
  }

  stopScheduler(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private notify(): void {
    try {
      this.getWindow()?.webContents.send('subscription:update', this.info())
    } catch {}
  }
}

let instance: SubscriptionService | null = null

export function createSubscriptionService(
  getWindow: () => BrowserWindow | null | undefined,
  getBatchQueue: () => BatchQueueService | null,
): SubscriptionService {
  instance = new SubscriptionService(getWindow, getBatchQueue)
  instance.startScheduler()
  return instance
}

export function getSubscriptionService(): SubscriptionService | null {
  return instance
}
