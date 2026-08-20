/**
 * safeStorage 敏感凭据加密单元测试（docs/配置体系优化落地实现方案.md P1）。
 * mock safeStorage：加密→落盘→load 解回闭环、不可用时明文回退、
 * 旧明文兼容（不强制迁移）、loadSafeConfig 防护不变。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as path from 'path'
import type { PodcastConfig } from '@shared/types'

// ============================================================
// Mock setup — hoisted so factories can reference these
// ============================================================

const {
  mockExistsSync,
  mockReadFileSync,
  mockWriteFileSync,
  mockMkdirSync,
  mockGetPath,
  mockIsEncryptionAvailable,
  mockEncryptString,
  mockDecryptString,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockGetPath: vi.fn(),
  mockIsEncryptionAvailable: vi.fn(() => true),
  mockEncryptString: vi.fn(),
  mockDecryptString: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { getPath: mockGetPath },
  safeStorage: {
    isEncryptionAvailable: mockIsEncryptionAvailable,
    encryptString: mockEncryptString,
    decryptString: mockDecryptString,
  },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs')
  return {
    ...actual,
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync,
  }
})

vi.mock('../src/main/ai-providers', () => ({
  getAllDefaultProviderConfigs: vi.fn(() => ({})),
}))

// 本套用例不涉及旧版 _enc 字段迁移，decryptField 仅需透传即可
vi.mock('../src/main/security', () => ({
  decryptField: (_safeStorage: unknown, value: string) => value,
  isSafeDirectoryPath: vi.fn(() => true),
  isSafeExecutablePath: vi.fn(() => true),
}))

// ============================================================
// Constants / helpers
// ============================================================

const USER_DATA_DIR = 'C:\Users\test\AppData\Roaming\podcast-notes'
const USER_CONFIG_PATH = path.join(USER_DATA_DIR, 'podcast_config.json')
const ENC = 'enc:v1:'

/** 模拟加密：enc:v1: + base64('E:' + 明文)；decryptString 反向剥离 'E:' 前缀 */
function encVal(plain: string): string {
  return ENC + Buffer.from('E:' + plain, 'utf-8').toString('base64')
}

function secretConfig(): PodcastConfig {
  return {
    api_key: 'sk-app-plain',
    feishu_app_secret: 'fs-legacy-app-secret-plain',
    douyin_cookie: 'sid_guard=sg; sessionid=ss',
    feishu_oauth: {
      appId: 'cli_fs',
      appSecret: 'fs-app-secret-plain',
      userAccessToken: 'u-token',
      refreshToken: 'u-refresh',
    },
    notion_oauth: {
      clientId: 'cid',
      clientSecret: 'ntn-client-secret',
      accessToken: 'ntn-access-token',
    },
    ai_provider: 'deepseek',
    ai_providers: {} as PodcastConfig['ai_providers'],
  } as PodcastConfig
}

beforeEach(() => {
  vi.resetModules()
  mockExistsSync.mockReset()
  mockReadFileSync.mockReset()
  mockWriteFileSync.mockReset()
  mockMkdirSync.mockReset()
  mockGetPath.mockReset()
  mockGetPath.mockReturnValue(USER_DATA_DIR)
  mockIsEncryptionAvailable.mockReset()
  mockIsEncryptionAvailable.mockReturnValue(true)
  mockEncryptString.mockReset()
  mockEncryptString.mockImplementation((s: string) => Buffer.from('E:' + s, 'utf-8'))
  mockDecryptString.mockReset()
  mockDecryptString.mockImplementation((b: Buffer) => {
    const s = b.toString('utf-8')
    if (!s.startsWith('E:')) throw new Error('unexpected ciphertext')
    return s.slice(2)
  })
})

// ============================================================
// encryptSecretFields / decryptSecretFields（纯函数）
// ============================================================

describe('encryptSecretFields / decryptSecretFields', () => {
  it('加密可用：目标字段转 enc:v1: base64 密文，app 级字段保持明文', async () => {
    const { encryptSecretFields } = await import('../src/main/config')
    const result = encryptSecretFields(secretConfig())

    // 目标字段加密
    expect(result.douyin_cookie).toBe(encVal('sid_guard=sg; sessionid=ss'))
    expect(result.feishu_oauth?.userAccessToken).toBe(encVal('u-token'))
    expect(result.feishu_oauth?.refreshToken).toBe(encVal('u-refresh'))
    expect(result.notion_oauth?.accessToken).toBe(encVal('ntn-access-token'))
    expect(result.notion_oauth?.clientSecret).toBe(encVal('ntn-client-secret'))
    // 密文不携带明文片段
    expect(result.douyin_cookie).not.toContain('sid_guard')
    expect(result.feishu_oauth?.userAccessToken).not.toContain('u-token')

    // app 级字段不加密（保持现状）
    expect(result.api_key).toBe('sk-app-plain')
    expect(result.feishu_app_secret).toBe('fs-legacy-app-secret-plain')
    expect(result.feishu_oauth?.appSecret).toBe('fs-app-secret-plain')
    expect(result.feishu_oauth?.appId).toBe('cli_fs')
    expect(result.notion_oauth?.clientId).toBe('cid')
  })

  it('不修改入参对象（内存中始终为明文，仅磁盘副本加密）', async () => {
    const { encryptSecretFields, decryptSecretFields } = await import('../src/main/config')
    const cfg = secretConfig()
    encryptSecretFields(cfg)
    expect(cfg.douyin_cookie).toBe('sid_guard=sg; sessionid=ss')
    expect(cfg.feishu_oauth?.userAccessToken).toBe('u-token')

    const dec = decryptSecretFields(cfg)
    expect(dec).toEqual(cfg)
    expect(cfg.notion_oauth?.accessToken).toBe('ntn-access-token')
  })

  it('空值与已加密值幂等（不重复加密）', async () => {
    const { encryptSecretFields } = await import('../src/main/config')
    const cfg = secretConfig()
    cfg.douyin_cookie = ''
    const marked = encryptSecretFields(cfg)

    const result = encryptSecretFields(marked)
    expect(result.douyin_cookie).toBe('')
    expect(result.feishu_oauth?.userAccessToken).toBe(encVal('u-token'))
    expect(mockEncryptString).toHaveBeenCalledTimes(4) // 仅 4 个非空目标字段各加密一次
  })

  it('加密不可用：回退明文（与现状一致）', async () => {
    mockIsEncryptionAvailable.mockReturnValue(false)
    const { encryptSecretFields } = await import('../src/main/config')
    const result = encryptSecretFields(secretConfig())

    expect(result.douyin_cookie).toBe('sid_guard=sg; sessionid=ss')
    expect(result.feishu_oauth?.userAccessToken).toBe('u-token')
    expect(result.notion_oauth?.accessToken).toBe('ntn-access-token')
    expect(mockEncryptString).not.toHaveBeenCalled()
  })

  it('encryptString 抛错：回退明文，保证配置仍可保存', async () => {
    mockEncryptString.mockImplementation(() => {
      throw new Error('dpapi failed')
    })
    const { encryptSecretFields } = await import('../src/main/config')
    const result = encryptSecretFields(secretConfig())

    expect(result.douyin_cookie).toBe('sid_guard=sg; sessionid=ss')
    expect(result.feishu_oauth?.userAccessToken).toBe('u-token')
  })

  it('decrypt 回环：密文自动解回业务明文', async () => {
    const { encryptSecretFields, decryptSecretFields } = await import('../src/main/config')
    const cfg = secretConfig()
    const enc = encryptSecretFields(cfg)
    const dec = decryptSecretFields(enc)

    expect(dec.douyin_cookie).toBe('sid_guard=sg; sessionid=ss')
    expect(dec.feishu_oauth?.userAccessToken).toBe('u-token')
    expect(dec.feishu_oauth?.refreshToken).toBe('u-refresh')
    expect(dec.notion_oauth?.accessToken).toBe('ntn-access-token')
    expect(dec.notion_oauth?.clientSecret).toBe('ntn-client-secret')
  })

  it('旧明文兼容：无前缀值原样返回，不做强制迁移', async () => {
    const { decryptSecretFields } = await import('../src/main/config')
    const result = decryptSecretFields(secretConfig())

    expect(result.douyin_cookie).toBe('sid_guard=sg; sessionid=ss')
    expect(result.feishu_oauth?.userAccessToken).toBe('u-token')
    expect(mockDecryptString).not.toHaveBeenCalled()
  })

  it('带前缀但加密不可用：清空凭据而非把密文带进业务', async () => {
    const { encryptSecretFields, decryptSecretFields } = await import('../src/main/config')
    const enc = encryptSecretFields(secretConfig())
    mockIsEncryptionAvailable.mockReturnValue(false)

    const dec = decryptSecretFields(enc)
    expect(dec.douyin_cookie).toBe('')
    expect(dec.feishu_oauth?.userAccessToken).toBe('')
    expect(dec.feishu_oauth?.refreshToken).toBe('')
    expect(dec.notion_oauth?.accessToken).toBe('')
    expect(dec.notion_oauth?.clientSecret).toBe('')
  })

  it('带前缀但 decryptString 抛错：清空凭据', async () => {
    const { encryptSecretFields, decryptSecretFields } = await import('../src/main/config')
    const enc = encryptSecretFields(secretConfig())
    mockDecryptString.mockImplementation(() => {
      throw new Error('dpapi decrypt failed')
    })

    const dec = decryptSecretFields(enc)
    expect(dec.douyin_cookie).toBe('')
    expect(dec.feishu_oauth?.userAccessToken).toBe('')
    expect(dec.notion_oauth?.accessToken).toBe('')
  })
})

// ============================================================
// loadConfig / saveConfig 落盘闭环
// ============================================================

describe('loadConfig / saveConfig 落盘闭环', () => {
  it('加密→落盘（磁盘无明文）→load 解回→业务值一致', async () => {
    mockExistsSync.mockImplementation((p: string) => p === USER_DATA_DIR)

    const { saveConfig } = await import('../src/main/config')
    saveConfig(secretConfig())

    const savedRaw = mockWriteFileSync.mock.calls[0][1] as string
    const saved = JSON.parse(savedRaw)
    expect(saved.douyin_cookie).toBe(encVal('sid_guard=sg; sessionid=ss'))
    expect(savedRaw).not.toContain('sid_guard')
    expect(savedRaw).not.toContain('u-token')
    expect(savedRaw).not.toContain('ntn-access-token')
    expect(saved.api_key).toBe('sk-app-plain')

    // load 自动解回明文供业务使用
    mockExistsSync.mockImplementation((p: string) => p === USER_CONFIG_PATH)
    mockReadFileSync.mockImplementation((p: string) => (p === USER_CONFIG_PATH ? savedRaw : ''))

    const { loadConfig, clearConfigCache } = await import('../src/main/config')
    clearConfigCache()
    const loaded = loadConfig()

    expect(loaded.douyin_cookie).toBe('sid_guard=sg; sessionid=ss')
    expect(loaded.feishu_oauth?.userAccessToken).toBe('u-token')
    expect(loaded.feishu_oauth?.refreshToken).toBe('u-refresh')
    expect(loaded.notion_oauth?.accessToken).toBe('ntn-access-token')
    expect(loaded.notion_oauth?.clientSecret).toBe('ntn-client-secret')
  })

  it('加密不可用：落盘明文回退（与现状一致），load 原样读回', async () => {
    mockIsEncryptionAvailable.mockReturnValue(false)
    mockExistsSync.mockImplementation((p: string) => p === USER_DATA_DIR)

    const { saveConfig } = await import('../src/main/config')
    saveConfig(secretConfig())

    const savedRaw = mockWriteFileSync.mock.calls[0][1] as string
    const saved = JSON.parse(savedRaw)
    expect(saved.douyin_cookie).toBe('sid_guard=sg; sessionid=ss')
    expect(savedRaw).not.toContain('enc:v1:')

    mockExistsSync.mockImplementation((p: string) => p === USER_CONFIG_PATH)
    mockReadFileSync.mockImplementation((p: string) => (p === USER_CONFIG_PATH ? savedRaw : ''))

    const { loadConfig, clearConfigCache } = await import('../src/main/config')
    clearConfigCache()
    const loaded = loadConfig()
    expect(loaded.douyin_cookie).toBe('sid_guard=sg; sessionid=ss')
    expect(loaded.feishu_oauth?.userAccessToken).toBe('u-token')
  })

  it('旧明文配置兼容：load 原样可用；下次 saveConfig 自动转加密', async () => {
    const legacyRaw = JSON.stringify({
      api_key: 'sk-legacy',
      douyin_cookie: 'old-cookie-plain',
      feishu_oauth: { appId: 'cli_fs', userAccessToken: 'old-u-token', refreshToken: 'old-ref' },
      notion_oauth: { clientId: 'cid', clientSecret: 'old-secret', accessToken: 'old-token' },
    })
    mockExistsSync.mockImplementation((p: string) => p === USER_CONFIG_PATH)
    mockReadFileSync.mockImplementation((p: string) => (p === USER_CONFIG_PATH ? legacyRaw : ''))

    const { loadConfig, clearConfigCache } = await import('../src/main/config')
    clearConfigCache()
    const loaded = loadConfig()
    expect(loaded.douyin_cookie).toBe('old-cookie-plain')
    expect(loaded.feishu_oauth?.userAccessToken).toBe('old-u-token')
    expect(loaded.notion_oauth?.accessToken).toBe('old-token')

    // 下次保存自动转加密（不强制迁移，保存时转换）
    mockExistsSync.mockImplementation((p: string) => p === USER_DATA_DIR)
    const { saveConfig } = await import('../src/main/config')
    saveConfig(loaded)

    const savedRaw = mockWriteFileSync.mock.calls[0][1] as string
    expect(savedRaw).toContain('enc:v1:')
    expect(savedRaw).not.toContain('old-cookie-plain')
  })

  it('saveConfig 不修改内存中的明文对象', async () => {
    mockExistsSync.mockImplementation((p: string) => p === USER_DATA_DIR)
    const cfg = secretConfig()

    const { saveConfig } = await import('../src/main/config')
    saveConfig(cfg)

    expect(cfg.douyin_cookie).toBe('sid_guard=sg; sessionid=ss')
    expect(cfg.feishu_oauth?.userAccessToken).toBe('u-token')
  })

  it('loadSafeConfig 防护不变：解密后 config:get 依旧清空全部凭据字段', async () => {
    // 磁盘上是加密值
    const encryptedRaw = JSON.stringify({
      douyin_cookie: encVal('sid_guard=sg; sessionid=ss'),
      feishu_oauth: {
        appId: 'cli_fs',
        appSecret: 'fs-app-secret-plain',
        userAccessToken: encVal('u-token'),
        refreshToken: encVal('u-refresh'),
      },
      notion_oauth: {
        clientId: 'cid',
        clientSecret: encVal('ntn-client-secret'),
        accessToken: encVal('ntn-access-token'),
      },
    })
    mockExistsSync.mockImplementation((p: string) => p === USER_CONFIG_PATH)
    mockReadFileSync.mockImplementation((p: string) => (p === USER_CONFIG_PATH ? encryptedRaw : ''))

    const { loadSafeConfig, clearConfigCache } = await import('../src/main/config')
    clearConfigCache()
    const safe = loadSafeConfig()

    expect(safe.douyin_cookie).toBe('')
    expect(safe.feishu_oauth?.userAccessToken).toBeUndefined()
    expect(safe.feishu_oauth?.refreshToken).toBeUndefined()
    expect(safe.notion_oauth?.accessToken).toBeUndefined()
    expect(safe.notion_oauth?.clientSecret).toBe('')
    // api_key 等非凭据字段不清空
    expect(safe.feishu_oauth?.appId).toBe('cli_fs')
  })

  it('loadSafeConfig 防护不变：磁盘为旧明文时同样清空', async () => {
    const plainRaw = JSON.stringify({
      douyin_cookie: 'plain-cookie',
      feishu_oauth: {
        appId: 'cli_fs',
        userAccessToken: 'plain-u-token',
        refreshToken: 'plain-ref',
      },
      notion_oauth: { clientId: 'cid', clientSecret: 'plain-secret', accessToken: 'plain-token' },
    })
    mockExistsSync.mockImplementation((p: string) => p === USER_CONFIG_PATH)
    mockReadFileSync.mockImplementation((p: string) => (p === USER_CONFIG_PATH ? plainRaw : ''))

    const { loadSafeConfig, clearConfigCache } = await import('../src/main/config')
    clearConfigCache()
    const safe = loadSafeConfig()

    expect(safe.douyin_cookie).toBe('')
    expect(safe.feishu_oauth?.userAccessToken).toBeUndefined()
    expect(safe.notion_oauth?.accessToken).toBeUndefined()
    expect(safe.notion_oauth?.clientSecret).toBe('')
  })
})
