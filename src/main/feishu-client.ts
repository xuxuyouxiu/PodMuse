const FEISHU_AUTH_URL = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal'
const FEISHU_MESSAGES_URL = 'https://open.feishu.cn/open-apis/im/v1/messages'
const FEISHU_SEND_URL = 'https://open.feishu.cn/open-apis/im/v1/messages'
const TOKEN_TTL = 3500 * 1000

async function feishuApi(method: string, url: string, token: string | null, body?: any) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  return resp.json()
}

export class FeishuClient {
  private token: string | null = null
  private tokenExpires = 0

  constructor(
    private appId: string,
    private appSecret: string,
    private logFunc: (msg: string) => void,
  ) {}

  isConnected(): boolean {
    return this.token !== null && Date.now() < this.tokenExpires
  }

  async ensureToken(): Promise<boolean> {
    if (this.token && Date.now() < this.tokenExpires) return true
    const result = await feishuApi('POST', FEISHU_AUTH_URL, null, { app_id: this.appId, app_secret: this.appSecret })
    if (result.code === 0) {
      this.token = result.tenant_access_token
      this.tokenExpires = Date.now() + TOKEN_TTL
      return true
    }
    this.logFunc(`getToken 失败: code=${result.code} msg=${result.msg || '无'} ${JSON.stringify(result)}`)
    return false
  }

  async listMessages(chatId: string): Promise<any[]> {
    const url = `${FEISHU_MESSAGES_URL}?container_id_type=chat&container_id=${chatId}&sort_type=ByCreateTimeDesc&page_size=10`
    const result = await feishuApi('GET', url, this.token)
    if (result.code !== 0) {
      this.logFunc(`listMessages 失败: code=${result.code} msg=${result.msg || '无'}`)
      return []
    }
    const items = result.data?.items || []
    // #region debug-point F:list-messages
    ;(()=>{let u='http://127.0.0.1:7777/event',s='feishu-poller-no-response';try{const e=require('fs').readFileSync('.dbg/feishu-poller-no-response.env','utf8');u=e.match(/DEBUG_SERVER_URL=(.+)/)?.[1]||u;s=e.match(/DEBUG_SESSION_ID=(.+)/)?.[1]||s}catch{}fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:s,runId:'pre-fix',hypothesisId:'F',location:'src/main/feishu-client.ts:listMessages',msg:'[DEBUG] feishu listMessages result',data:{chatId,count:items.length,items:items.slice(0,10).map((item:any)=>({message_id:item.message_id,msg_type:item.msg_type,create_time:item.create_time,content:String(item.body?.content||'').slice(0,160)}))},ts:Date.now()})}).catch(()=>{})})()
    // #endregion
    this.logFunc(`扫描到 ${items.length} 条消息`)
    return items
  }

  async sendMessage(chatId: string, text: string): Promise<boolean> {
    const body = {
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    }
    const result = await feishuApi('POST', `${FEISHU_SEND_URL}?receive_id_type=chat_id`, this.token, body)
    if (result.code !== 0) {
      this.logFunc(`sendMessage 失败: code=${result.code} msg=${result.msg || '无'}`)
      return false
    }
    return true
  }
}
