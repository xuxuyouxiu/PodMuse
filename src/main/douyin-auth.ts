/**
 * 抖音「无 Cookie 展示」主进程闭环 —— 登录窗捕获 → 主进程校验 → 私有配置保存。
 *
 * 安全约束（docs/配置体系优化落地实现方案.md §2.4）：
 *   cookie 只允许出现在：登录窗 session、本模块内部变量、config.douyin_cookie；
 *   禁止进入 sendLog / console / 错误消息 / sendNotification。
 *   校验接口的响应体与 cookie 一律不写日志，只记录分类结果（ok / invalid / unreachable）。
 */

import { BrowserWindow, session, shell } from 'electron'
import { loadConfig, saveConfig } from './config'
import type { DouyinLoginState, DouyinLoginStatus } from '@shared/types'

/** 运行时状态 = 持久化状态 + 断开态（renderer 通过 douyin:status 拿到的形状） */
export type DouyinRuntimeStatus = DouyinLoginStatus | 'disconnected'

export interface DouyinRuntimeState {
  status: DouyinRuntimeStatus
  nickname?: string
  verifiedAt?: number
}

/** douyin:connect 的返回：绝不包含 cookie，只有成功与否、昵称与可读错误 */
export interface DouyinConnectResult {
  success: boolean
  nickname?: string
  error?: string
  cancelled?: boolean
  /** 登录已保存但网络不可达未完成校验（状态为 unverified，稍后自动重验） */
  warning?: string
}

/** 校验结果分类：ok 有效 / invalid 失效 / unreachable 网络不可达 */
export type DouyinVerifyReason = 'ok' | 'invalid' | 'unreachable'

export interface DouyinVerifyResult {
  ok: boolean
  nickname?: string
  reason: DouyinVerifyReason
}

/** 校验用的轻量接口（无签名要求；登录态下返回用户信息，未登录返回可识别形状） */
export const DOUYIN_VERIFY_URL = 'https://www.douyin.com/passport/web/account/info/'

const DOUYIN_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const VERIFY_TIMEOUT_MS = 8000

const LOGIN_WINDOW_TIMEOUT_MS = 5 * 60 * 1000

const NICKNAME_MAX_LEN = 64

/**
 * 登录标记 cookie：只有真实登录后才会出现的会话 cookie。
 * 注意：sid_guard 是匿名访客 cookie（打开首页即生成），**不能**作为登录依据——
 * 否则窗口会在用户扫码前被误关、抓到游客 cookie，随后校验必然失败。
 */
const LOGIN_SESSION_COOKIES = ['sessionid', 'sessionid_ss', 'uid_tt', 'sid_ucp']

/** 是否为真实登录会话 cookie（sid_guard 等匿名 cookie 一律不算） */
export function isLoginSessionCookie(name: string): boolean {
  return LOGIN_SESSION_COOKIES.includes(name)
}

/**
 * 页面加载失败错误码是否需要忽略（继续等待登录）。
 * ERR_ABORTED(-3)：导航被中断/重定向时常见，不是真实加载失败，忽略以免误关登录窗。
 */
export function isIgnorableLoadError(errorCode: number): boolean {
  return errorCode === -3
}

/** 把 Electron cookie 列表拼成 Cookie 请求头字符串（仅 douyin 域） */
export function buildCookieString(
  cookies: Array<{ name: string; value: string; domain?: string }>,
): string {
  return cookies
    .filter(
      c => c.domain?.includes('douyin.com') || c.domain?.includes('iesdouyin.com'),
    )
    .map(c => c.name + '=' + c.value)
    .join('; ')
}

/** 登录成功后等待会话 cookie 落定的时间（毫秒） */
const LOGIN_SETTLE_MS = 1200

/**
 * 用 fetch 带 Cookie 头请求抖音轻量接口验证登录态。
 * 判定（实测 2026-08：无 cookie 时 passport/web/account/info 返回 HTTP 200 +
 * {"data":{"error_code":1,"description":"会话过期，请重新登录"}}）：
 *   200 且含用户信息（data.user_info.nickname / user.nickname）→ ok + 昵称
 *   200 但呈未登录形状（error_code != 0 / status_code == 8 / 登录相关提示）→ invalid
 *   401/302 等登录墙响应 → invalid
 *   超时 / 网络错误 → unreachable
 */
export async function verifyDouyinCookie(
  cookieStr: string,
  fetcher: typeof fetch = fetch,
): Promise<DouyinVerifyResult> {
  let status = 0
  let bodyText = ''
  try {
    const resp = await fetcher(DOUYIN_VERIFY_URL, {
      method: 'GET',
      headers: {
        'User-Agent': DOUYIN_USER_AGENT,
        Referer: 'https://www.douyin.com/',
        Accept: 'application/json, text/plain, */*',
        Cookie: cookieStr,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    })
    status = resp.status
    bodyText = (await resp.text().catch(() => '')) || ''
  } catch (e: unknown) {
    // 超时（TimeoutError / AbortError）与网络错误统一分类为不可达
    const errName = e instanceof Error ? e.name : ''
    if (errName === 'TimeoutError' || errName === 'AbortError')
      return { ok: false, reason: 'unreachable' }
    return { ok: false, reason: 'unreachable' }
  }

  // 401 / 403 或 3xx 跳登录页 → 登录态失效
  if (status === 401 || status === 403 || (status >= 300 && status < 400)) {
    return { ok: false, reason: 'invalid' }
  }

  if (status !== 200) return { ok: false, reason: 'invalid' }

  // 解析响应体（只做形状判断，绝不把内容写出日志）
  let json: unknown = null
  try {
    json = JSON.parse(bodyText)
  } catch {
    json = null
  }

  const nickname = extractNickname(json)
  if (nickname) return { ok: true, nickname, reason: 'ok' }

  if (json && typeof json === 'object') {
    const root = json as Record<string, unknown>
    const data = root.data
    const statusCode = root.status_code
    const statusMsg = String(root.status_msg ?? '')

    // aweme/v1/web 系列未登录形状：status_code == 8 且 status_msg 含「登录」
    if (statusCode === 8 && /登录|未登录/i.test(statusMsg)) {
      return { ok: false, reason: 'invalid' }
    }

    if (data && typeof data === 'object') {
      const dataObj = data as Record<string, unknown>
      const errorCode = dataObj.error_code
      const description = String(dataObj.description ?? '')
      // passport/web/account/info 未登录形状：error_code 非 0 / description 提示会话过期
      if (
        (typeof errorCode === 'number' && errorCode !== 0) ||
        /登录|会话|过期/i.test(description)
      ) {
        return { ok: false, reason: 'invalid' }
      }
    }
  }

  // 200 但拿不到用户信息（含 HTML 登录页等异常形状）→ 一律按失效处理
  return { ok: false, reason: 'invalid' }
}

/** 从校验响应中提取昵称（兼容 passport/web/account/info 与 aweme/v1/web 系列两种形状） */
function extractNickname(json: unknown): string | undefined {
  if (!json || typeof json !== 'object') return undefined
  const root = json as Record<string, unknown>

  const candidates: unknown[] = []
  const data = root.data
  if (data && typeof data === 'object') {
    candidates.push((data as Record<string, unknown>).user_info)
  }
  candidates.push(root.user)

  for (const cand of candidates) {
    if (!cand || typeof cand !== 'object') continue
    const nickname = (cand as Record<string, unknown>).nickname
    if (typeof nickname === 'string' && nickname.trim() && nickname.length <= NICKNAME_MAX_LEN) {
      return nickname.trim()
    }
  }
  return undefined
}

/**
 * 弹登录窗并轮询捕获 cookie（迁移自 index.ts 原 douyin:login）。
 * cookie 串只在本函数内拼接，绝不离开主进程。
 * 返回空串表示用户关闭窗口（cancelled）；抛错表示页面加载失败或登录超时。
 */
async function openDouyinLoginWindow(parent?: BrowserWindow | null): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false

    const loginWin = new BrowserWindow({
      width: 500,
      height: 700,
      title: '登录抖音',
      parent: parent || undefined,
      modal: true,
      webPreferences: {
        session: session.defaultSession,
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    const finish = (value: string) => {
      if (settled) return
      settled = true
      clearInterval(checkInterval)
      clearTimeout(timeoutTimer)
      if (!loginWin.isDestroyed()) loginWin.close()
      resolve(value)
    }

    const fail = (err: Error) => {
      if (settled) return
      settled = true
      clearInterval(checkInterval)
      clearTimeout(timeoutTimer)
      if (!loginWin.isDestroyed()) loginWin.close()
      reject(err)
    }

    loginWin.loadURL('https://www.douyin.com/')

    // 规则：应用内所有 window.open 弹出链接一律交给用户默认浏览器打开（不在应用内弹窗）。
    // 但只放行 http/https：bytedance:// 等自定义协议系统没有处理程序，
    // 交给 shell.openExternal 会反复弹 Windows「需要使用新应用以打开此链接」对话框。
    loginWin.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        try {
          shell.openExternal(url)
        } catch {}
      }
      return { action: 'deny' }
    })

    // 每 3 秒检查一次真实登录会话 cookie（sessionid/sessionid_ss/uid_tt/sid_ucp）。
    // sid_guard 是匿名访客 cookie，出现 ≠ 已登录，绝不能作为登录依据——
    // 否则窗口会在用户扫码前被误关、抓到游客 cookie，随后校验必然失败。
    // 命中标记后先等会话 cookie 落定，再抓取整串 cookie 并调用校验接口确认：
    // 校验通过才算登录成功；校验失败（游客态/未落定）继续轮询，窗口保持打开等用户完成登录。
    const checkInterval = setInterval(async () => {
      try {
        const cookies = await session.defaultSession.cookies.get({ domain: '.douyin.com' })
        const hasLogin = cookies.some(c => isLoginSessionCookie(c.name))
        if (!hasLogin) return
        // 等会话 cookie 落定（登录跳转后部分 cookie 稍后才写入）
        await new Promise(r => setTimeout(r, LOGIN_SETTLE_MS))
        if (settled) return
        const allCookies = await session.defaultSession.cookies.get({})
        const cookieStr = buildCookieString(allCookies)
        if (!cookieStr) return
        const verify = await verifyDouyinCookie(cookieStr)
        if (verify.ok || verify.reason === 'unreachable') {
          // 校验通过→完成；网络不可达→也先完成（外层按 unverified 保存，稍后自动重验）
          finish(cookieStr)
        }
        // 校验失败：cookie 可能未落定或标记过期，继续下一轮轮询，不关窗
      } catch {
        // 轮询失败（如窗口已销毁）静默忽略，等待下一次轮询或 closed 事件
      }
    }, 3000)

    // 5 分钟超时
    const timeoutTimer = setTimeout(() => {
      fail(new Error('登录超时，请重试'))
    }, LOGIN_WINDOW_TIMEOUT_MS)

    loginWin.on('closed', () => {
      // 用户主动关闭窗口：返回 cancelled
      if (!settled) {
        settled = true
        clearInterval(checkInterval)
        clearTimeout(timeoutTimer)
        resolve('')
      }
    })

    loginWin.webContents.on('did-fail-load', (_e, code, desc, _validatedUrl, isMainFrame) => {
      // 只响应主框架的真实加载失败；重定向中断（-3）等可忽略错误不误关登录窗
      if (isMainFrame && !isIgnorableLoadError(code)) {
        fail(new Error('页面加载失败: ' + desc))
      }
    })
  })
}

/**
 * 连接抖音：弹登录窗 → 捕获 cookie（留在主进程）→ 校验 → 保存。
 * 校验失败不保存；网络不可达仍保存 cookie 但状态标 unverified（下次使用前再验）。
 */
export async function connectDouyin(parent?: BrowserWindow | null): Promise<DouyinConnectResult> {
  let cookieStr = ''
  try {
    cookieStr = await openDouyinLoginWindow(parent)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }

  if (!cookieStr) return { success: false, cancelled: true }

  const verify = await verifyDouyinCookie(cookieStr)

  if (verify.ok) {
    const current = loadConfig()
    saveConfig({
      ...current,
      douyin_cookie: cookieStr,
      douyin_login: { status: 'connected', nickname: verify.nickname, verifiedAt: Date.now() },
    })
    return { success: true, nickname: verify.nickname }
  }

  if (verify.reason === 'unreachable') {
    const current = loadConfig()
    saveConfig({
      ...current,
      douyin_cookie: cookieStr,
      douyin_login: { status: 'unverified' },
    })
    return { success: true, warning: '网络不可达，已保存登录状态，稍后自动重新校验' }
  }

  // 校验失败：不保存，提示重新登录
  return { success: false, error: '登录态校验失败，请重新登录' }
}

/** 读取当前抖音登录状态（纯配置读取，不做网络请求；绝不包含 cookie） */
export function getDouyinStatus(): DouyinRuntimeState {
  const config = loadConfig()
  if (!config.douyin_cookie) return { status: 'disconnected' }
  // 老用户迁移：已有 cookie 但无登录状态 → 视为待验证（启动时的 refreshDouyinStatus 会自动重验）
  if (!config.douyin_login) return { status: 'unverified' }
  return {
    status: config.douyin_login.status,
    nickname: config.douyin_login.nickname,
    verifiedAt: config.douyin_login.verifiedAt,
  }
}

/**
 * 刷新抖音登录状态：已存 cookie 时重验，失效标 expired；网络不可达不降级既有状态。
 * 在启动时与处理抖音链接前自动调用。
 */
export async function refreshDouyinStatus(): Promise<DouyinRuntimeState> {
  const config = loadConfig()
  if (!config.douyin_cookie) {
    if (config.douyin_login) {
      saveConfig({ ...config, douyin_login: undefined })
    }
    return { status: 'disconnected' }
  }

  const verify = await verifyDouyinCookie(config.douyin_cookie)

  if (verify.ok) {
    const state: DouyinLoginState = {
      status: 'connected',
      nickname: verify.nickname,
      verifiedAt: Date.now(),
    }
    saveConfig({ ...loadConfig(), douyin_login: state })
    return state
  }

  if (verify.reason === 'unreachable') {
    // 网络不可达：保留既有状态，避免离线时误标失效
    const prev = config.douyin_login
    if (prev && (prev.status === 'connected' || prev.status === 'unverified')) {
      return { status: prev.status, nickname: prev.nickname, verifiedAt: prev.verifiedAt }
    }
    saveConfig({ ...loadConfig(), douyin_login: { status: 'unverified' } })
    return { status: 'unverified' }
  }

  // 校验失效：标 expired，引导重新登录（cookie 内容保留，等待重连覆盖）
  const state: DouyinLoginState = {
    status: 'expired',
    nickname: config.douyin_login?.nickname,
  }
  saveConfig({ ...loadConfig(), douyin_login: state })
  return state
}

/** 断开抖音：清空 cookie 与登录状态后保存 */
export function disconnectDouyin(): DouyinRuntimeState {
  const config = loadConfig()
  saveConfig({ ...config, douyin_cookie: '', douyin_login: undefined })
  return { status: 'disconnected' }
}
