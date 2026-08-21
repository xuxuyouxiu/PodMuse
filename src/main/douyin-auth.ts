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

// 在页内取账号信息（比主进程裸 fetch 可靠：同源请求带全量 cookie/反爬头，识别真实登录态）
const PAGE_ACCOUNT_INFO_JS = `(async () => {
  try {
    const r = await fetch('/passport/web/account/info/', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const j = await r.json();
    return JSON.stringify({ status: r.status, body: j });
  } catch (e) {
    return JSON.stringify({ status: 0, error: String(e) });
  }
})()`

const PAGE_FETCH_TIMEOUT_MS = 5000

/** 页内昵称探测重试次数与间隔（登录跳转后信息可能稍后才就绪） */
const PAGE_NICKNAME_RETRIES = 6
const PAGE_NICKNAME_RETRY_GAP_MS = 1000

/** 在登录页上下文内拉取账号信息并提取昵称；失败返回 null（不影响登录流程） */
async function fetchNicknameInPage(win: BrowserWindow): Promise<string | null> {
  try {
    const raw = (await Promise.race([
      win.webContents.executeJavaScript(PAGE_ACCOUNT_INFO_JS, true),
      new Promise<null>(resolve => setTimeout(() => resolve(null), PAGE_FETCH_TIMEOUT_MS)),
    ])) as string | null
    if (!raw) return null
    const parsed = JSON.parse(raw) as { status?: number; body?: unknown }
    if (parsed.status === 200) return extractNickname(parsed.body) ?? null
    return null
  } catch {
    return null
  }
}

/**
 * 页内昵称探测（带重试）：登录跳转后账号信息可能稍后才就绪，
 * 每 1s 重试一次，最多 PAGE_NICKNAME_RETRIES 次；仍拿不到返回 null（不阻塞登录）。
 */
async function probeNicknameInPage(
  win: BrowserWindow,
  isSettled: () => boolean,
): Promise<string | null> {
  for (let i = 0; i < PAGE_NICKNAME_RETRIES; i++) {
    const nickname = await fetchNicknameInPage(win)
    if (nickname) return nickname
    if (isSettled()) return null
    await new Promise(r => setTimeout(r, PAGE_NICKNAME_RETRY_GAP_MS))
  }
  return null
}

/**
 * 弹登录窗并轮询捕获 cookie（迁移自 index.ts 原 douyin:login）。
 * cookie 串只在本函数内拼接，绝不离开主进程。
 * 返回 { cookieStr, nickname? }：cookieStr 为空串表示用户关闭窗口（cancelled）；
 * 抛错表示页面加载失败或登录超时。nickname 在登录后从页面上下文拉取（最可靠），可能为 null。
 */
async function openDouyinLoginWindow(
  parent?: BrowserWindow | null,
): Promise<{ cookieStr: string; nickname?: string }> {
  // 先清旧会话 cookie，再开窗（保证扫码页是全新的）
  await clearDouyinSessionCookies()
  return new Promise<{ cookieStr: string; nickname?: string }>((resolve, reject) => {
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

    const finish = (value: { cookieStr: string; nickname?: string }) => {
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
        if (!cookieStr) return
        // 在页面上下文内拉取账号信息（同源请求最可靠，带重试）；
        // 拿不到昵称也不阻塞登录——登录标记（sessionid）本身就是真实登录的强信号
        const nickname = await probeNicknameInPage(loginWin, () => settled)
        finish({ cookieStr, nickname: nickname || undefined })
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
        resolve({ cookieStr: '' })
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
 * 连接抖音：弹登录窗 → 捕获 cookie（留在主进程）→ 保存 → 返回。
 * 登录标记（sessionid 等）出现即视为真实登录成功——直接保存 connected；
 * 昵称尽力而为：页内上下文探测优先，回退主进程校验，都拿不到也不显示「待验证」。
 */
export async function connectDouyin(parent?: BrowserWindow | null): Promise<DouyinConnectResult> {
  let cookieStr = ''
  let pageNickname: string | undefined
  try {
    const res = await openDouyinLoginWindow(parent)
    cookieStr = res.cookieStr
    pageNickname = res.nickname
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return { success: false, error: msg }
  }

  if (!cookieStr) return { success: false, cancelled: true }

  // 尽力补昵称：页内没拿到时回退主进程校验一次
  let nickname = pageNickname
  let unreachable = false
  if (!nickname) {
    const verify = await verifyDouyinCookie(cookieStr)
    if (verify.ok) nickname = verify.nickname
    else if (verify.reason === 'unreachable') unreachable = true
  }

  // 登录标记出现即真实登录：保存 connected（昵称可有可无），不再产生「待验证」中间态
  saveConfig({
    ...loadConfig(),
    douyin_cookie: cookieStr,
    douyin_login: {
      status: 'connected',
      ...(nickname ? { nickname } : {}),
      verifiedAt: Date.now(),
    },
  })
  void syncDouyinDownloaderCookie(cookieStr)

  if (unreachable) {
    return { success: true, warning: '网络不可达，已保存登录状态，稍后自动重新校验' }
  }
  return { success: true, ...(nickname ? { nickname } : {}) }
}

/** 读取当前抖音登录状态（纯配置读取，不做网络请求；绝不包含 cookie） */
export function getDouyinStatus(): DouyinRuntimeState {
  const config = loadConfig()
  if (!config.douyin_cookie) return { status: 'disconnected' }
  // 老用户迁移：已有 cookie 但无登录状态 → 视为已连接（无昵称），
  // 启动时的 refreshDouyinStatus 会尽力补昵称，绝不显示「待验证」
  if (!config.douyin_login) return { status: 'connected' }
  return {
    status: config.douyin_login.status,
    nickname: config.douyin_login.nickname,
    verifiedAt: config.douyin_login.verifiedAt,
  }
}

/**
 * 刷新抖音登录状态：已存 cookie 时重验。
 * 设计（v1.51.1）：启动/例行刷新**永不判死**——校验失效只保留既有状态，
 * 绝不让用户「每次打开都要重新登录」；只有真实下载/使用失败时经 markDouyinExpired 标过期。
 * 校验通过时顺带把配置串写进下载器 config.yml（自愈）。
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
    void syncDouyinDownloaderCookie(config.douyin_cookie)
    return state
  }

  // 网络不可达或校验失效：保留既有状态，不降级、不标 expired
  const prev = config.douyin_login
  if (prev && (prev.status === 'connected' || prev.status === 'unverified')) {
    return { status: prev.status, nickname: prev.nickname, verifiedAt: prev.verifiedAt }
  }
  saveConfig({ ...loadConfig(), douyin_login: { status: 'unverified' } })
  return { status: 'unverified' }
}

/**
 * 真实使用失败时标记登录过期（仅由抖音下载/校验链路在确认失败后调用），
 * 引导用户重新登录；cookie 内容保留，等待重连覆盖。
 */
export function markDouyinExpired(): DouyinRuntimeState {
  const config = loadConfig()
  const state: DouyinLoginState = {
    status: 'expired',
    nickname: config.douyin_login?.nickname,
  }
  saveConfig({ ...loadConfig(), douyin_login: state })
  return state
}

/**
 * 从内嵌会话读取最新抖音 cookie（仅当含真实登录标记时返回）。
 * 会话里的 cookie 比配置里的冻结串新鲜（msToken/ttwid 等随上下文轮换）。
 */
export async function getSessionDouyinCookie(): Promise<string | null> {
  try {
    const all = await session.defaultSession.cookies.get({})
    const douyinCookies = all.filter(c => isDouyinCookieDomain(c.domain))
    if (!douyinCookies.some(c => isLoginSessionCookie(c.name))) return null
    return buildCookieString(all)
  } catch {
    return null
  }
}

/**
 * 获取「当下可用」的抖音 cookie：会话优先（新鲜），回退配置冻结串（需校验通过）。
 * 供下载/校验链路使用；拿到会话串时顺带自愈写回配置与下载器 config.yml。
 */
export async function getFreshDouyinCookie(): Promise<string | null> {
  const sessionCookie = await getSessionDouyinCookie()
  if (sessionCookie) {
    const current = loadConfig()
    if (current.douyin_cookie !== sessionCookie) {
      saveConfig({ ...current, douyin_cookie: sessionCookie })
    }
    void syncDouyinDownloaderCookie(sessionCookie)
    return sessionCookie
  }
  const configCookie = loadConfig().douyin_cookie
  if (!configCookie) return null
  const verify = await verifyDouyinCookie(configCookie)
  return verify.ok ? configCookie : null
}

/** douyin-downloader 的 config.yml 路径（与本机安装一致） */
export function getDouyinDownloaderConfigPath(): string {
  return require('path').join(
    process.env.DOUYIN_DOWNLOADER_PATH || 'G:\\douyin-downloader-main',
    'config.yml',
  )
}

/**
 * 把抖音 cookie 串同步进 douyin-downloader 的 config.yml（cookies: 键值块）。
 * 最小化改写：只替换 cookies: 下的缩进行，其余配置原样保留；失败静默（不阻塞主流程）。
 */
export function syncDouyinDownloaderCookie(cookieStr: string): void {
  try {
    if (!cookieStr) return
    const fs = require('fs') as typeof import('fs')
    const filePath = getDouyinDownloaderConfigPath()
    if (!fs.existsSync(filePath)) return
    const entries = cookieStr
      .split(';')
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => {
        const eq = p.indexOf('=')
        if (eq <= 0) return null
        const k = p.slice(0, eq).trim()
        const v = p.slice(eq + 1).trim()
        return k && v ? `  ${k}: ${v}` : null
      })
      .filter((x): x is string => x !== null)
    if (entries.length === 0) return
    const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/)
    const out: string[] = []
    let inCookies = false
    let cookiesWritten = false
    for (const line of lines) {
      const trimmed = line.trim()
      if (/^cookies\s*:/.test(trimmed)) {
        inCookies = true
        cookiesWritten = true
        out.push('cookies:', ...entries)
        continue
      }
      if (inCookies) {
        // 遇到下一个顶层键（无缩进）即结束 cookies 块
        if (/^\S/.test(line) && line.length > 0) {
          inCookies = false
          out.push(line)
        }
        // 其它缩进行（cookies 块内部）跳过，由新块替换
        continue
      }
      out.push(line)
    }
    if (!cookiesWritten) out.push('cookies:', ...entries)
    fs.writeFileSync(filePath, out.join('\n') + '\n', 'utf-8')
  } catch {
    // 同步失败不影响登录/下载主流程（下载器自身也可能不用 config.yml）
  }
}

/** 断开抖音：清空 cookie 与登录状态后保存 */
export function disconnectDouyin(): DouyinRuntimeState {
  const config = loadConfig()
  saveConfig({ ...config, douyin_cookie: '', douyin_login: undefined })
  return { status: 'disconnected' }
}
