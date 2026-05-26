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
      // #region debug-point G:parse-message
      ;(()=>{let u='http://127.0.0.1:7777/event',s='feishu-poller-no-response';try{const e=require('fs').readFileSync('.dbg/feishu-poller-no-response.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'G',location:'src/main/message-parser.ts:parseOne',msg:'[DEBUG] feishu parse message',data:{msgId,msgType,text:text.slice(0,160),matched:!!matches,url:matches?.[0]||null},ts:Date.now()})}).catch(()=>{})})()
      // #endregion
      if (matches) {
        const url = matches[0]
        const episodeId = extractEpisodeId(url)
        return { id: msgId, kind: 'podcast', url, episodeId }
      }
    }

    // #region debug-point G:parse-ignore
    ;(()=>{let u='http://127.0.0.1:7777/event',s='feishu-poller-no-response';try{const e=require('fs').readFileSync('.dbg/feishu-poller-no-response.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'G',location:'src/main/message-parser.ts:parseOne',msg:'[DEBUG] feishu ignore message',data:{msgId,msgType,rawContent:String(msg.body?.content||'').slice(0,160)},ts:Date.now()})}).catch(()=>{})})()
    // #endregion

    return { id: msgId, kind: 'ignore' }
  }
}
