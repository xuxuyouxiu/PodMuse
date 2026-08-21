/**
 * OAuth 本地回调临时 HTTP server —— 监听 127.0.0.1 随机端口，
 * 收 /feishu/callback 与 /notion/callback 的授权 code，拿到即关闭。
 *
 * 设计约束（docs/配置体系优化落地实现方案.md §1.5.3）：
 *   - 只绑定 127.0.0.1（不接受外部网卡连接）；
 *   - 拿到 code 或超时后立即关闭 server，端口占用窗口最小化；
 *   - 纯 Node 模块（仅 http/net），无 Electron 依赖，便于单元测试。
 */

import * as http from 'http'
import type { AddressInfo } from 'net'

export const FEISHU_CALLBACK_PATH = '/feishu/callback'
export const NOTION_CALLBACK_PATH = '/notion/callback'

const CALLBACK_PATHS = new Set([FEISHU_CALLBACK_PATH, NOTION_CALLBACK_PATH])

/** 回调成功后的浏览器落地页（纯静态，无任何凭据回显） */
const SUCCESS_HTML = `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>PodMuse 授权成功</title></head>
<body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
  <div style="text-align: center;">
    <h2>✓ 授权成功</h2>
    <p>可以关闭本页面，回到 PodMuse 继续操作。</p>
  </div>
</body>
</html>`

export interface CallbackServer {
  /** 实际监听端口（127.0.0.1 随机端口） */
  port: number
  /**
   * 等待回调 code：state 校验（如配置 expectedState）通过后 resolve 出 code 并关闭 server；
   * 超时 resolve null 并关闭 server。重复调用在已关闭后立即 resolve null。
   */
  waitForCode(timeoutMs: number): Promise<string | null>
  /** 主动关闭（放弃等待，未决的 waitForCode 立即 resolve null） */
  close(): void
}

export interface CallbackServerOptions {
  /** 校验回调携带的 state；不匹配时返回 400 并继续等待（防 CSRF/误发） */
  expectedState?: string
  /** 指定监听端口（缺省随机）；固定端口用于平台后台预登记 redirect_uri */
  port?: number
}

export function startCallbackServer(options: CallbackServerOptions = {}): Promise<CallbackServer> {
  return new Promise((resolve, reject) => {
    const waiters: { resolve: (code: string | null) => void; timer: NodeJS.Timeout }[] = []
    let settled = false

    const settle = (code: string | null) => {
      if (settled) return
      settled = true
      for (const w of waiters) {
        clearTimeout(w.timer)
        w.resolve(code)
      }
      waiters.length = 0
    }

    const server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', 'http://127.0.0.1')
        if (!CALLBACK_PATHS.has(reqUrl.pathname) || req.method !== 'GET') {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('Not Found')
          return
        }

        const code = reqUrl.searchParams.get('code')
        const state = reqUrl.searchParams.get('state')

        if (!code) {
          // 无 code（如用户拒绝授权的 error 回跳）：保持监听，等待超时兜底
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('missing code')
          return
        }

        if (options.expectedState && state !== options.expectedState) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
          res.end('state mismatch')
          return
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(SUCCESS_HTML)
        // 拿到即关闭
        settle(code)
        server.close(() => {})
      } catch {
        // 响应写出异常（客户端提前断开等）不影响 server 生命周期
      }
    })

    server.on('error', err => {
      settle(null)
      reject(err)
    })

    server.listen(options.port ?? 0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port
      resolve({
        port,
        waitForCode(timeoutMs: number): Promise<string | null> {
          if (settled) return Promise.resolve(null)
          return new Promise<string | null>(resolveCode => {
            const waiter = {
              resolve: resolveCode,
              timer: setTimeout(() => {
                // 超时：settle 统一 resolve 所有未决 waiter（含自身）并以 null 收尾
                settle(null)
                server.close(() => {})
              }, timeoutMs),
            }
            waiters.push(waiter)
          })
        },
        close(): void {
          settle(null)
          server.close(() => {})
        },
      })
    })
  })
}
