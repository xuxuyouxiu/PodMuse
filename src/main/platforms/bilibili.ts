/** B 站（Bilibili）平台适配器 — 使用 B 站 API 直接获取音频流，绕过 yt-dlp 412 反爬 */

import type { PlatformAdapter, AudioExtractResult } from './types'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

interface BiliViewData {
  bvid: string
  title: string
  duration: number
  cid: number
}

interface BiliAudioStream {
  id: number
  baseUrl: string
  bandwidth: number
  codecs: string
}

export class BilibiliAdapter implements PlatformAdapter {
  id = 'bilibili'
  name = 'B 站'
  urlPattern = /^https?:\/\/(www\.|m\.)?(bilibili\.com\/video\/|b23\.tv\/)/i

  match(url: string): boolean {
    return this.urlPattern.test(url)
  }

  async extractAudio(url: string, signal?: AbortSignal): Promise<AudioExtractResult> {
    const resolvedUrl = await this.resolveShortUrl(url)
    const bvId = this.extractBvId(resolvedUrl)
    if (!bvId) throw new Error('无法识别 B 站视频链接')

    // 1) 获取视频信息（标题、cid）
    const viewData = await this.fetchViewInfo(bvId, signal)

    // 2) 获取 DASH 音频流 URL
    const audioStream = await this.fetchDashAudio(bvId, viewData.cid, signal)

    return {
      type: 'direct_url',
      audioUrl: audioStream.baseUrl,
      title: viewData.title,
      videoId: bvId,
      metadata: {
        platform: 'bilibili',
        duration: String(viewData.duration),
        bandwidth: String(audioStream.bandwidth),
      },
      headers: {
        'Referer': 'https://www.bilibili.com',
        'User-Agent': UA,
      },
    }
  }

  getDedupKey(url: string): string | null {
    return this.extractBvId(url)
  }

  private extractBvId(url: string): string | null {
    const m = url.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/i)
    return m ? m[1] : null
  }

  private async fetchViewInfo(bvId: string, signal?: AbortSignal): Promise<BiliViewData> {
    const resp = await fetch(
      `https://api.bilibili.com/x/web-interface/view?bvid=${bvId}`,
      { headers: { 'User-Agent': UA, 'Referer': 'https://www.bilibili.com' }, signal },
    )
    if (!resp.ok) throw new Error(`B 站 API 请求失败: HTTP ${resp.status}`)
    const json = await resp.json() as { code: number; message: string; data: { bvid: string; title: string; duration: number; pages: { cid: number }[] } }
    if (json.code !== 0) throw new Error(`B 站 API 错误: ${json.message} (code=${json.code})`)

    const d = json.data
    if (!d.pages?.length) throw new Error('B 站视频无分P信息')

    // 清理标题常见后缀
    let title = d.title || bvId
    title = title.replace(/[_\-|]\s*(哔哩哔哩|bilibili|B站).*$/i, '').trim() || title

    return { bvid: d.bvid, title, duration: d.duration, cid: d.pages[0].cid }
  }

  private async fetchDashAudio(bvId: string, cid: number, signal?: AbortSignal): Promise<BiliAudioStream> {
    // fnval=16 → DASH 格式, fnver=0, fourk=1
    const resp = await fetch(
      `https://api.bilibili.com/x/player/playurl?bvid=${bvId}&cid=${cid}&fnval=16&fnver=0&fourk=1`,
      { headers: { 'User-Agent': UA, 'Referer': 'https://www.bilibili.com' }, signal },
    )
    if (!resp.ok) throw new Error(`B 站 playurl API 失败: HTTP ${resp.status}`)
    const json = await resp.json() as { code: number; message: string; data: { dash?: { audio?: { id: number; baseUrl: string; bandwidth: number; codecs: string }[] } } }
    if (json.code !== 0) throw new Error(`B 站 playurl 错误: ${json.message}`)

    const audios = json.data?.dash?.audio
    if (!audios?.length) throw new Error('B 站视频无音频流（可能需要登录）')

    // 选带宽最高的音频流（音质最好）
    const best = audios.reduce((a, b) => a.bandwidth > b.bandwidth ? a : b)
    return { id: best.id, baseUrl: best.baseUrl, bandwidth: best.bandwidth, codecs: best.codecs }
  }

  private async resolveShortUrl(url: string): Promise<string> {
    if (url.includes('b23.tv')) {
      try {
        const resp = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(5000) })
        if (resp.url && resp.url.includes('bilibili.com')) return resp.url
      } catch {}
    }
    return url
  }
}
