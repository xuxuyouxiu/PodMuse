import { describe, it, expect, vi, afterEach } from 'vitest'
import { FeishuClient } from '../src/main/feishu-client'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('FeishuClient.listChats（Chat ID 免复制：自动拉取机器人所在群列表）', () => {
  it('鉴权后解析群列表（chat_id + name，空名兜底、无 id 过滤）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = String(input)
        if (url.includes('/auth/v3/tenant_access_token/internal')) {
          return jsonResponse(200, { code: 0, tenant_access_token: 't-token' })
        }
        if (url.includes('/im/v1/chats')) {
          return jsonResponse(200, {
            code: 0,
            data: {
              items: [
                { chat_id: 'oc_1', name: '播客群' },
                { chat_id: 'oc_2', name: '' },
                { chat_id: '', name: '应被过滤' },
              ],
            },
          })
        }
        return jsonResponse(404, { code: 9999, msg: 'not found' })
      }),
    )

    const client = new FeishuClient('cli_1', 'secret_1', () => {})
    expect(await client.ensureToken()).toBe(true)
    const chats = await client.listChats()
    expect(chats).toEqual([
      { chatId: 'oc_1', name: '播客群' },
      { chatId: 'oc_2', name: '(未命名群)' },
    ])
  })

  it('接口返回错误（未开通 im:chat:readonly 等）→ 返回空数组不抛异常', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { code: 99991663, msg: 'no permission' })),
    )
    const client = new FeishuClient('cli_x', 'secret_x', () => {})
    expect(await client.listChats()).toEqual([])
  })
})
