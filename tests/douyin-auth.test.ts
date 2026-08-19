import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PodcastConfig } from '@shared/types'

/**
 * 抖音无 Cookie 展示 —— 主进程闭环单元测试。
 * verifyDouyinCookie 四分支（200+昵称 / 401 / 302 / 超时）用 vi.stubGlobal(fetch) mock；
 * config 脱敏还原（restoreProtectedFields）与 disconnect / refresh / getDouyinStatus 状态流转。
 */

// ============================================================
// Mock setup — hoisted so factories can reference these
// ============================================================

const { mockLoadConfig, mockSaveConfig, mockCookiesGet, MockBrowserWindow } = vi.hoisted(() => {
  /** 极简 BrowserWindow 假件：记录实例、支持 on('closed') 与 close() 联动 */
  class MockBrowserWindow {
    static instances: MockBrowserWindow[] = []
    handlers: Record<string, ((...args: unknown[]) => void)[]> = {}
    webContents = {
      on: (ev: string, fn: (...args: unknown[]) => void) => {
        this.handlers['wc:' + ev] = [fn]
      },
    }
    destroyed = false
    constructor() {
      MockBrowserWindow.instances.push(this)
    }
    loadURL(_url: string) {}
    isDestroyed() {
      return this.destroyed
    }
    close() {
      if (this.destroyed) return
      this.destroyed = true
      for (const fn of this.handlers['closed'] || []) fn()
    }
    on(ev: string, fn: (...args: unknown[]) => void) {
      ;(this.handlers[ev] ||= []).push(fn)
    }
  }

  return {
    mockLoadConfig: vi.fn(),
    mockSaveConfig: vi.fn(),
    mockCookiesGet: vi.fn(),
    MockBrowserWindow,
  }
})

vi.mock('electron', () => ({
  BrowserWindow: MockBrowserWindow,
  session: { defaultSession: { cookies: { get: mockCookiesGet } } },
  app: { getPath: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn() },
  shell: { openPath: vi.fn(), openExternal: vi.fn(), showItemInFolder: vi.fn() },
}))

vi.mock('../src/main/config', () => ({
  loadConfig: mockLoadConfig,
  saveConfig: mockSaveConfig,
}))

vi.mock('../src/main/security', () => ({
  isSafeUrl: vi.fn(() => true),
  isSafeFilePath: vi.fn(() => true),
  isSafeExecutablePath: vi.fn(() => true),
  isSafeDirectoryPath: vi.fn(() => true),
  isPathWithinBase: vi.fn(() => true),
}))

vi.mock('../src/main/platforms/yt-dlp', () => ({
  detectYtDlp: vi.fn(),
}))

vi.mock('../src/main/backlinks', () => ({
  buildBacklinkIndex: vi.fn(),
  buildTagIndex: vi.fn(),
}))

import {
  verifyDouyinCookie,
  getDouyinStatus,
  refreshDouyinStatus,
  disconnectDouyin,
  connectDouyin,
} from '../src/main/douyin-auth'
import { restoreProtectedFields } from '../src/main/ipc/config-ipc'

// ============================================================
// Helpers
// ============================================================

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function baseConfig(overrides: Record<string, unknown> = {}): PodcastConfig {
  return { douyin_cookie: '', ...overrides } as PodcastConfig
}

const PASSPORT_OK_BODY = {
  data: {
    error_code: 0,
    description: '',
    user_info: { nickname: '播客爱好者', uid: '123' },
  },
  message: 'success',
}

/** 实测 2026-08 无 cookie 时的登录墙形状（passport/web/account/info） */
const PASSPORT_LOGGED_OUT_BODY = {
  data: { captcha: '', desc_url: '', description: '会话过期，请重新登录', error_code: 1 },
  message: 'error',
}

const AWEME_LOGGED_OUT_BODY = { status_code: 8, status_msg: '用户未登录', user: null }

beforeEach(() => {
  MockBrowserWindow.instances = []
  mockLoadConfig.mockReset()
  mockSaveConfig.mockReset()
  mockCookiesGet.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// ============================================================
// verifyDouyinCookie 四分支
// ============================================================

describe('verifyDouyinCookie', () => {
  it('HTTP 200 且含用户信息（passport 形状）→ ok + 昵称', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, PASSPORT_OK_BODY)),
    )

    const result = await verifyDouyinCookie('sid_guard=x; sessionid=y')

    expect(result).toEqual({ ok: true, nickname: '播客爱好者', reason: 'ok' })
  })

  it('HTTP 200 且含用户信息（aweme/v1/web 形状 user.nickname）→ ok + 昵称', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { status_code: 0, user: { nickname: 'aweme用户' } })),
    )

    const result = await verifyDouyinCookie('sid_guard=x')

    expect(result).toEqual({ ok: true, nickname: 'aweme用户', reason: 'ok' })
  })

  it('HTTP 401 → invalid（登录墙）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(401, { message: 'unauthorized' })),
    )

    const result = await verifyDouyinCookie('sid_guard=x')

    expect(result).toEqual({ ok: false, reason: 'invalid' })
  })

  it('HTTP 302 跳登录页 → invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('', {
            status: 302,
            headers: { Location: 'https://www.douyin.com/passport/login/' },
          }),
      ),
    )

    const result = await verifyDouyinCookie('sid_guard=x')

    expect(result).toEqual({ ok: false, reason: 'invalid' })
  })

  it('超时（TimeoutError）→ unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const err = new Error('The operation was aborted due to timeout')
        err.name = 'TimeoutError'
        throw err
      }),
    )

    const result = await verifyDouyinCookie('sid_guard=x')

    expect(result).toEqual({ ok: false, reason: 'unreachable' })
  })

  it('网络错误（fetch failed）→ unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    )

    const result = await verifyDouyinCookie('sid_guard=x')

    expect(result).toEqual({ ok: false, reason: 'unreachable' })
  })

  it('HTTP 200 但未登录形状（实测登录墙 JSON）→ invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, PASSPORT_LOGGED_OUT_BODY)),
    )
    expect(await verifyDouyinCookie('sid_guard=x')).toEqual({ ok: false, reason: 'invalid' })

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, AWEME_LOGGED_OUT_BODY)),
    )
    expect(await verifyDouyinCookie('sid_guard=x')).toEqual({ ok: false, reason: 'invalid' })
  })

  it('HTTP 200 但响应体不是 JSON → invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html><body>login</body></html>', { status: 200 })),
    )
    expect(await verifyDouyinCookie('sid_guard=x')).toEqual({ ok: false, reason: 'invalid' })
  })
})

// ============================================================
// restoreProtectedFields（config:save 脱敏还原 / 抖音凭据防护）
// ============================================================

describe('restoreProtectedFields（douyin 凭据 renderer 不可写）', () => {
  const current = {
    douyin_cookie: 'sid_guard=real; sessionid=real',
    douyin_login: { status: 'connected', nickname: '真实昵称', verifiedAt: 1 },
    api_key: 'sk-real',
    feishu_app_secret: 'secret-real',
  } as unknown as PodcastConfig

  it('renderer 传 **** → 还原为主进程值', () => {
    const out = restoreProtectedFields(
      { douyin_cookie: '****', douyin_login: { status: 'expired' as const } },
      current,
    )
    expect(out.douyin_cookie).toBe('sid_guard=real; sessionid=real')
    expect(out.douyin_login).toEqual(current.douyin_login)
  })

  it('renderer 传空值 → 主进程值保留（不被清空）', () => {
    const out = restoreProtectedFields({ douyin_cookie: '' }, current)
    expect(out.douyin_cookie).toBe('sid_guard=real; sessionid=real')
  })

  it('renderer 传任意伪造值 → 一律还原为主进程值', () => {
    const out = restoreProtectedFields({ douyin_cookie: 'evil=1; sid_guard=fake' }, current)
    expect(out.douyin_cookie).toBe('sid_guard=real; sessionid=real')
  })

  it('主进程无登录状态时，renderer 传的 douyin_login 被删除', () => {
    const out = restoreProtectedFields(
      { douyin_cookie: 'x=1', douyin_login: { status: 'connected', nickname: '伪造' } },
      { douyin_cookie: 'x=1' } as PodcastConfig,
    )
    expect(out.douyin_cookie).toBe('x=1')
    expect('douyin_login' in out).toBe(false)
  })

  it('既有 api_key **** 脱敏还原不受影响（回归）', () => {
    const out = restoreProtectedFields({ api_key: '****abcd', douyin_cookie: 'x=1' }, current)
    expect(out.api_key).toBe('sk-real')
  })

  it('既有 ai_providers.apiKey **** 脱敏还原不受影响（回归）', () => {
    const withProviders = {
      ...current,
      ai_providers: {
        deepseek: {
          id: 'deepseek',
          name: 'x',
          apiKey: 'sk-ds-real',
          baseUrl: '',
          model: '',
          availableModels: [],
        },
      },
    } as unknown as PodcastConfig
    const out = restoreProtectedFields(
      {
        ai_providers: { deepseek: { apiKey: '****9999' } },
        douyin_cookie: '****',
      },
      withProviders,
    )
    const providers = out.ai_providers as Record<string, Record<string, unknown>>
    expect(providers.deepseek.apiKey).toBe('sk-ds-real')
    expect(out.douyin_cookie).toBe('sid_guard=real; sessionid=real')
  })
})

// ============================================================
// getDouyinStatus / refreshDouyinStatus / disconnectDouyin
// ============================================================

describe('getDouyinStatus', () => {
  it('无 cookie → disconnected', () => {
    mockLoadConfig.mockReturnValue(baseConfig())
    expect(getDouyinStatus()).toEqual({ status: 'disconnected' })
  })

  it('有 cookie 但无 douyin_login（老用户迁移）→ unverified', () => {
    mockLoadConfig.mockReturnValue(baseConfig({ douyin_cookie: 'sid_guard=old' }))
    expect(getDouyinStatus()).toEqual({ status: 'unverified' })
  })

  it('已连接 → 透传状态与昵称，且不含 cookie', () => {
    mockLoadConfig.mockReturnValue(
      baseConfig({
        douyin_cookie: 'sid_guard=x',
        douyin_login: { status: 'connected', nickname: '昵称', verifiedAt: 123 },
      }),
    )
    const status = getDouyinStatus()
    expect(status).toEqual({ status: 'connected', nickname: '昵称', verifiedAt: 123 })
    expect(status).not.toHaveProperty('cookie')
  })
})

describe('refreshDouyinStatus', () => {
  it('无 cookie → disconnected，并清掉残留登录状态', async () => {
    mockLoadConfig.mockReturnValue(
      baseConfig({ douyin_login: { status: 'connected', nickname: '旧' } }),
    )
    const result = await refreshDouyinStatus()
    expect(result).toEqual({ status: 'disconnected' })
    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ douyin_login: undefined }),
    )
  })

  it('校验 ok → 保存 connected + 昵称 + verifiedAt', async () => {
    mockLoadConfig.mockReturnValue(baseConfig({ douyin_cookie: 'sid_guard=x' }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, PASSPORT_OK_BODY)),
    )

    const result = await refreshDouyinStatus()

    expect(result.status).toBe('connected')
    expect(result.nickname).toBe('播客爱好者')
    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        douyin_login: expect.objectContaining({ status: 'connected', nickname: '播客爱好者' }),
      }),
    )
  })

  it('校验失效 → 标 expired（cookie 内容保留）', async () => {
    mockLoadConfig.mockReturnValue(
      baseConfig({
        douyin_cookie: 'sid_guard=dead',
        douyin_login: { status: 'connected', nickname: '旧昵称' },
      }),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, PASSPORT_LOGGED_OUT_BODY)),
    )

    const result = await refreshDouyinStatus()

    expect(result.status).toBe('expired')
    const saved = mockSaveConfig.mock.calls[0][0] as PodcastConfig
    expect(saved.douyin_cookie).toBe('sid_guard=dead')
    expect(saved.douyin_login?.status).toBe('expired')
  })

  it('网络不可达且原状态 connected → 不降级、不重写', async () => {
    mockLoadConfig.mockReturnValue(
      baseConfig({
        douyin_cookie: 'sid_guard=x',
        douyin_login: { status: 'connected', nickname: '昵称', verifiedAt: 1 },
      }),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    )

    const result = await refreshDouyinStatus()

    expect(result).toEqual({ status: 'connected', nickname: '昵称', verifiedAt: 1 })
    expect(mockSaveConfig).not.toHaveBeenCalled()
  })

  it('网络不可达且无登录状态 → 标 unverified（cookie 已存）', async () => {
    mockLoadConfig.mockReturnValue(baseConfig({ douyin_cookie: 'sid_guard=x' }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    )

    const result = await refreshDouyinStatus()

    expect(result.status).toBe('unverified')
    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ douyin_login: { status: 'unverified' } }),
    )
  })
})

describe('disconnectDouyin', () => {
  it('清空 cookie 与登录状态并保存', () => {
    mockLoadConfig.mockReturnValue(
      baseConfig({
        douyin_cookie: 'sid_guard=x',
        douyin_login: { status: 'connected', nickname: '昵称', verifiedAt: 1 },
      }),
    )

    const result = disconnectDouyin()

    expect(result).toEqual({ status: 'disconnected' })
    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({ douyin_cookie: '', douyin_login: undefined }),
    )
  })
})

// ============================================================
// connectDouyin（登录窗迁移后的行为）
// ============================================================

describe('connectDouyin', () => {
  it('用户关闭登录窗 → cancelled，不保存任何配置', async () => {
    mockCookiesGet.mockImplementation(async () => [])
    mockLoadConfig.mockReturnValue(baseConfig())

    const promise = connectDouyin(null)
    await Promise.resolve()
    expect(MockBrowserWindow.instances.length).toBe(1)
    MockBrowserWindow.instances[0].close()

    const result = await promise
    expect(result).toEqual({ success: false, cancelled: true })
    expect(mockSaveConfig).not.toHaveBeenCalled()
  })

  it('登录成功 + 校验 ok → 保存 connected，返回不含 cookie', async () => {
    vi.useFakeTimers()
    mockCookiesGet.mockImplementation(async (filter: unknown) => {
      const f = filter as { domain?: string } | undefined
      if (f?.domain === '.douyin.com') return [{ name: 'sid_guard', value: 'sg' }]
      return [
        { name: 'sid_guard', value: 'sg', domain: '.douyin.com' },
        { name: 'sessionid', value: 'ss', domain: '.douyin.com' },
      ]
    })
    mockLoadConfig.mockReturnValue(baseConfig())
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, PASSPORT_OK_BODY)),
    )

    const promise = connectDouyin(null)
    await vi.advanceTimersByTimeAsync(3100)
    const result = await promise

    expect(result).toEqual({ success: true, nickname: '播客爱好者' })
    expect(result).not.toHaveProperty('cookie')
    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        douyin_cookie: 'sid_guard=sg; sessionid=ss',
        douyin_login: expect.objectContaining({ status: 'connected', nickname: '播客爱好者' }),
      }),
    )
  })

  it('登录成功但校验失效 → 不保存 cookie，返回可读错误', async () => {
    vi.useFakeTimers()
    mockCookiesGet.mockImplementation(async (filter: unknown) => {
      const f = filter as { domain?: string } | undefined
      if (f?.domain === '.douyin.com') return [{ name: 'sid_guard', value: 'sg' }]
      return [{ name: 'sid_guard', value: 'sg', domain: '.douyin.com' }]
    })
    mockLoadConfig.mockReturnValue(baseConfig({ douyin_cookie: 'sid_guard=old-good' }))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, PASSPORT_LOGGED_OUT_BODY)),
    )

    const promise = connectDouyin(null)
    await vi.advanceTimersByTimeAsync(3100)
    const result = await promise

    expect(result.success).toBe(false)
    expect(result.error).toContain('校验失败')
    expect(mockSaveConfig).not.toHaveBeenCalled()
  })

  it('登录成功但网络不可达 → 保存 cookie 标 unverified，返回 warning', async () => {
    vi.useFakeTimers()
    mockCookiesGet.mockImplementation(async (filter: unknown) => {
      const f = filter as { domain?: string } | undefined
      if (f?.domain === '.douyin.com') return [{ name: 'sid_guard', value: 'sg' }]
      return [{ name: 'sid_guard', value: 'sg', domain: '.douyin.com' }]
    })
    mockLoadConfig.mockReturnValue(baseConfig())
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    )

    const promise = connectDouyin(null)
    await vi.advanceTimersByTimeAsync(3100)
    const result = await promise

    expect(result.success).toBe(true)
    expect(result.warning).toContain('网络不可达')
    expect(mockSaveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        douyin_cookie: 'sid_guard=sg',
        douyin_login: { status: 'unverified' },
      }),
    )
  })
})
