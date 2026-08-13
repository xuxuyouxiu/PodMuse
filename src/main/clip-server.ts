/**
 * 浏览器扩展本地接收服务 — 监听 127.0.0.1 固定端口
 * 仅接受 chrome-extension:// Origin 的 POST /clip 请求（防恶意网页 CSRF）
 */

import { createServer, type Server } from 'node:http'

export const CLIP_SERVER_PORT = 41987

let server: Server | null = null

export function startClipServer(handle: (url: string) => void): Server {
  if (server) return server
  server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    // 安全校验：只接受浏览器扩展（chrome-extension:// 开头）的请求
    const origin = req.headers.origin || ''
    if (!origin.startsWith('chrome-extension://')) {
      res.writeHead(403)
      res.end(JSON.stringify({ ok: false, error: 'forbidden origin' }))
      return
    }
    let body = ''
    req.on('data', c => {
      body += c
      if (body.length > 64 * 1024) req.destroy()
    })
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}')
        const url = typeof data.url === 'string' ? data.url.trim() : ''
        if (url && /^https?:\/\//i.test(url)) {
          handle(url)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: true }))
        } else {
          res.writeHead(400)
          res.end(JSON.stringify({ ok: false, error: 'invalid url' }))
        }
      } catch {
        res.writeHead(400)
        res.end(JSON.stringify({ ok: false, error: 'bad json' }))
      }
    })
  })
  server.listen(CLIP_SERVER_PORT, '127.0.0.1')
  console.log(`[clip-server] listening on 127.0.0.1:${CLIP_SERVER_PORT}`)
  return server
}

export function stopClipServer(): void {
  if (server) {
    server.close()
    server = null
  }
}
