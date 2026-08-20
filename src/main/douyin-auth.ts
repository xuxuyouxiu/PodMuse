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
    .filter(c => isDouyinCookieDomain(c.domain))
    .map(c => c.name + '=' + c.value)
    .join('; ')
}

/** 登录成功后等待会话 cookie 落定的时间（毫秒） */
const LOGIN_SETTLE_MS = 1200

/** 是否为抖音域（含子域）——登录/扫码弹窗放行在应用内打开的前提 */
export function isDouyinHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'douyin.com' || host.endsWith('.douyin.com')
  } catch {
    return false
  }
}

/** 是否为抖音域 cookie（domain 后缀匹配，含子域；避免 Electron cookies.get domain 过滤语义风险） */
export function isDouyinCookieDomain(domain: string | undefined): boolean {
  if (!domain) return false
  return domain.includes('douyin.com') || domain.includes('iesdouyin.com')
}

/**
 * 应用商店/下载引导类域名：不应交给用户浏览器打开（会反复弹谷歌商店等）。
 * 登录窗弹窗规则里静默拦截，避免干扰登录流程。
 */
export function isBlockedExternalHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return (
      host === 'play.google.com' ||
      host === 'apps.apple.com' ||
      host === 'app.adjust.com' ||
      host.endsWith('.play.google.com') ||
      host.endsWith('.apps.apple.com') ||
      host.endsWith('.app.adjust.com')
    )
  } catch {
    return false
  }
}

/** 外部链接打开的最小间隔（毫秒）：防止页面反复 window.open 广告/下载链接导致浏览器被反复拉起 */
export const EXTERNAL_OPEN_COOLDOWN_MS = 3000

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
 * 清掉内嵌会话里的旧抖音 cookie：每次「连接抖音」都从干净的扫码页开始，
 * 避免登录窗直接显示上次登录的账号（用户以为是没登出）。
 */
async function clearDouyinSessionCookies(): Promise<void> {
  try {
    const all = await session.defaultSession.cookies.get({})
    for (const c of all) {
      if (!c.domain || !(c.domain.includes('douyin.com') || c.domain.includes('iesdouyin.com')))
        continue
      try {
        const url = 'https://' + c.domain.replace(/^\./, '') + (c.path || '/')
        await session.defaultSession.cookies.remove(url, c.name)
      } catch {}
    }
  } catch {}
}

/**
 * 弹登录窗并轮询捕获 cookie（迁移自 index.ts 原 douyin:login）。
 * cookie 串只在本函数内拼接，绝不离开主进程。
 * 返回空串表示用户关闭窗口（cancelled）；抛错表示页面加载失败或登录超时。
 */
async function openDouyinLoginWindow(parent?: BrowserWindow | null): Promise<string> {
  // 先清旧会话 cookie，再开窗（保证扫码页是全新的）
  await clearDouyinSessionCookies()
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

    // 弹出窗口规则（分四类）：
    // ① 抖音域内的 http/https 弹窗（登录页/扫码页本身用 window.open 打开）→ 允许在应用内打开，
    //    必须与登录窗共享内嵌会话，否则登录发生在外部浏览器、应用永远拿不到 cookie；
    // ② 应用商店/下载引导类域名（play.google.com 等）→ 静默拦截，不打扰登录流程；
    // ③ 其它 http/https 链接 → 交给用户默认浏览器打开，但带最小间隔限流（页面反复 window.open 时不会反复拉起浏览器）；
    // ④ bytedance:// 等自定义协议 → 系统无处理程序，静默拦截（否则 Windows 反复弹协议选择框）。
    let lastExternalOpen = 0
    loginWin.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) {
        if (isDouyinHost(url)) {
          return { action: 'allow' }
        }
        if (isBlockedExternalHost(url)) {
          return { action: 'deny' }
        }
        const now = Date.now()
        if (now - lastExternalOpen >= EXTERNAL_OPEN_COOLDOWN_MS) {
          lastExternalOpen = now
          try {
            shell.openExternal(url)
          } catch {}
        }
      }
      return { action: 'deny' }
    })

    // 登录窗主框架禁止导航离开抖音域（防止被广告/商店页劫持，登录流程中断）
    loginWin.webContents.on('will-navigate', (e, url) => {
      if (!isDouyinHost(url)) e.preventDefault()
    })

    // 每 3 秒检查一次真实登录会话 cookie（sessionid/sessionid_ss/uid_tt/sid_ucp）。
    // 关键设计（v1.50.5）：「关窗」与「接口校验」解耦——
    // 登录标记只有真实登录后才会出现（sid_guard 等游客 cookie 永远不含），
    // 因此命中标记并等 cookie 落定后直接关窗返回；校验交给 connectDouyin/后台 refreshDouyinStatus，
    // 校验接口的任何响应形状问题都不再阻塞窗口关闭与配置保存。
    // 全量抓取 + 后缀过滤（不用 cookies.get domain 过滤，避免子域 cookie 漏检）。
    const checkInterval = setInterval(async () => {
      try {
        const allCookies = await session.defaultSession.cookies.get({})
        const douyinCookies = allCookies.filter(c => isDouyinCookieDomain(c.domain))
        const hasLogin = douyinCookies.some(c => isLoginSessionCookie(c.name))
        if (!hasLogin) return
        // 等会话 cookie 落定（登录跳转后部分 cookie 稍后才写入）
        await new Promise(r => setTimeout(r, LOGIN_SETTLE_MS))
        if (settled) return
        const cookieStr = buildCookieString(allCookies)
        if (cookieStr) finish(cookieStr)
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

  // 登录标记出现即视为登录成功：先保存（unverified），再尽力即时校验升级为 connected。
  // 校验失败（含接口形状变化等）绝不再阻塞/报错——由后台 refreshDouyinStatus 自动重验自愈。
  const current = loadConfig()
  saveConfig({
    ...current,
    douyin_cookie: cookieStr,
    douyin_login: { status: 'unverified' },
  })

  const verify = await verifyDouyinCookie(cookieStr)

  if (verify.ok) {
    saveConfig({
      ...loadConfig(),
      douyin_login: { status: 'connected', nickname: verify.nickname, verifiedAt: Date.now() },
    })
    return { success: true, nickname: verify.nickname }
  }

  if (verify.reason === 'unreachable') {
    return { success: true, warning: '网络不可达，已保存登录状态，稍后自动重新校验' }
  }

  // invalid：保持 unverified 不标 expired（避免校验误判立刻让用户看到「已失效」）
  return { success: true }
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
