/** YouTube 平台适配器（支持字幕优先策略） */

import type { PlatformAdapter, AudioExtractResult } from './types'

export class YouTubeAdapter implements PlatformAdapter {
  id = 'youtube'
  name = 'YouTube'
  urlPattern = /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch|embed|shorts)\/?|youtu\.be\/)/i

  match(url: string): boolean {
    return this.urlPattern.test(url)
  }

  async extractAudio(url: string): Promise<AudioExtractResult> {
    const videoId = this.extractVideoId(url)
    if (!videoId) throw new Error('无法识别 YouTube 视频链接')

    // 标准化为完整 URL，便于 yt-dlp 处理
    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`

    return {
      type: 'yt_dlp',
      audioUrl: canonicalUrl,
      videoId,
      metadata: { platform: 'youtube' },
    }
  }

  getDedupKey(url: string): string | null {
    return this.extractVideoId(url)
  }

  private extractVideoId(url: string): string | null {
    // youtube.com/watch?v=XXXXX
    let m = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
    if (m) return m[1]
    // youtu.be/XXXXX
    m = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
    if (m) return m[1]
    // youtube.com/embed/XXXXX
    m = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)
    if (m) return m[1]
    // youtube.com/shorts/XXXXX
    m = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/)
    if (m) return m[1]
    return null
  }
}
