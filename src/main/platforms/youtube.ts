/** YouTube 平台适配器（支持字幕优先策略） */

import type { PlatformAdapter, AudioExtractResult } from './types'
import { fetchOgTitle } from './xiaoyuzhou'

export class YouTubeAdapter implements PlatformAdapter {
  id = 'youtube'
  name = 'YouTube'
  urlPattern = /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch|embed|shorts)\/?|youtu\.be\/)/i

  match(url: string): boolean {
    return this.urlPattern.test(url)
  }

  async extractAudio(url: string, signal?: AbortSignal): Promise<AudioExtractResult> {
    const videoId = this.extractVideoId(url)
    if (!videoId) throw new Error('无法识别 YouTube 视频链接')

    // 标准化为完整 URL，便于 yt-dlp 处理
    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`

    // 并行获取标题和频道名
    let title: string | undefined
    let channelName: string | undefined
    if (!signal?.aborted) {
      const [fetchedTitle, fetchedChannel] = await Promise.allSettled([
        fetchOgTitle(canonicalUrl),
        this.fetchChannelName(canonicalUrl, signal),
      ])
      if (fetchedTitle.status === 'fulfilled' && fetchedTitle.value) {
        title = fetchedTitle.value.replace(/\s*[-–—|]\s*YouTube\s*$/i, '').trim() || undefined
      }
      if (fetchedChannel.status === 'fulfilled') {
        channelName = fetchedChannel.value
      }
    }

    return {
      type: 'yt_dlp',
      audioUrl: canonicalUrl,
      title,
      videoId,
      metadata: {
        platform: 'youtube',
        ...(channelName ? { channel: channelName } : {}),
      },
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

  /** 通过 oEmbed API 获取频道/作者名称 */
  private async fetchChannelName(url: string, signal?: AbortSignal): Promise<string | undefined> {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
      const resp = await fetch(oembedUrl, { signal: signal || AbortSignal.timeout(5000) })
      if (!resp.ok) return undefined
      const data = (await resp.json()) as { author_name?: string }
      return data.author_name || undefined
    } catch {
      return undefined
    }
  }
}
