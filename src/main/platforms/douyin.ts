/** 抖音（Douyin）平台适配器 — 使用 yt-dlp 提取音频 */

import type { PlatformAdapter, AudioExtractResult } from './types'

export class DouyinAdapter implements PlatformAdapter {
  id = 'douyin'
  name = '抖音'
  urlPattern = /^https?:\/\/(www\.|v\.)?(douyin\.com|iesdouyin\.com)/i

  match(url: string): boolean {
    return this.urlPattern.test(url) || /^https?:\/\/v\.douyin\.com\//i.test(url)
  }

  async extractAudio(url: string, signal?: AbortSignal): Promise<AudioExtractResult> {
    // 解析短链获取实际 URL
    let resolvedUrl = url
    if (/v\.douyin\.com/i.test(url)) {
      try {
        const resp = await fetch(url, {
          redirect: 'follow',
          signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        })
        resolvedUrl = resp.url
      } catch {
        // 短链解析失败，直接用原 URL 让 yt-dlp 处理
      }
    }

    // 提取视频 ID 用于去重和标题
    const videoId = this.extractVideoId(resolvedUrl)

    return {
      type: 'yt_dlp',
      audioUrl: resolvedUrl,
      videoId: videoId || undefined,
      metadata: {
        platform: 'douyin',
      },
    }
  }

  getDedupKey(url: string): string | null {
    // 抖音视频 ID：/video/1234567890
    const videoMatch = url.match(/\/video\/(\d+)/)
    if (videoMatch) return `douyin:${videoMatch[1]}`

    // 抖音图文 ID：/note/1234567890
    const noteMatch = url.match(/\/note\/(\d+)/)
    if (noteMatch) return `douyin:${noteMatch[1]}`

    // 短链：用完整 URL 做 key
    const shortMatch = url.match(/v\.douyin\.com\/[\w]+/)
    if (shortMatch) return `douyin:short:${shortMatch[0]}`

    return null
  }

  private extractVideoId(url: string): string | null {
    const match = url.match(/\/video\/(\d+)/)
    return match ? match[1] : null
  }
}
