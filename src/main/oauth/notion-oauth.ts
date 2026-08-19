/**
 * Notion OAuth（公开集成 Public integration）—— 授权码模式主进程闭环。
 *
 * 安全约束（docs/配置体系优化落地实现方案.md §1.5.2）：
 *   token/secret 只允许出现在：本模块内部变量、config.notion_oauth；
 *   禁止进入日志 / 错误消息 / 通知，错误只做分类（oauth_not_configured / token_expired …）。
 *   未配置 clientId/clientSecret 时所有入口返回 { success:false, code:'oauth_not_configured' }。
 */

import { shell } from 'electron'
import { randomBytes } from 'crypto'
import { loadConfig, saveConfig } from '../config'
import { startCallbackServer, NOTION_CALLBACK_PATH, type CallbackServer } from './callback-server'
import type {
  NotionDatabaseInfo,
  NotionOAuthConfig,
  NotionOAuthStatus,
  OAuthActionResult,
  OAuthErrorCode,
} from '@shared/types'

/** 桌面协议回调（Notion 支持自定义 scheme redirect；平台后台需登记该 redirect URI） */
export const NOTION_REDIRECT_URI = 'podmuse://notion/callback'
export const NOTION_AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize'
export const NOTION_TOKEN_URL = 'https://api.notion.com/v1/oauth/token'
export const NOTION_SEARCH_URL = 'https://api.notion.com/v1/search'
export const NOTION_VERSION = '2022-06-28'

/** 授权等待窗口（本地回调模式）：超时后 server 已自动关闭 */
const AUTH_WAIT_TIMEOUT_MS = 5 * 60 * 1000

/** 进行中的授权 state（用于回调校验；应用重启后丢失 → 校验降级为尽力而为） */
let pendingNotionState: string | null = null

function genState(): string {
  return randomBytes(16).toString('hex')
}

/** 拼 Notion 授权页 URL（owner=user + response_type=code + state） */
export function buildNotionAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const u = new URL(NOTION_AUTHORIZE_URL)
  u.searchParams.set('client_id', clientId)
  u.searchParams.set('redirect_uri', redirectUri)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('owner', 'user')
  u.searchParams.set('state', state)
  return u.toString()
}

/** 读取 OAuth 凭据外壳；未就绪返回 null（所有入口据此返回 oauth_not_configured） */
function getOAuthCredential(): { clientId: string; clientSecret: string } | null {
  const o = loadConfig().notion_oauth
  if (!o?.clientId || !o?.clientSecret) return null
  return { clientId: o.clientId, clientSecret: o.clientSecret }
}

/** renderer 可见的连接状态（无任何 token/secret 字段） */
export function getNotionStatus(): NotionOAuthStatus {
  const o = loadConfig().notion_oauth
  const configured = !!(o?.clientId && o?.clientSecret)
  return {
    configured,
    connected: configured && !!o?.accessToken,
    workspaceId: o?.workspaceId,
    databaseId: o?.databaseId,
    connectedAt: o?.connectedAt,
  }
}

/** 401 失效处理：清 token 字段置「已断开，请重新连接」（保留应用注册与数据库选择） */
function markNotionDisconnected(): void {
  const current = loadConfig()
  const o = current.notion_oauth
  if (!o) return
  saveConfig({
    ...current,
    notion_oauth: { clientId: o.clientId, clientSecret: o.clientSecret, databaseId: o.databaseId },
  })
}

export interface NotionOAuthStartResult extends OAuthActionResult {
  /** 本地回调模式下的临时端口（协议回调模式下为 undefined） */
  port?: number
}

/**
 * 发起 Notion 授权：
 *   - 默认：podmuse://notion/callback 桌面协议回调（code 经 second-instance/启动 argv 进
 *     handleNotionOAuthCallback）；
 *   - useLocalCallback：127.0.0.1 随机端口本地回调（callback-server），后台等待 → 换 token。
 * 两种模式均立即返回，renderer 轮询 notion:oauthStatus 直到 connected/超时。
 */
export async function startNotionAuth(
  opts: { useLocalCallback?: boolean; onStatusChange?: () => void } = {},
): Promise<NotionOAuthStartResult> {
  const cred = getOAuthCredential()
  if (!cred) {
    return {
      success: false,
      code: 'oauth_not_configured',
      error: 'Notion OAuth 尚未配置（clientId/clientSecret 未就绪），可先用高级模式',
    }
  }

  const state = genState()
  pendingNotionState = state

  if (opts.useLocalCallback) {
    let server: CallbackServer
    try {
      server = await startCallbackServer({ expectedState: state })
    } catch {
      pendingNotionState = null
      return { success: false, code: 'network_error', error: '本地回调服务启动失败' }
    }
    const redirectUri = `http://127.0.0.1:${server.port}${NOTION_CALLBACK_PATH}`
    try {
      await shell.openExternal(buildNotionAuthorizeUrl(cred.clientId, redirectUri, state))
    } catch {
      server.close()
      pendingNotionState = null
      return { success: false, code: 'network_error', error: '无法打开浏览器' }
    }
    void runNotionLocalFlow(server, redirectUri, state, opts.onStatusChange)
    return { success: true, port: server.port }
  }

  try {
    await shell.openExternal(buildNotionAuthorizeUrl(cred.clientId, NOTION_REDIRECT_URI, state))
  } catch {
    pendingNotionState = null
    return { success: false, code: 'network_error', error: '无法打开浏览器' }
  }
  return { success: true }
}

/** 本地回调后台流：等 code → 换 token → 保存（失败分类不抛异常） */
async function runNotionLocalFlow(
  server: CallbackServer,
  redirectUri: string,
  state: string,
  onStatusChange?: () => void,
): Promise<void> {
  try {
    const code = await server.waitForCode(AUTH_WAIT_TIMEOUT_MS)
    if (!code) return
    await exchangeNotionCode(code, redirectUri)
  } finally {
    server.close()
    if (pendingNotionState === state) pendingNotionState = null
    onStatusChange?.()
  }
}

/** 解析 podmuse://notion/callback 回调 URL；不匹配/无 code 返回 null */
export function parseNotionCallback(rawUrl: string): { code: string; state: string | null } | null {
  try {
    const u = new URL(rawUrl)
    // URL 解析：podmuse://notion/callback → protocol=podmuse:、host=notion、pathname=/callback
    if (u.protocol !== 'podmuse:' || u.host !== 'notion' || u.pathname !== '/callback') return null
    const code = u.searchParams.get('code')
    if (!code) return null
    return { code, state: u.searchParams.get('state') }
  } catch {
    return null
  }
}

/** 协议回调总入口（index.ts 的 second-instance / 启动 argv 路由到此） */
export async function handleNotionOAuthCallback(
  rawUrl: string,
  onStatusChange?: () => void,
): Promise<OAuthActionResult> {
  const parsed = parseNotionCallback(rawUrl)
  if (!parsed) {
    return { success: false, code: 'token_exchange_failed', error: '回调 URL 无法解析' }
  }
  // state 校验（尽力而为）：应用重启后 pending state 丢失时跳过校验
  if (pendingNotionState && parsed.state && parsed.state !== pendingNotionState) {
    pendingNotionState = null
    return { success: false, code: 'token_exchange_failed', error: 'state 不匹配，已拒绝该回调' }
  }
  try {
    return await exchangeNotionCode(parsed.code)
  } finally {
    pendingNotionState = null
    onStatusChange?.()
  }
}

/**
 * 授权码换 token：POST /v1/oauth/token（Basic clientId:clientSecret）。
 * 成功后 accessToken/workspaceId/botId 落 config.notion_oauth（token 不出本函数）。
 */
export async function exchangeNotionCode(
  code: string,
  redirectUri: string = NOTION_REDIRECT_URI,
  fetcher: typeof fetch = fetch,
): Promise<OAuthActionResult> {
  const cred = getOAuthCredential()
  if (!cred) return { success: false, code: 'oauth_not_configured' }

  let status = 0
  let json: unknown = null
  try {
    const basic = Buffer.from(`${cred.clientId}:${cred.clientSecret}`).toString('base64')
    const resp = await fetcher(NOTION_TOKEN_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
      signal: AbortSignal.timeout(15000),
    })
    status = resp.status
    json = await resp.json().catch(() => null)
  } catch {
    return { success: false, code: 'network_error', error: '网络请求失败' }
  }

  if (status === 401) {
    return { success: false, code: 'token_exchange_failed', error: 'client_id/client_secret 无效' }
  }

  const body = (json ?? null) as Record<string, unknown> | null
  if (!body || typeof body.access_token !== 'string' || !body.access_token) {
    const errCode: OAuthErrorCode =
      status === 0 || status >= 500 ? 'network_error' : 'token_exchange_failed'
    return {
      success: false,
      code: errCode,
      error:
        body === null
          ? `Notion OAuth HTTP ${status}`
          : 'Notion 授权码交换失败（响应缺少 access_token）',
    }
  }

  const current = loadConfig()
  const o = current.notion_oauth
  saveConfig({
    ...current,
    notion_oauth: {
      clientId: o?.clientId ?? cred.clientId,
      clientSecret: o?.clientSecret ?? cred.clientSecret,
      accessToken: body.access_token as string,
      workspaceId:
        typeof body.workspace_id === 'string' ? (body.workspace_id as string) : o?.workspaceId,
      botId: typeof body.bot_id === 'string' ? (body.bot_id as string) : o?.botId,
      databaseId: o?.databaseId,
      connectedAt: Date.now(),
    },
  })
  return { success: true }
}

export interface NotionDatabasesResult extends OAuthActionResult {
  databases?: NotionDatabaseInfo[]
}

/** 从 /v1/search 结果条目提取数据库标题（title 为 rich_text 数组） */
function extractNotionTitle(item: Record<string, unknown>): string {
  const title = item.title
  if (Array.isArray(title)) {
    const first = title[0] as Record<string, unknown> | undefined
    if (first && typeof first.plain_text === 'string' && first.plain_text) {
      return first.plain_text as string
    }
    if (first && typeof first.text === 'string' && first.text) {
      return first.text as string
    }
  }
  return '(未命名数据库)'
}

/**
 * 列出集成可访问的数据库（POST /v1/search filter=object:database），供应用内选择器。
 * 401 → 置「已断开，请重新连接」并返回 token_expired。
 */
export async function listNotionDatabases(
  fetcher: typeof fetch = fetch,
): Promise<NotionDatabasesResult> {
  if (!getOAuthCredential()) return { success: false, code: 'oauth_not_configured' }
  const o = loadConfig().notion_oauth
  if (!o?.accessToken) return { success: false, code: 'not_connected', error: '尚未连接 Notion' }

  let status = 0
  let json: unknown = null
  try {
    const resp = await fetcher(NOTION_SEARCH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${o.accessToken}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filter: { value: 'database', property: 'object' }, page_size: 100 }),
      signal: AbortSignal.timeout(15000),
    })
    status = resp.status
    json = await resp.json().catch(() => null)
  } catch {
    return { success: false, code: 'network_error', error: '网络请求失败' }
  }

  if (status === 401) {
    markNotionDisconnected()
    return { success: false, code: 'token_expired', error: 'Notion 授权已失效，请重新连接' }
  }
  if (status !== 200 || json === null) {
    return { success: false, code: 'network_error', error: `Notion API HTTP ${status}` }
  }

  const body = json as Record<string, unknown>
  const results = Array.isArray(body.results) ? body.results : []
  const databases = results
    .map(r => {
      const item = r as Record<string, unknown>
      return {
        id: typeof item.id === 'string' ? (item.id as string) : '',
        title: extractNotionTitle(item),
      }
    })
    .filter(d => d.id)
  return { success: true, databases }
}

/**
 * 应用内选择目标数据库：databaseId 写 config.notion_oauth，
 * 并同步进 config.export.notion.database_id（与手动高级模式共用导出链路，见 §1.5.2）。
 */
export function setNotionDatabase(id: string): OAuthActionResult {
  if (!getOAuthCredential()) return { success: false, code: 'oauth_not_configured' }
  const current = loadConfig()
  const o = current.notion_oauth as NotionOAuthConfig
  const databaseId = (id || '').trim()
  if (!databaseId) return { success: false, code: 'not_connected', error: '数据库 ID 不能为空' }
  const nextExport = {
    ...(current.export ?? { logseq_dir: '', notion: { token: '', database_id: '' } }),
    notion: {
      ...(current.export?.notion ?? { token: '', database_id: '' }),
      database_id: databaseId,
    },
  }
  saveConfig({
    ...current,
    notion_oauth: { ...o, databaseId },
    export: nextExport,
  })
  return { success: true }
}

/** 断开 Notion：清 token 字段（保留应用注册 clientId/secret 与数据库选择） */
export function disconnectNotion(): NotionOAuthStatus {
  pendingNotionState = null
  const current = loadConfig()
  const o = current.notion_oauth
  if (o) {
    saveConfig({
      ...current,
      notion_oauth: {
        clientId: o.clientId,
        clientSecret: o.clientSecret,
        databaseId: o.databaseId,
      },
    })
  }
  return getNotionStatus()
}

/**
 * 导出链路凭据解析：优先 OAuth（已连接），否则回退手动高级模式 token/database_id。
 * exporter.ts 的 notion 分支改用本函数（转换/导出逻辑不变，仅替换凭据来源）。
 */
export function resolveNotionExportCredential(): {
  token: string
  databaseId: string
} | null {
  const config = loadConfig()
  const o = config.notion_oauth
  if (o?.clientId && o?.clientSecret && o.accessToken) {
    const databaseId = (o.databaseId || config.export?.notion?.database_id || '').trim()
    if (databaseId) return { token: o.accessToken, databaseId }
  }
  const manual = config.export?.notion
  if (manual?.token?.trim() && manual?.database_id?.trim()) {
    return { token: manual.token.trim(), databaseId: manual.database_id.trim() }
  }
  return null
}
