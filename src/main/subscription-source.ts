/**
 * 订阅源发现 — 搜索播客 / 链接解析为 RSS / OPML 解析 / 内置推荐
 * 目标：用户不需要理解 RSS，输名字可搜、贴链接可解析
 */

import fs from 'node:fs'
import { loadConfig } from './config'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const TIMEOUT_MS = 12_000
const SEARCH_CACHE_TTL_MS = 5 * 60_000

export interface PodcastSearchResult {
  feedUrl: string
  title: string
  author: string
  artwork: string
  description?: string
}

export interface ResolvedFeed {
  feedUrl: string
  title?: string
  author?: string
  artwork?: string
  /** 普通网页发现多个 feed 时返回候选列表，由用户选择 */
  candidates?: { title: string; url: string }[]
}

export interface OpmlEntry {
  name: string
  url: string
}

export interface RecommendedPodcast {
  name: string
  author: string
  feedUrl: string
  artwork: string
  description: string
  platform: 'xiaoyuzhou' | 'apple' | 'youtube'
}

const searchCache = new Map<string, { at: number; results: PodcastSearchResult[] }>()

function getRsshubBase(): string {
  const base = loadConfig().rsshub_base_url || 'https://rsshub.app'
  return base.replace(/\/+$/, '')
}

async function fetchWithTimeout(url: string, timeoutMs = TIMEOUT_MS): Promise<string> {
  const resp = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!resp.ok) throw new Error(`请求失败: HTTP ${resp.status}`)
  return resp.text()
}

/** 解码 XML 实体 */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
}

// ---- 搜索（iTunes Search API，免费无 key） ----

export async function searchPodcasts(term: string): Promise<PodcastSearchResult[]> {
  const clean = term.trim()
  if (!clean) return []
  const cached = searchCache.get(clean)
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) return cached.results

  const url =
    'https://itunes.apple.com/search?term=' +
    encodeURIComponent(clean) +
    '&media=podcast&entity=podcast&limit=20'
  const resp = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!resp.ok) throw new Error(`搜索失败: HTTP ${resp.status}`)
  const json = (await resp.json()) as {
    results?: Array<{
      feedUrl?: string
      collectionName?: string
      artistName?: string
      artworkUrl600?: string
      artworkUrl100?: string
      description?: string
    }>
  }
  const results = (json.results || [])
    .filter(r => r.feedUrl)
    .map(r => ({
      feedUrl: r.feedUrl as string,
      title: r.collectionName || '',
      author: r.artistName || '',
      artwork: r.artworkUrl600 || r.artworkUrl100 || '',
      description: r.description,
    }))
  searchCache.set(clean, { at: Date.now(), results })
  return results
}

// ---- 链接解析 ----

function resolveApplePodcasts(url: string): Promise<ResolvedFeed> {
  const m = url.match(/podcasts\.apple\.com\/[a-z]{2}\/podcast\/[^/]+\/id(\d+)/i)
  if (!m) return Promise.reject(new Error('无法从该 Apple Podcasts 链接识别播客 ID'))
  const podcastId = m[1]
  const lookupUrl = `https://itunes.apple.com/lookup?id=${podcastId}&entity=podcast`
  return fetch(lookupUrl, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`Lookup 失败: HTTP ${r.status}`))))
    .then((json: { results?: Array<{ feedUrl?: string; collectionName?: string; artistName?: string; artworkUrl600?: string }> }) => {
      const item = json.results?.[0]
      if (!item?.feedUrl) throw new Error('未能获取该播客的 RSS 源')
      return {
        feedUrl: item.feedUrl,
        title: item.collectionName,
        author: item.artistName,
        artwork: item.artworkUrl600,
      }
    })
}

async function resolveXiaoyuzhou(url: string): Promise<ResolvedFeed> {
  let pid = url.match(/xiaoyuzhoufm\.com\/podcast\/([\w-]+)/i)?.[1]
  if (!pid) {
    // 单集链接：抓页面找播客 pid
    const html = await fetchWithTimeout(url)
    pid = html.match(/"podcast"[\s\S]{0,200}?"pid"\s*:\s*"([\w-]+)"/i)?.[1]
      || html.match(/\/podcast\/([\w-]+)"/i)?.[1]
      || html.match(/"pid"\s*:\s*"([\w-]+)"/i)?.[1]
  }
  if (!pid) throw new Error('未能从小宇宙页面识别播客')
  return { feedUrl: `${getRsshubBase()}/xiaoyuzhou/podcast/${pid}` }
}

async function resolveYouTube(url: string): Promise<ResolvedFeed> {
  const direct = url.match(/youtube\.com\/channel\/(UC[\w-]+)/i)
  if (direct) {
    return { feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${direct[1]}` }
  }
  // @handle / /c/name / /user/name：抓页面提取 channel_id
  const html = await fetchWithTimeout(url)
  const id =
    html.match(/"channelId"\s*:\s*"(UC[\w-]+)"/i)?.[1] ||
    html.match(/channel_id=?(UC[\w-]+)/i)?.[1]
  if (!id) throw new Error('未能从 YouTube 页面识别频道 ID')
  return { feedUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${id}` }
}

async function resolveXimalaya(url: string): Promise<ResolvedFeed> {
  const m = url.match(/ximalaya\.com\/album\/(\d+)/i)
  if (!m) throw new Error('未能从喜马拉雅链接识别专辑 ID')
  return { feedUrl: `http://www.ximalaya.com/album/${m[1]}.xml` }
}

async function resolveGenericPage(url: string): Promise<ResolvedFeed> {
  const html = await fetchWithTimeout(url)
  // <link rel="alternate" type="application/rss+xml" href="...">（属性顺序可能不同）
  const linkRe =
    /<link[^>]*(?:rel=["']alternate["'][^>]*type=["']application\/(?:rss|atom)\+xml["']|type=["']application\/(?:rss|atom)\+xml["'][^>]*rel=["']alternate["'])[^>]*>/gi
  const found: { title: string; url: string }[] = []
  for (const tag of html.match(linkRe) || []) {
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1]
    const title = tag.match(/title=["']([^"']*)["']/i)?.[1] || ''
    if (!href) continue
    const abs = new URL(decodeXmlEntities(href), url).toString()
    if (!found.some(f => f.url === abs)) found.push({ title, url: abs })
  }
  if (found.length === 0) {
    throw new Error('页面中未发现 RSS 源，可在页面上找 RSS/订阅 入口后手动粘贴地址')
  }
  if (found.length === 1) return { feedUrl: found[0].url }
  return { feedUrl: found[0].url, candidates: found }
}

/**
 * 输入 URL → 解析出 feed。非 URL 输入返回 null（调用方应走搜索）。
 */
export async function resolveFeed(input: string): Promise<ResolvedFeed | null> {
  const clean = input.trim()
  if (!/^https?:\/\//i.test(clean)) return null
  if (/podcasts\.apple\.com/i.test(clean)) return resolveApplePodcasts(clean)
  if (/xiaoyuzhoufm\.com/i.test(clean)) return resolveXiaoyuzhou(clean)
  if (/youtube\.com\/(channel|@|c\/|user\/)/i.test(clean)) return resolveYouTube(clean)
  if (/ximalaya\.com\/album\//i.test(clean)) return resolveXimalaya(clean)
  return resolveGenericPage(clean)
}

// ---- OPML 解析 ----

export async function parseOpmlFile(filePath: string): Promise<OpmlEntry[]> {
  const content = fs.readFileSync(filePath, 'utf-8')
  const entries: OpmlEntry[] = []
  const outlineRe = /<outline[^>]*>/gi
  for (const tag of content.match(outlineRe) || []) {
    const type = tag.match(/type=["']rss["']/i)
    const xmlUrl = tag.match(/xmlUrl=["']([^"']+)["']/i)?.[1]
    if (!type || !xmlUrl) continue
    const title = tag.match(/title=["']([^"']*)["']/i)?.[1] || tag.match(/text=["']([^"']*)["']/i)?.[1] || ''
    entries.push({ name: decodeXmlEntities(title) || xmlUrl, url: decodeXmlEntities(xmlUrl) })
  }
  if (entries.length === 0) throw new Error('OPML 文件中未找到 RSS 订阅源')
  return entries
}

// ---- 内置推荐 ----

export async function getRecommended(): Promise<RecommendedPodcast[]> {
  const { recommendedPodcasts } = await import('./data/recommended-podcasts')
  return recommendedPodcasts
}
