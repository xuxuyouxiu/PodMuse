/** B 站（Bilibili）平台适配器 */

import type { PlatformAdapter, AudioExtractResult } from './types'

export class BilibiliAdapter implements PlatformAdapter {
  id = 'bilibili'
  name = 'B 站'
  urlPattern = /^https?:\/\/(www\.|m\.)?(bilibili\.com\/video\/|b23\.tv\/)/i

  match(url: string): boolean {
    return this.urlPattern.test(url)
  }

  async extractAudio(url: string): Promise<AudioExtractResult> {
    // B 站使用 yt-dlp 提取音频，这里只做 URL 验证和元数据获取
    const resolvedUrl = await this.resolveShortUrl(url)
    const bvId = this.extractBvId(resolvedUrl)
    if (!bvId) throw new Error('无法识别 B 站视频链接')

    return {
      type: 'yt_dlp',
      audioUrl: resolvedUrl,
      videoId: bvId,
      metadata: { platform: 'bilibili' },
    }
  }

  getDedupKey(url: string): string | null {
    return this.extractBvId(url)
  }

  private extractBvId(url: string): string | null {
    // 完整链接: bilibili.com/video/BV1xx411c7mD
    const m = url.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/i)
    if (m) return m[1]
    // 短链解析后的 BV 号从 resolved URL 中提取
    return null
  }

  private async resolveShortUrl(url: string): Promise<string> {
    if (url.includes('b23.tv')) {
      try {
        const resp = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
        // 302 重定向时从 Location 头获取完整 URL
        if (resp.status >= 300 && resp.status < 400) {
          const location = resp.headers.get('location')
          if (location && location.includes('bilibili.com')) return location
        }
        // 某些情况下 fetch 不跟随 redirect，手动再试
        const resp2 = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(5000) })
        if (resp2.url && resp2.url.includes('bilibili.com')) return resp2.url
      } catch {}
    }
    return url
  }
}
