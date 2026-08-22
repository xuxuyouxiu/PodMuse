/** 抖音（Douyin）平台适配器 — 通过 Python 脚本调用 douyin-downloader */

import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { getFreshDouyinCookie, markDouyinExpired, syncDouyinDownloaderCookie } from '../douyin-auth'
import type { PlatformAdapter, AudioExtractResult } from './types'

/** 抖音分享短链（v.douyin.com/xxx） */
const SHORT_URL_RE = /^https?:\/\/v\.douyin\.com\//i

const DOUYIN_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'

export function isDouyinShortUrl(url: string): boolean {
  return SHORT_URL_RE.test((url || '').trim())
}

/**
 * 解析抖音分享短链：跟随 302 拿最终 www.douyin.com/video|note/{id} 链接。
 * 带浏览器 UA + 登录 cookie（裸请求易被风控拦截）；最终 URL 不含规范路径时，
 * 兜底从响应 HTML 里提取。全部失败返回 null（调用方给出可行动的错误提示）。
 */
export async function resolveDouyinShortUrl(
  url: string,
  cookie: string,
  signal?: AbortSignal,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const res = await fetchFn(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': DOUYIN_UA, Cookie: cookie },
      signal,
    })
    const body = await res.text().catch(() => '')
    const candidates = [res.url || '', '']
    for (const m of body.matchAll(/https?:\/\/www\.douyin\.com\/(?:video|note)\/\d+[^\s"'<>]*/g)) {
      candidates.push(m[0])
    }
    for (const c of candidates) {
      if (c && /www\.douyin\.com\/(video|note)\/\d+/.test(c)) return c
    }
    return null
  } catch {
    return null
  }
}

/** douyin-downloader 路径 */
function getDownloaderPath(): string {
  return process.env.DOUYIN_DOWNLOADER_PATH || 'G:\\douyin-downloader-main'
}

/** 找最新的音频文件 */
function findLatestAudio(dir: string): string | null {
  try {
    if (!fs.existsSync(dir)) return null
    const audioExts = ['.mp3', '.m4a', '.wav', '.aac', '.flac', '.mp4']
    const files: { name: string; mtime: number }[] = []

    function walk(d: string) {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const fullPath = path.join(d, entry.name)
        if (entry.isDirectory()) {
          walk(fullPath)
        } else if (entry.isFile() && audioExts.includes(path.extname(entry.name).toLowerCase())) {
          files.push({ name: fullPath, mtime: fs.statSync(fullPath).mtimeMs })
        }
      }
    }
    walk(dir)

    files.sort((a, b) => b.mtime - a.mtime)
    return files[0]?.name || null
  } catch {
    return null
  }
}

export class DouyinAdapter implements PlatformAdapter {
  id = 'douyin'
  name = '抖音'
  urlPattern = /^https?:\/\/(www\.|v\.)?(douyin\.com|iesdouyin\.com)/i

  match(url: string): boolean {
    return this.urlPattern.test(url) || /^https?:\/\/v\.douyin\.com\//i.test(url)
  }

  async extractAudio(url: string, signal?: AbortSignal): Promise<AudioExtractResult> {
    // 用时取鲜：会话 cookie 优先，回退配置冻结串；两者都不可用才判「已失效」提示重登。
    // 拿到有效 cookie 后同步进 douyin-downloader 的 config.yml（下载器读它）。
    const cookie = await getFreshDouyinCookie()
    if (!cookie) {
      markDouyinExpired()
      throw new Error('抖音登录已失效，请重新登录')
    }
    syncDouyinDownloaderCookie(cookie)

    // 短链（v.douyin.com/xxx）先在主进程解析为完整链接：下载器的裸客户端解析
    // 常被风控拦截，失败时只会静默跳过并报「不支持的类型: short」，用户无法理解。
    let targetUrl = url
    if (isDouyinShortUrl(url)) {
      const resolved = await resolveDouyinShortUrl(url, cookie, signal)
      if (!resolved) {
        throw new Error(
          '抖音短链解析失败：请打开分享链接后复制浏览器地址栏的完整链接（www.douyin.com/video/…）重试',
        )
      }
      targetUrl = resolved
    }

    const downloaderPath = getDownloaderPath()
    const scriptPath = path.join(downloaderPath, 'douyin-cli.py')

    if (!fs.existsSync(scriptPath)) {
      throw new Error(
        '需要安装 Python 和 douyin-downloader 才能下载抖音视频。\n' +
        '1. 安装 Python 3.8+\n' +
        '2. 下载 https://github.com/jiji262/douyin-downloader\n' +
        '3. pip install -r requirements.txt\n' +
        '4. 在 config.yml 中配置 cookies'
      )
    }

    // 使用 douyin-downloader 的 Downloaded 目录
    const downloadDir = path.join(downloaderPath, 'Downloaded')
    if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true })

    // 调用 Python
    const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
      const proc = spawn('python', [scriptPath, targetUrl, '--output', downloadDir], {
        cwd: downloaderPath,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = '', stderr = ''
      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

      signal?.addEventListener('abort', () => { proc.kill(); reject(new Error('用户取消')) }, { once: true })
      proc.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
      proc.on('error', (err) => reject(new Error(`启动 Python 失败: ${err.message}`)))
    })

    let downloadResult: { success?: boolean; error?: string } = {}
    try {
      const lines = result.stdout.trim().split('\n')
      downloadResult = JSON.parse(lines[lines.length - 1])
    } catch {}

    if (!downloadResult.success) {
      // 优先取脚本 JSON 的 error；脚本崩溃（无 JSON）时带上 stderr 摘要，避免只剩 "exit 1"
      const stderrBrief = result.stderr.trim().split('\n').slice(-3).join(' | ').slice(0, 300)
      throw new Error(
        downloadResult.error ||
        `抖音下载失败 (exit ${result.code})${stderrBrief ? '：' + stderrBrief : ''}`,
      )
    }

    const audioFile = findLatestAudio(downloadDir)
    if (!audioFile) throw new Error('抖音下载完成但未找到音频文件')

    // 从文件名提取标题（格式：日期_标题.mp4 或 日期_标题_ID.mp4）
    const fileName = path.basename(audioFile, path.extname(audioFile))
    let title = fileName
    // 去掉日期前缀（2026-08-01_）
    const dateMatch = title.match(/^\d{4}-\d{2}-\d{2}_(.+)$/)
    if (dateMatch) title = dateMatch[1]
    // 去掉末尾的 ID（_1234567890）
    title = title.replace(/_\d{15,}$/, '').trim()

    return {
      type: 'direct_url',
      audioUrl: audioFile,
      title: title || undefined,
      metadata: { platform: 'douyin' },
    }
  }

  getDedupKey(url: string): string | null {
    const videoMatch = url.match(/\/video\/(\d+)/)
    if (videoMatch) return `douyin:${videoMatch[1]}`
    const noteMatch = url.match(/\/note\/(\d+)/)
    if (noteMatch) return `douyin:${noteMatch[1]}`
    const shortMatch = url.match(/v\.douyin\.com\/[\w]+/)
    if (shortMatch) return `douyin:short:${shortMatch[0]}`
    return null
  }
}
