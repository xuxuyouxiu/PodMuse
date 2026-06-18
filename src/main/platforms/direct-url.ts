/** 直接音视频 URL 适配器（兜底：任意 .mp3/.mp4 等直链） */

import type { PlatformAdapter, AudioExtractResult } from './types'

const MEDIA_EXTENSIONS = ['mp3', 'mp4', 'm4a', 'wav', 'aac', 'ogg', 'flac', 'mov', 'avi', 'wmv', 'webm']
const MEDIA_CONTENT_TYPES = ['audio/', 'video/']

export class DirectUrlAdapter implements PlatformAdapter {
  id = 'direct_url'
  name = '直接链接'
  urlPattern = /^https?:\/\/.+/i

  match(url: string): boolean {
    // 仅匹配 http/https URL
    if (!this.urlPattern.test(url)) return false
    // 通过扩展名检测
    if (this.hasMediaExtension(url)) return true
    return false
  }

  async extractAudio(url: string, signal?: AbortSignal): Promise<AudioExtractResult> {
    // 如果 URL 没有媒体扩展名，尝试 HEAD 请求检测 Content-Type
    if (!this.hasMediaExtension(url)) {
      try {
        const resp = await fetch(url, {
          method: 'HEAD',
          signal: signal || AbortSignal.timeout(8000),
        })
        const contentType = resp.headers.get('content-type') || ''
        if (!MEDIA_CONTENT_TYPES.some(ct => contentType.startsWith(ct))) {
          throw new Error('该链接不指向音频或视频文件')
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes('不指向')) throw e
        throw new Error('无法验证链接是否为媒体文件')
      }
    }

    // 从 URL path 提取文件名作为标题
    const title = this.extractFilename(url)

    return { type: 'direct_url', audioUrl: url, title }
  }

  getDedupKey(url: string): string | null {
    // 用完整 URL（去除查询参数）作为去重 key
    try {
      const u = new URL(url)
      u.search = ''
      return u.toString()
    } catch {
      return url
    }
  }

  /** 通过扩展名判断是否为媒体 URL（含 Content-Type HEAD 检测的预检） */
  async matchWithHeadCheck(url: string, signal?: AbortSignal): Promise<boolean> {
    if (this.hasMediaExtension(url)) return true
    // 无扩展名时尝试 HEAD 请求
    try {
      const resp = await fetch(url, {
        method: 'HEAD',
        signal: signal || AbortSignal.timeout(5000),
      })
      const contentType = resp.headers.get('content-type') || ''
      return MEDIA_CONTENT_TYPES.some(ct => contentType.startsWith(ct))
    } catch {
      return false
    }
  }

  private hasMediaExtension(url: string): boolean {
    try {
      const pathname = new URL(url).pathname.toLowerCase()
      return MEDIA_EXTENSIONS.some(ext => pathname.endsWith(`.${ext}`))
    } catch {
      return false
    }
  }

  private extractFilename(url: string): string {
    try {
      const pathname = new URL(url).pathname
      const lastSegment = pathname.split('/').pop() || ''
      // 去除扩展名
      const dotIndex = lastSegment.lastIndexOf('.')
      if (dotIndex > 0) return decodeURIComponent(lastSegment.substring(0, dotIndex))
      return decodeURIComponent(lastSegment) || '未知音频'
    } catch {
      return '未知音频'
    }
  }
}
