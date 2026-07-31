/** 小宇宙平台适配器 */

import type { PlatformAdapter, AudioExtractResult } from './types'

const HEADERS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'

function findAudioInJSON(obj: unknown, depth = 0): string | null {
  if (depth > 12 || !obj) return null
  const audioKeys = ['mediaKey', 'enclosureUrl', 'mediaUrl', 'audioUrl', 'streamUrl', 'url']
  const hints = ['.mp3', '.m4a', '.ogg', '.aac', 'audio', 'podcast', 'sound']
  if (typeof obj === 'object' && !Array.isArray(obj)) {
    const record = obj as Record<string, unknown>
    for (const key of audioKeys) {
      const val = record[key]
      if (
        typeof val === 'string' &&
        val.startsWith('http') &&
        hints.some(h => val.toLowerCase().includes(h))
      )
        return val
    }
    for (const val of Object.values(record)) {
      const found = findAudioInJSON(val, depth + 1)
      if (found) return found
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findAudioInJSON(item, depth + 1)
      if (found) return found
    }
  }
  return null
}

export class XiaoyuzhouAdapter implements PlatformAdapter {
  id = 'xiaoyuzhou'
  name = '小宇宙'
  urlPattern = /^https?:\/\/[^\s]*xiaoyuzhoufm\.com\/[^\s]+/i

  match(url: string): boolean {
    return this.urlPattern.test(url)
  }

  async extractAudio(url: string, signal?: AbortSignal): Promise<AudioExtractResult> {
    const resp = await fetch(url, {
      headers: { 'User-Agent': HEADERS_UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
      signal,
    })
    if (!resp.ok) throw new Error(`抓取页面失败 HTTP ${resp.status}`)
    const html = await resp.text()

    let title: string | null = null
    let audioUrl: string | null = null

    // 1) og:title + og:audio
    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
    if (titleMatch) title = titleMatch[1].trim()

    const audioMatch = html.match(/<meta\s+property="og:audio"\s+content="([^"]+)"/i)
    if (audioMatch) audioUrl = audioMatch[1]

    // 2) Next.js __NEXT_DATA__
    if (!audioUrl) {
      const nd = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>\s*(\{.*?\})\s*<\/script>/is)
      if (nd) {
        try {
          audioUrl = findAudioInJSON(JSON.parse(nd[1]))
        } catch {}
      }
    }

    // 3) <audio> 标签
    if (!audioUrl) {
      const at = html.match(/<audio[^>]*src="([^"]+)"/i)
      if (at) audioUrl = at[1]
    }

    // 4) JSON-LD
    if (!audioUrl) {
      const re = /<script\s+type="application\/ld\+json"[^>]*>\s*(.*?)\s*<\/script>/gis
      let m: RegExpExecArray | null
      while ((m = re.exec(html)) !== null) {
        try {
          const d = JSON.parse(m[1])
          if (d['@type'] === 'MediaObject' && d.contentUrl) {
            audioUrl = d.contentUrl
            break
          }
        } catch {}
      }
    }

    if (!audioUrl) throw new Error('未找到音频链接')

    return { type: 'direct_url', audioUrl, title: title || undefined }
  }

  getDedupKey(url: string): string | null {
    const m = url.match(/xiaoyuzhoufm\.com\/episode\/([a-zA-Z0-9]+)/)
    return m ? m[1] : null
  }
}

/** 从任意 URL 提取 og:title（通用兜底） */
export async function fetchOgTitle(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': HEADERS_UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
      signal,
    })
    if (!resp.ok) return null
    const html = await resp.text()
    const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)
    return titleMatch ? titleMatch[1].trim() : null
  } catch {
    return null
  }
}
