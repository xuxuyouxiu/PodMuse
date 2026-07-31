/** 喜马拉雅平台适配器 — 使用移动端 API 获取音频和元数据 */

import type { PlatformAdapter, AudioExtractResult } from './types'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

interface XimalayaTrackInfo {
  title: string
  anchorName?: string
  albumTitle?: string
  audioUrl: string
  isPaid: boolean
  isVipFree: boolean
  duration: number
}

export class XimalayaAdapter implements PlatformAdapter {
  id = 'ximalaya'
  name = '喜马拉雅'
  urlPattern = /^https?:\/\/(www\.|m\.)?ximalaya\.com\/sound\/(\d+)/i

  match(url: string): boolean {
    return this.urlPattern.test(url)
  }

  async extractAudio(url: string, signal?: AbortSignal): Promise<AudioExtractResult> {
    const trackId = this.extractTrackId(url)
    if (!trackId) throw new Error('无法识别喜马拉雅链接')

    const trackInfo = await this.fetchTrackInfo(trackId, signal)

    // 付费内容检测
    if (trackInfo.isPaid && !trackInfo.isVipFree) {
      throw new Error('该音频为付费内容，请使用本地文件方式')
    }

    return {
      type: 'direct_url',
      audioUrl: trackInfo.audioUrl,
      title: trackInfo.title,
      videoId: trackId,
      metadata: {
        platform: 'ximalaya',
        ...(trackInfo.anchorName ? { owner: trackInfo.anchorName } : {}),
        ...(trackInfo.albumTitle ? { album: trackInfo.albumTitle } : {}),
        duration: String(trackInfo.duration),
      },
    }
  }

  getDedupKey(url: string): string | null {
    return this.extractTrackId(url)
  }

  private extractTrackId(url: string): string | null {
    const m = url.match(/ximalaya\.com\/sound\/(\d+)/i)
    return m ? m[1] : null
  }

  /** 通过移动端 API 获取音频信息和元数据 */
  private async fetchTrackInfo(trackId: string, signal?: AbortSignal): Promise<XimalayaTrackInfo> {
    const apiUrl = `https://mobile.ximalaya.com/mobile/v1/track/baseInfo?trackId=${trackId}`
    const resp = await fetch(apiUrl, {
      headers: { 'User-Agent': UA },
      signal,
    })

    if (!resp.ok) throw new Error(`喜马拉雅 API 请求失败: HTTP ${resp.status}`)

    const json = (await resp.json()) as {
      ret?: number
      msg?: string
      title?: string
      duration?: number
      isPaid?: boolean
      isVipFree?: boolean
      paidType?: number
      hqNeedVip?: boolean
      playUrl32?: string
      playUrl64?: string
      playPathAacv164?: string
      playPathAacv224?: string
      downloadUrl?: string
      downloadAacUrl?: string
      albumTitle?: string
      userInfo?: { nickname?: string }
    }

    // API 错误处理
    if (json.ret !== undefined && json.ret !== 0) {
      const msg = json.msg || '未知错误'
      if (msg.includes('不存在') || json.ret === -3) {
        throw new Error('该音频不存在或已被删除')
      }
      if (msg.includes('下架') || json.ret === 929) {
        throw new Error('该音频已下架')
      }
      throw new Error(`喜马拉雅 API 错误: ${msg}`)
    }

    const title = json.title
    if (!title) throw new Error('喜马拉雅页面解析失败，请反馈给我们')

    // 选择最佳音频 URL（优先高质量 AAC > 高码率 MP3 > 低码率 MP3）
    const audioUrl =
      json.playPathAacv224 ||
      json.playPathAacv164 ||
      json.playUrl64 ||
      json.playUrl32 ||
      json.downloadAacUrl ||
      json.downloadUrl

    if (!audioUrl) {
      // 付费内容可能只有试听片段，此时 playUrl 字段可能为空
      if (json.isPaid) {
        throw new Error('该音频为付费内容，请使用本地文件方式')
      }
      throw new Error('喜马拉雅页面解析失败，请反馈给我们')
    }

    return {
      title,
      anchorName: json.userInfo?.nickname,
      albumTitle: json.albumTitle,
      audioUrl,
      isPaid: json.isPaid || false,
      isVipFree: json.isVipFree || false,
      duration: json.duration || 0,
    }
  }
}
