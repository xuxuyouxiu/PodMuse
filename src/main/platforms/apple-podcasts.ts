/** Apple Podcasts 适配器 — 通过 iTunes Lookup API + RSS Feed 获取音频 */

import type { PlatformAdapter, AudioExtractResult } from './types'
import { fetchOgTitle } from './xiaoyuzhou'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const RSS_TIMEOUT_MS = 15_000

interface RssItem {
  title: string
  enclosureUrl: string
  enclosureType?: string
  guid?: string
  pubDate?: string
  author?: string
}

interface PodcastInfo {
  title: string
  author?: string
  items: RssItem[]
}

export class ApplePodcastsAdapter implements PlatformAdapter {
  id = 'apple-podcasts'
  name = 'Apple Podcasts'
  urlPattern = /^https?:\/\/podcasts\.apple\.com\/[a-z]{2}\/podcast\//i

  match(url: string): boolean {
    return this.urlPattern.test(url)
  }

  async extractAudio(url: string, signal?: AbortSignal): Promise<AudioExtractResult> {
    const { podcastId, episodeId } = this.parseUrl(url)
    if (!podcastId) throw new Error('无法识别 Apple Podcasts 链接')

    // 1) 通过 iTunes Lookup API 获取 RSS Feed URL
    const rssUrl = await this.fetchRssUrl(podcastId, signal)
    if (!rssUrl) throw new Error('无法获取该播客的 RSS 源，请尝试直接粘贴音频链接')

    // 2) 并行获取 RSS 和页面标题（用于匹配单集）
    const [rssData, pageTitle] = await Promise.all([
      this.fetchAndParseRss(rssUrl, signal),
      this.fetchEpisodeTitle(url, episodeId, signal),
    ])

    // 3) 匹配单集
    const episode = this.matchEpisode(rssData.items, episodeId, pageTitle)
    if (!episode) {
      throw new Error('RSS 中未找到该单集，播客可能已下架该期内容')
    }

    return {
      type: 'direct_url',
      audioUrl: episode.enclosureUrl,
      title: episode.title || pageTitle || undefined,
      videoId: episodeId || podcastId,
      metadata: {
        platform: 'apple-podcasts',
        ...(rssData.author ? { owner: rssData.author } : {}),
        ...(rssData.title ? { album: rssData.title } : {}),
        ...(episode.author ? { episodeAuthor: episode.author } : {}),
        ...(episode.pubDate ? { pubDate: episode.pubDate } : {}),
      },
    }
  }

  getDedupKey(url: string): string | null {
    const { episodeId, podcastId } = this.parseUrl(url)
    return episodeId || podcastId
  }

  private parseUrl(url: string): { podcastId: string | null; episodeId: string | null } {
    // https://podcasts.apple.com/us/podcast/some-name/id1234567890?i=9876543210
    const podcastMatch = url.match(/id(\d+)/i)
    const episodeMatch = url.match(/[?&]i=(\d+)/)
    return {
      podcastId: podcastMatch ? podcastMatch[1] : null,
      episodeId: episodeMatch ? episodeMatch[1] : null,
    }
  }

  /** 通过 iTunes Lookup API 获取 RSS Feed URL */
  private async fetchRssUrl(podcastId: string, signal?: AbortSignal): Promise<string | null> {
    try {
      const apiUrl = `https://itunes.apple.com/lookup?id=${podcastId}&entity=podcast`
      const resp = await fetch(apiUrl, {
        headers: { 'User-Agent': UA },
        signal,
      })
      if (!resp.ok) return null
      const json = await resp.json() as { results?: Array<{ feedUrl?: string }> }
      return json.results?.[0]?.feedUrl || null
    } catch {
      return null
    }
  }

  /** 从 Apple Podcasts 页面获取单集标题（用于 RSS 匹配） */
  private async fetchEpisodeTitle(url: string, episodeId: string | null, signal?: AbortSignal): Promise<string | null> {
    try {
      const title = await fetchOgTitle(url, signal)
      return title || null
    } catch {
      return null
    }
  }

  /** 获取并解析 RSS Feed（带超时） */
  private async fetchAndParseRss(rssUrl: string, signal?: AbortSignal): Promise<PodcastInfo> {
    const timeoutSignal = AbortSignal.timeout(RSS_TIMEOUT_MS)
    const combinedSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal

    try {
      const resp = await fetch(rssUrl, {
        headers: { 'User-Agent': UA },
        signal: combinedSignal,
      })
      if (!resp.ok) throw new Error(`RSS 请求失败: HTTP ${resp.status}`)
      const xml = await resp.text()
      return this.parseRssXml(xml)
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'TimeoutError') {
        throw new Error('RSS 解析超时，请检查网络或稍后重试')
      }
      throw e
    }
  }

  /** 轻量级 RSS XML 解析（无需第三方依赖） */
  private parseRssXml(xml: string): PodcastInfo {
    // 提取 channel 级信息
    const channelMatch = xml.match(/<channel[^>]*>([\s\S]*?)<\/channel>/i)
    if (!channelMatch) throw new Error('RSS 格式无效')

    const channelContent = channelMatch[1]

    // channel 级标题和作者
    const channelTitle = this.extractTag(channelContent, 'title')
    const channelAuthor = this.extractTag(channelContent, 'itunes:author') ||
                          this.extractTag(channelContent, 'author')

    // 提取所有 <item> 块
    const items: RssItem[] = []
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi
    let match: RegExpExecArray | null
    while ((match = itemRegex.exec(xml)) !== null) {
      const content = match[1]
      const title = this.extractTag(content, 'title') || ''
      const guid = this.extractTag(content, 'guid') || ''
      const pubDate = this.extractTag(content, 'pubDate') || ''
      const author = this.extractTag(content, 'itunes:author') || ''

      // 提取 enclosure URL
      const enclosureMatch = content.match(/<enclosure[^>]+url=["']([^"']+)["']/i)
      const enclosureUrl = enclosureMatch ? this.decodeXmlEntities(enclosureMatch[1]) : ''
      const enclosureType = content.match(/<enclosure[^>]+type=["']([^"']+)["']/i)?.[1]

      if (title && enclosureUrl) {
        items.push({ title, enclosureUrl, enclosureType, guid, pubDate, author })
      }
    }

    return {
      title: channelTitle || '',
      author: channelAuthor || undefined,
      items,
    }
  }

  /** 从 XML 片段中提取标签内容（处理 CDATA） */
  private extractTag(xml: string, tag: string): string | null {
    const escapedTag = tag.replace(':', '\\:')
    const re = new RegExp(`<${escapedTag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${escapedTag}>`, 'i')
    const match = xml.match(re)
    if (!match) return null
    return this.decodeXmlEntities(match[1].trim())
  }

  /** 解码基本 XML 实体 */
  private decodeXmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
  }

  /** 匹配单集：优先精确匹配 episodeId/title，降级到标题模糊匹配，最后取最新 */
  private matchEpisode(items: RssItem[], episodeId: string | null, pageTitle: string | null): RssItem | null {
    if (!items.length) return null

    // 策略 1：按标题精确匹配（og:title 和 RSS title）
    if (pageTitle) {
      const normalized = this.normalizeTitle(pageTitle)
      const exact = items.find(item => this.normalizeTitle(item.title) === normalized)
      if (exact) return exact

      // 策略 2：标题包含匹配（处理副标题差异）
      const partial = items.find(item =>
        this.normalizeTitle(item.title).includes(normalized) ||
        normalized.includes(this.normalizeTitle(item.title))
      )
      if (partial) return partial
    }

    // 策略 3：如果只有一个 item，直接使用
    if (items.length === 1) return items[0]

    // 策略 4：取最新一期（RSS 通常按时间倒序）
    return items[0]
  }

  /** 标题标准化：去除标点、空格、大小写统一 */
  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[\s\-—–:：·|｜|（）()\[\]【】「」""''""''""\u00a0]+/g, '')
      .replace(/[^\p{L}\p{N}]/gu, '')
      .trim()
  }
}
