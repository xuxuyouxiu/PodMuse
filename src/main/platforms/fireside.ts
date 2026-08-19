/** Fireside 平台适配器 — 解析节目页 og meta / JSON-LD 提取音频直链 */

import type { PlatformAdapter, AudioExtractResult } from './types'

const HEADERS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** 解码常见 HTML/XML 实体（&amp; &lt; &gt; &quot; &apos; 及数字实体） */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => {
      const cp = parseInt(n, 10)
      return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : `&#${n};`
    })
}

export interface FiresidePageInfo {
  title: string | null
  audioUrl: string | null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 提取指定 og property 的 meta content（属性顺序无关，如 content 在 property 之前） */
function extractMetaContent(html: string, property: string): string | null {
  const prop = escapeRegExp(property)
  const re = new RegExp(
    `<meta\\b(?=[^>]*\\bproperty=["']${prop}["'])[^>]*\\scontent=["']([^"']*)["']`,
    'i',
  )
  const m = html.match(re)
  return m ? decodeHtmlEntities(m[1].trim()) : null
}

/** 在 JSON-LD 对象中递归查找音频直链（PodcastEpisode.associatedMedia.contentUrl 等） */
function findAudioUrlInJson(obj: unknown, depth = 0): string | null {
  if (depth > 8 || !obj) return null
  const mediaHints = ['.mp3', '.m4a', '.aac', '.ogg', '.flac', '.wav', 'audio/', 'video/']
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findAudioUrlInJson(item, depth + 1)
      if (found) return found
    }
    return null
  }
  if (typeof obj === 'object') {
    const record = obj as Record<string, unknown>
    // 明确的媒体字段直接信任；通用 url 字段需带媒体特征（避免命中页面自身 URL）
    for (const key of ['contentUrl', 'contentURL', 'audio', 'enclosureUrl', 'mediaUrl']) {
      const val = record[key]
      if (typeof val === 'string' && val.startsWith('http')) return val
    }
    const url = record['url']
    if (
      typeof url === 'string' &&
      url.startsWith('http') &&
      mediaHints.some(h => url.toLowerCase().includes(h))
    ) {
      return url
    }
    for (const val of Object.values(record)) {
      const found = findAudioUrlInJson(val, depth + 1)
      if (found) return found
    }
  }
  return null
}

/**
 * 从 Fireside 节目页 HTML 提取标题与音频直链（纯函数，便于测试）。
 * 音频优先级：og:audio:secure_url → og:audio → JSON-LD contentUrl → <audio src>
 */
export function parseFiresidePage(html: string): FiresidePageInfo {
  const title = extractMetaContent(html, 'og:title')
  let audioUrl = extractMetaContent(html, 'og:audio:secure_url')
  if (!audioUrl) audioUrl = extractMetaContent(html, 'og:audio')

  // JSON-LD：PodcastEpisode 的 associatedMedia.contentUrl / MediaObject.contentUrl
  if (!audioUrl) {
    const re = /<script\s+type=["']application\/ld\+json["'][^>]*>\s*([\s\S]*?)\s*<\/script>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      try {
        const data = JSON.parse(m[1])
        const found = findAudioUrlInJson(data)
        if (found) {
          audioUrl = found
          break
        }
      } catch {
        /* 跳过解析失败的 JSON-LD 块 */
      }
    }
  }

  // <audio src> 标签
  if (!audioUrl) {
    const at = html.match(/<audio\b[^>]*\bsrc=["']([^"']+)["']/i)
    if (at) audioUrl = decodeHtmlEntities(at[1])
  }

  return { title, audioUrl }
}

export class FiresideAdapter implements PlatformAdapter {
  id = 'fireside'
  name = 'Fireside'
  /** 节目页：https://<podcast>.fireside.fm/<数字 id>（feeds 子域 RSS 链接由 match() 排除；
   *  \b 锚定 host 边界，避免 notfireside.fm 这类后缀域名被误识别） */
  urlPattern = /^https?:\/\/[^/]*\bfireside\.fm\/\d+/i

  match(url: string): boolean {
    if (/^https?:\/\/feeds\.fireside\.fm\//i.test(url)) return false
    return this.urlPattern.test(url)
  }

  async extractAudio(url: string, signal?: AbortSignal): Promise<AudioExtractResult> {
    const resp = await fetch(url, {
      headers: { 'User-Agent': HEADERS_UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
      signal,
    })
    if (!resp.ok) throw new Error(`抓取页面失败 HTTP ${resp.status}`)
    const html = await resp.text()

    const { title, audioUrl } = parseFiresidePage(html)
    if (!audioUrl) throw new Error('未找到音频链接')

    return {
      type: 'direct_url',
      audioUrl,
      title: title || undefined,
      metadata: { platform: 'fireside' },
    }
  }

  /** 快速获取标题（入队预取）：直接解析页面 og:title */
  async fetchTitle(url: string, signal?: AbortSignal): Promise<string | null> {
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': HEADERS_UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
        signal,
      })
      if (!resp.ok) return null
      const html = await resp.text()
      return parseFiresidePage(html).title
    } catch {
      return null
    }
  }

  getDedupKey(url: string): string | null {
    // host + pathname（去尾斜杠、去 query）：如 guiguzaozhidao.fireside.fm/20240440，跨节目唯一
    try {
      const u = new URL(url)
      const path = u.pathname.replace(/\/+$/, '')
      if (!path) return null
      return u.host + path
    } catch {
      return null
    }
  }
}
