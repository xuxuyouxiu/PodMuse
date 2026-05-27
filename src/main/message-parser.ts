const PODCAST_PATTERN = /https?:\/\/[^\s]*xiaoyuzhoufm\.com\/[^\s]*/i
const EPISODE_ID_PATTERN = /xiaoyuzhoufm\.com\/episode\/([a-zA-Z0-9]+)/

function extractEpisodeId(url: string): string | null {
  const m = url.match(EPISODE_ID_PATTERN)
  return m ? m[1] : null
}

function safeReadText(msg: any): string {
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
  extract(messages: any[]): MessageTask[] {
    return messages.map((msg) => this.parseOne(msg))
  }

  private parseOne(msg: any): MessageTask {
    const msgId = msg.message_id
    const msgType = msg.msg_type

    if (msgType === 'text') {
      const text = safeReadText(msg)
      const matches = text.match(PODCAST_PATTERN)
      if (matches) {
        const url = matches[0]
        const episodeId = extractEpisodeId(url)
        return { id: msgId, kind: 'podcast', url, episodeId }
      }
    }

    return { id: msgId, kind: 'ignore' }
  }
}
