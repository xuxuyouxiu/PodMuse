import type { FeishuMessage } from './feishu-client'
import { platformRegistry } from './platforms'

// 多平台 URL 匹配（按优先级排列）
const URL_PATTERNS = [
  /https?:\/\/[^\s]*xiaoyuzhoufm\.com\/[^\s]*/i,
  /https?:\/\/(www\.|m\.)?(bilibili\.com\/video\/|b23\.tv\/)[^\s]*/i,
  /https?:\/\/v\.douyin\.com\/[^\s]*/i,
  /https?:\/\/(www\.)?douyin\.com\/video\/[^\s]*/i,
  /https?:\/\/(www\.|m\.)?(youtube\.com\/(watch|embed|shorts)|youtu\.be\/)[^\s]*/i,
  /https?:\/\/[^\s]*ximalaya\.com\/sound\/[^\s]*/i,
  /https?:\/\/[^\s]*podcasts\.apple\.com\/[^\s]*/i,
  /https?:\/\/(?!feeds\.)[^\s]*\bfireside\.fm\/\d+/i,
]

// 直接媒体链接匹配（兜底）
const MEDIA_EXT_PATTERN = /https?:\/\/[^\s]*\.(mp3|mp4|m4a|wav|aac|ogg)(\?[^\s]*)?/i

function extractAllUrls(text: string): string[] {
  const urls: string[] = []
  for (const pattern of URL_PATTERNS) {
    const m = text.match(pattern)
    if (m) urls.push(m[0])
  }
  if (urls.length === 0) {
    const m = text.match(MEDIA_EXT_PATTERN)
    if (m) urls.push(m[0])
  }
  return urls
}

function extractDedupKey(url: string): string | null {
  const info = platformRegistry.findAdapter(url)
  return info?.adapter.getDedupKey(url) || url
}

function safeReadText(msg: FeishuMessage): string {
  try {
    const content = JSON.parse(msg.body?.content || '{}')
    return content.text || ''
  } catch {
    return msg.body?.content || ''
  }
}

export interface MessageTask {
  id: string
  kind: 'podcast' | 'ignore'
  url?: string
  episodeId?: string | null
}

export class MessageParser {
  extract(messages: FeishuMessage[]): MessageTask[] {
    return messages.map(msg => this.parseOne(msg))
  }

  private parseOne(msg: FeishuMessage): MessageTask {
    const msgId = msg.message_id
    const msgType = msg.msg_type

    if (msgType === 'text') {
      const text = safeReadText(msg)
      const urls = extractAllUrls(text)
      if (urls.length > 0) {
        const url = urls[0]
        const episodeId = extractDedupKey(url)
        return { id: msgId, kind: 'podcast', url, episodeId }
      }
    }

    return { id: msgId, kind: 'ignore' }
  }
}
