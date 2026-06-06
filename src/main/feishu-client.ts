const FEISHU_AUTH_URL = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal'
const FEISHU_MESSAGES_URL = 'https://open.feishu.cn/open-apis/im/v1/messages'
const FEISHU_SEND_URL = 'https://open.feishu.cn/open-apis/im/v1/messages'
const TOKEN_TTL = 3500 * 1000

export interface FeishuMessage {
  message_id: string
  msg_type: string
  body?: {
    content?: string
  }
}

interface FeishuApiResponse {
  code: number
  msg?: string
  data?: {
    items?: FeishuMessage[]
  }
  tenant_access_token?: string
}

async function feishuApi(method: string, url: string, token: string | null, body?: unknown): Promise<FeishuApiResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json; charset=utf-8' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  try {
    const resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
    return await resp.json() as FeishuApiResponse
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { code: -1, msg: `网络请求失败: ${msg}` }
  }
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
    if (!this.appId || !this.appSecret) {
      this.logFunc('⚠ 飞书连接失败: App ID 或 App Secret 未配置，请在设置中填写飞书凭据')
      return false
    }
    const result = await feishuApi('POST', FEISHU_AUTH_URL, null, { app_id: this.appId, app_secret: this.appSecret })
    if (result.code === 0) {
      this.token = result.tenant_access_token ?? null
      this.tokenExpires = Date.now() + TOKEN_TTL
      return true
    }
    this.logFunc(`⚠ 飞书鉴权失败: code=${result.code} msg=${result.msg || '无'}`)
    return false
  }

  async listMessages(chatId: string): Promise<FeishuMessage[]> {
    const url = `${FEISHU_MESSAGES_URL}?container_id_type=chat&container_id=${chatId}&sort_type=ByCreateTimeDesc&page_size=10`
    const result = await feishuApi('GET', url, this.token)
    if (result.code !== 0) {
      this.logFunc(`listMessages 失败: code=${result.code} msg=${result.msg || '无'}`)
      return []
    }
    const items = result.data?.items || []
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
