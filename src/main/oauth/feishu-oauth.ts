/**
 * 飞书 OAuth（网页应用授权码模式）—— 主进程闭环，本地回调 server 优先。
 *
 * 安全约束（docs/配置体系优化落地实现方案.md §1.5.3）：
 *   user_access_token / refresh_token / app_secret 只允许出现在：本模块内部变量、
 *   config.feishu_oauth；禁止进入日志 / 错误消息 / 通知，错误只做分类。
 *   renderer 只见 feishu:oauthStatus 的状态与群名，永不回显 token。
 *   未配置 appId/appSecret 时所有入口返回 { success:false, code:'oauth_not_configured' }。
 */

import { shell } from 'electron'
import { randomBytes } from 'crypto'
import { loadConfig, saveConfig } from '../config'
import { FEISHU_OAUTH_PORT, FEISHU_OAUTH_REDIRECT_URI } from '../../shared/constants'
import { startCallbackServer, type CallbackServer } from './callback-server'
import type {
  FeishuChatInfo,
  FeishuOAuthConfig,
  FeishuOAuthStatus,
  OAuthActionResult,
} from '@shared/types'

// 本地回调固定端口/地址（须在飞书后台「安全设置 → 重定向 URL」登记，否则授权页报 20029）
export const FEISHU_AUTHORIZE_URL = 'https://open.feishu.cn/open-apis/authen/v1/authorize'
export const FEISHU_OAUTH_TOKEN_URL = 'https://open.feishu.cn/open-apis/authen/v2/oauth/token'
export const FEISHU_APP_TOKEN_URL =
  'https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal'
export const FEISHU_CHATS_URL = 'https://open.feishu.cn/open-apis/im/v1/chats'

/** 授权等待窗口（本地回调模式）：超时后 server 已自动关闭 */
const AUTH_WAIT_TIMEOUT_MS = 5 * 60 * 1000
/** expiresAt 前 5 分钟自动用 refresh_token 续期 */
const TOKEN_REFRESH_AHEAD_MS = 5 * 60 * 1000
/** user_access_token 默认有效期（2 小时），响应缺 expires_in 时兜底 */
const DEFAULT_USER_TOKEN_TTL_MS = 2 * 60 * 60 * 1000

/** 进行中的本地回调授权流（同时只允许一个） */
let feishuAuthFlow: Promise<void> | null = null
let activeServer: CallbackServer | null = null

function genState(): string {
  return randomBytes(16).toString('hex')
}

/** 拼飞书授权页 URL（授权码模式，scope 在授权页展示） */
export function buildFeishuAuthorizeUrl(appId: string, redirectUri: string, state: string): string {
  const u = new URL(FEISHU_AUTHORIZE_URL)
  u.searchParams.set('app_id', appId)
  u.searchParams.set('redirect_uri', redirectUri)
  u.searchParams.set('state', state)
  return u.toString()
}

function getOAuthCredential(): { appId: string; appSecret: string } | null {
  const o = loadConfig().feishu_oauth
  if (!o?.appId || !o?.appSecret) return null
  return { appId: o.appId, appSecret: o.appSecret }
}

/** renderer 可见的连接状态（无任何 token/secret 字段） */
export function getFeishuStatus(): FeishuOAuthStatus {
  const o = loadConfig().feishu_oauth
  const configured = !!(o?.appId && o?.appSecret)
  const connected = configured && !!o?.userAccessToken
  const tokenExpired = connected && typeof o?.expiresAt === 'number' && o.expiresAt <= Date.now()
  return {
    configured,
    connected,
    tokenExpired: tokenExpired || undefined,
    chatId: o?.chatId,
    chatName: o?.chatName,
    connectedAt: o?.connectedAt,
  }
}

/** 把新 token 落 config.feishu_oauth（token 不出本函数；refresh_token 缺省时沿用旧值） */
function persistFeishuTokens(patch: {
  userAccessToken?: string
  refreshToken?: string
  expiresAt?: number
}): void {
  const current = loadConfig()
  const o = current.feishu_oauth
  saveConfig({
    ...current,
    feishu_oauth: {
      appId: o?.appId ?? '',
      appSecret: o?.appSecret ?? '',
      userAccessToken: patch.userAccessToken ?? o?.userAccessToken,
      refreshToken: patch.refreshToken ?? o?.refreshToken,
      expiresAt: patch.expiresAt ?? o?.expiresAt,
      chatId: o?.chatId,
      chatName: o?.chatName,
      connectedAt: Date.now(),
    },
  })
}

/** 失效处理：清 token 字段置「已断开，请重新连接」（保留应用注册与群聊选择） */
function markFeishuDisconnected(): void {
  const current = loadConfig()
  const o = current.feishu_oauth
  if (!o) return
  saveConfig({
    ...current,
    feishu_oauth: {
      appId: o.appId,
      appSecret: o.appSecret,
      chatId: o.chatId,
      chatName: o.chatName,
    },
  })
}

/** 主动关闭进行中的授权流（断开/重连前调用；未决 waitForCode 立即收尾） */
export function closePendingFeishuAuth(): void {
  activeServer?.close()
  activeServer = null
}

/** 测试/诊断用：当前进行中的飞书授权流（undefined = 无进行中） */
export function getPendingFeishuAuthFlow(): Promise<void> | null {
  return feishuAuthFlow
}

/**
 * 发起飞书授权：本地回调 server 优先（http://127.0.0.1:<随机端口>/feishu/callback）。
 * 立即返回，后台流等待 code → 换 token → 保存 → 通知状态变更；renderer 轮询 feishu:oauthStatus。
 */
export async function startFeishuAuth(onStatusChange?: () => void): Promise<OAuthActionResult> {
  const cred = getOAuthCredential()
  if (!cred) {
    return {
      success: false,
      code: 'oauth_not_configured',
      error: '飞书 OAuth 尚未配置（appId/appSecret 未就绪），可先用下方高级模式',
    }
  }
  if (feishuAuthFlow) {
    return { success: false, code: 'auth_in_progress', error: '已有进行中的授权流程' }
  }

  const state = genState()
  let server: CallbackServer
  try {
    server = await startCallbackServer({ expectedState: state, port: FEISHU_OAUTH_PORT })
  } catch {
    return {
      success: false,
      code: 'network_error',
      error: `本地回调服务启动失败（端口 ${FEISHU_OAUTH_PORT} 被占用？请关闭占用该端口的程序后重试）`,
    }
  }
  activeServer = server

  // 固定端口回调：须在飞书后台「安全设置 → 重定向 URL」登记该地址（设置页可复制）
  const redirectUri = FEISHU_OAUTH_REDIRECT_URI
  try {
    await shell.openExternal(buildFeishuAuthorizeUrl(cred.appId, redirectUri, state))
  } catch {
    server.close()
    activeServer = null
    return { success: false, code: 'network_error', error: '无法打开浏览器' }
  }

  feishuAuthFlow = runFeishuAuthFlow(server, redirectUri, onStatusChange)
  return { success: true }
}

/** 本地回调后台流：等 code → 换 token（失败分类不抛异常；结束必清运行态与通知） */
async function runFeishuAuthFlow(
  server: CallbackServer,
  redirectUri: string,
  onStatusChange?: () => void,
): Promise<void> {
  try {
    const code = await server.waitForCode(AUTH_WAIT_TIMEOUT_MS)
    if (!code) return
    await exchangeFeishuCode(code, redirectUri)
  } finally {
    server.close()
    if (activeServer === server) activeServer = null
    feishuAuthFlow = null
    onStatusChange?.()
  }
}

/** 从飞书响应中取数据对象（兼容扁平形状与 data 包裹形状） */
function unwrapFeishuData(json: unknown): Record<string, unknown> | null {
  if (!json || typeof json !== 'object') return null
  const root = json as Record<string, unknown>
  if (root.data && typeof root.data === 'object') return root.data as Record<string, unknown>
  return root
}

/**
 * 授权码换 user_access_token：POST /open-apis/authen/v2/oauth/token
 * （grant_type=authorization_code + client_id/client_secret/code/redirect_uri）。
 */
export async function exchangeFeishuCode(
  code: string,
  redirectUri?: string,
  fetcher: typeof fetch = fetch,
): Promise<OAuthActionResult> {
  const cred = getOAuthCredential()
  if (!cred) return { success: false, code: 'oauth_not_configured' }

  let json: unknown = null
  try {
    const resp = await fetcher(FEISHU_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: cred.appId,
        client_secret: cred.appSecret,
        code,
        redirect_uri: redirectUri ?? '',
      }),
      signal: AbortSignal.timeout(15000),
    })
    json = await resp.json().catch(() => null)
  } catch {
    return { success: false, code: 'network_error', error: '网络请求失败' }
  }

  const data = unwrapFeishuData(json)
  if (!data || typeof data.access_token !== 'string' || !data.access_token) {
    return { success: false, code: 'token_exchange_failed', error: '飞书授权码交换失败' }
  }
  const expiresIn =
    typeof data.expires_in === 'number'
      ? (data.expires_in as number) * 1000
      : DEFAULT_USER_TOKEN_TTL_MS
  persistFeishuTokens({
    userAccessToken: data.access_token as string,
    refreshToken:
      typeof data.refresh_token === 'string' ? (data.refresh_token as string) : undefined,
    expiresAt: Date.now() + expiresIn,
  })
  return { success: true }
}

/**
 * refresh_token 续期 user_access_token（约 30 天有效期内可续）。
 * 失败分类 refresh_failed / network_error；成功返回新 expiresAt。
 */
export async function refreshFeishuToken(
  fetcher: typeof fetch = fetch,
): Promise<OAuthActionResult & { expiresAt?: number }> {
  const cred = getOAuthCredential()
  if (!cred) return { success: false, code: 'oauth_not_configured' }
  const o = loadConfig().feishu_oauth
  if (!o?.refreshToken) {
    return { success: false, code: 'refresh_failed', error: '缺少 refresh_token，请重新连接飞书' }
  }

  let json: unknown = null
  try {
    const resp = await fetcher(FEISHU_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: cred.appId,
        client_secret: cred.appSecret,
        refresh_token: o.refreshToken,
      }),
      signal: AbortSignal.timeout(15000),
    })
    json = await resp.json().catch(() => null)
  } catch {
    return { success: false, code: 'network_error', error: '网络请求失败' }
  }

  const data = unwrapFeishuData(json)
  if (!data || typeof data.access_token !== 'string' || !data.access_token) {
    return { success: false, code: 'refresh_failed', error: '飞书 token 续期失败' }
  }
  const expiresIn =
    typeof data.expires_in === 'number'
      ? (data.expires_in as number) * 1000
      : DEFAULT_USER_TOKEN_TTL_MS
  const expiresAt = Date.now() + expiresIn
  persistFeishuTokens({
    userAccessToken: data.access_token as string,
    refreshToken:
      typeof data.refresh_token === 'string' ? (data.refresh_token as string) : undefined,
    expiresAt,
  })
  return { success: true, expiresAt }
}

export interface FeishuAppAccessTokenResult extends OAuthActionResult {
  /** app_access_token（约 2 小时有效；bot 模式兜底预留，不落盘、不出主进程） */
  token?: string
}

/** appId+appSecret 换 app_access_token（POST /open-apis/auth/v3/app_access_token/internal） */
export async function getFeishuAppAccessToken(
  fetcher: typeof fetch = fetch,
): Promise<FeishuAppAccessTokenResult> {
  const cred = getOAuthCredential()
  if (!cred) return { success: false, code: 'oauth_not_configured' }

  let json: unknown = null
  try {
    const resp = await fetcher(FEISHU_APP_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: cred.appId, app_secret: cred.appSecret }),
      signal: AbortSignal.timeout(15000),
    })
    json = await resp.json().catch(() => null)
  } catch {
    return { success: false, code: 'network_error', error: '网络请求失败' }
  }

  const data = unwrapFeishuData(json)
  if (!data || typeof data.app_access_token !== 'string' || !data.app_access_token) {
    return { success: false, code: 'token_exchange_failed', error: 'app_access_token 换取失败' }
  }
  return { success: true, token: data.app_access_token as string }
}

/** 飞书 token 失效错误码带（99991661-99991672：access token/app 鉴权相关） */
function isFeishuAuthError(code: unknown): boolean {
  return typeof code === 'number' && code >= 99991661 && code <= 99991672
}

export interface FeishuChatsResult extends OAuthActionResult {
  chats?: FeishuChatInfo[]
}

/** GET /open-apis/im/v1/chats（user_access_token）单次请求；token 失效 → token_expired */
async function requestFeishuChats(fetcher: typeof fetch): Promise<FeishuChatsResult> {
  const o = loadConfig().feishu_oauth
  let status = 0
  let json: unknown = null
  try {
    const resp = await fetcher(`${FEISHU_CHATS_URL}?page_size=100`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${o?.userAccessToken ?? ''}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      signal: AbortSignal.timeout(15000),
    })
    status = resp.status
    json = await resp.json().catch(() => null)
  } catch {
    return { success: false, code: 'network_error', error: '网络请求失败' }
  }

  const root = (json ?? null) as Record<string, unknown> | null
  const feishuCode = root && typeof root.code === 'number' ? root.code : undefined
  if (status === 401 || isFeishuAuthError(feishuCode)) {
    return { success: false, code: 'token_expired', error: '飞书授权已失效' }
  }
  if (status !== 200 || !root || feishuCode !== 0) {
    return { success: false, code: 'network_error', error: '飞书接口返回异常' }
  }
  const items = (root.data as Record<string, unknown> | undefined)?.items
  const chats = (Array.isArray(items) ? items : [])
    .map(c => {
      const item = c as Record<string, unknown>
      return {
        id: typeof item.chat_id === 'string' ? (item.chat_id as string) : '',
        name:
          typeof item.name === 'string' && item.name.trim()
            ? (item.name as string).trim()
            : '(未命名群聊)',
      }
    })
    .filter(c => c.id)
  return { success: true, chats }
}

/**
 * 列出用户所在群聊（user_access_token；供应用内「目标群聊」下拉）。
 * expiresAt 前 5 分钟自动续期；token 失效先续一次再重试，仍失败置「已断开」。
 */
export async function listFeishuChats(fetcher: typeof fetch = fetch): Promise<FeishuChatsResult> {
  const o = loadConfig().feishu_oauth
  if (!o?.appId || !o?.appSecret) return { success: false, code: 'oauth_not_configured' }
  if (!o.userAccessToken) return { success: false, code: 'not_connected', error: '尚未连接飞书' }

  // expiresAt 前 5 分钟自动续期
  if (typeof o.expiresAt === 'number' && Date.now() > o.expiresAt - TOKEN_REFRESH_AHEAD_MS) {
    const refreshed = await refreshFeishuToken(fetcher)
    if (!refreshed.success) {
      markFeishuDisconnected()
      return { success: false, code: 'token_expired', error: '飞书授权已过期，请重新连接' }
    }
  }

  const first = await requestFeishuChats(fetcher)
  if (first.success || first.code !== 'token_expired') return first

  const refreshed = await refreshFeishuToken(fetcher)
  if (!refreshed.success) {
    markFeishuDisconnected()
    return { success: false, code: 'token_expired', error: '飞书授权已失效，请重新连接' }
  }
  return await requestFeishuChats(fetcher)
}

/** 应用内选择目标群聊：chatId/chatName 落 config.feishu_oauth */
export function setFeishuChat(chatId: string, chatName?: string): OAuthActionResult {
  if (!getOAuthCredential()) return { success: false, code: 'oauth_not_configured' }
  const current = loadConfig()
  const o = current.feishu_oauth as FeishuOAuthConfig
  const id = (chatId || '').trim()
  if (!id) return { success: false, code: 'not_connected', error: '群聊 ID 不能为空' }
  saveConfig({
    ...current,
    feishu_oauth: {
      ...o,
      chatId: id,
      chatName: chatName?.trim() || o.chatName,
    },
  })
  return { success: true }
}

/** 断开飞书：清 token 字段（保留应用注册 appId/secret 与群聊选择） */
export function disconnectFeishu(): FeishuOAuthStatus {
  closePendingFeishuAuth()
  const current = loadConfig()
  const o = current.feishu_oauth
  if (o) {
    saveConfig({
      ...current,
      feishu_oauth: {
        appId: o.appId,
        appSecret: o.appSecret,
        chatId: o.chatId,
        chatName: o.chatName,
      },
    })
  }
  return getFeishuStatus()
}
