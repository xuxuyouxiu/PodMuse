import { describe, it, expect } from 'vitest'
import { isDouyinShortUrl, resolveDouyinShortUrl } from '../src/main/platforms/douyin'

describe('isDouyinShortUrl：抖音分享短链识别', () => {
  it('v.douyin.com 短链为真', () => {
    expect(isDouyinShortUrl('https://v.douyin.com/iRNBho6u/')).toBe(true)
    expect(isDouyinShortUrl('http://v.douyin.com/abc123')).toBe(true)
  })

  it('完整链接与其它平台为假', () => {
    expect(isDouyinShortUrl('https://www.douyin.com/video/7601234567890123456')).toBe(false)
    expect(isDouyinShortUrl('https://www.xiaoyuzhoufm.com/podcast/abc')).toBe(false)
    expect(isDouyinShortUrl('https://www.youtube.com/watch?v=x')).toBe(false)
    expect(isDouyinShortUrl('')).toBe(false)
  })
})

function mockFetchWith(
  impl: (url: string, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return impl as unknown as typeof fetch
}

function jsonResponse(finalUrl: string, body = ''): Response {
  return {
    url: finalUrl,
    status: 200,
    text: async () => body,
  } as unknown as Response
}

describe('resolveDouyinShortUrl：短链解析', () => {
  const cookie = 'sessionid=ss'

  it('302 后 res.url 为完整 video 链接时直接返回', async () => {
    const fetchFn = mockFetchWith(async () =>
      jsonResponse('https://www.douyin.com/video/7601234567890123456'),
    )
    const out = await resolveDouyinShortUrl('https://v.douyin.com/iRNBho6u/', cookie, undefined, fetchFn)
    expect(out).toBe('https://www.douyin.com/video/7601234567890123456')
  })

  it('最终 URL 不规范时从响应 HTML 兜底提取', async () => {
    const fetchFn = mockFetchWith(async () =>
      jsonResponse(
        'https://www.douyin.com/?item_ids=7601234567890123456',
        '<a href="https://www.douyin.com/video/7601234567890123456">视频</a>',
      ),
    )
    const out = await resolveDouyinShortUrl('https://v.douyin.com/x/', cookie, undefined, fetchFn)
    expect(out).toBe('https://www.douyin.com/video/7601234567890123456')
  })

  it('解析失败返回 null（调用方给出可行动提示）', async () => {
    const fetchFn = mockFetchWith(async () =>
      jsonResponse('https://www.douyin.com/', '<html>verify</html>'),
    )
    const out = await resolveDouyinShortUrl('https://v.douyin.com/x/', cookie, undefined, fetchFn)
    expect(out).toBeNull()
  })

  it('网络异常返回 null 不抛错', async () => {
    const fetchFn = mockFetchWith(async () => {
      throw new TypeError('fetch failed')
    })
    const out = await resolveDouyinShortUrl('https://v.douyin.com/x/', cookie, undefined, fetchFn)
    expect(out).toBeNull()
  })

  it('请求带浏览器 UA 与登录 cookie', async () => {
    let captured: RequestInit | undefined
    const fetchFn = mockFetchWith(async (_url, init) => {
      captured = init
      return jsonResponse('https://www.douyin.com/video/1')
    })
    await resolveDouyinShortUrl('https://v.douyin.com/x/', cookie, undefined, fetchFn)
    const headers = captured?.headers as Record<string, string>
    expect(headers['User-Agent']).toContain('Chrome/')
    expect(headers['Cookie']).toBe(cookie)
  })
})
