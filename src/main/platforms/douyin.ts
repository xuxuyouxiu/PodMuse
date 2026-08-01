/** 抖音（Douyin）平台适配器 — 使用 yt-dlp + 用户配置的 Cookie 下载 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { PlatformAdapter, AudioExtractResult } from './types'
import { extractAudioWithYtDlp, detectYtDlp } from './yt-dlp'
import { loadConfig } from '../config'

export class DouyinAdapter implements PlatformAdapter {
  id = 'douyin'
  name = '抖音'
  urlPattern = /^https?:\/\/(www\.|v\.)?(douyin\.com|iesdouyin\.com)/i

  match(url: string): boolean {
    return this.urlPattern.test(url) || /^https?:\/\/v\.douyin\.com\//i.test(url)
  }

  async extractAudio(url: string, signal?: AbortSignal): Promise<AudioExtractResult> {
    // 检查 yt-dlp
    const status = await detectYtDlp()
    if (!status.available) {
      throw new Error('yt-dlp 未安装，请在设置中配置 yt-dlp 路径')
    }

    // 读取抖音 Cookie
    const config = loadConfig()
    const cookieStr = config.douyin_cookie?.trim()

    if (!cookieStr) {
      throw new Error(
        '请先在「设置 → 抖音」中配置抖音 Cookie。\n' +
        '获取方式：用浏览器登录抖音 → F12 开发者工具 → Application → Cookies → 复制所有 Cookie 值'
      )
    }

    // 把 Cookie 字符串转为 Netscape cookie 文件
    const cookieFile = this.writeCookieFile(cookieStr)

    try {
      // 用 yt-dlp + cookie 文件下载
      const tmpDir = require("os").tmpdir()
      const tmpName = "douyin_" + Date.now()
      const result = await extractAudioWithYtDlp(status.path!, url, tmpDir, tmpName, undefined, signal, cookieFile)
      return {
        type: 'direct_url',
        audioUrl: result,
        metadata: { platform: 'douyin' },
      }
    } finally {
      // 清理临时 cookie 文件
      try { fs.unlinkSync(cookieFile) } catch {}
    }
  }

  /** 将 Cookie 字符串转为 Netscape 格式的临时文件 */
  private writeCookieFile(cookieStr: string): string {
    // 支持两种格式：
    // 1. "name1=value1; name2=value2" 格式
    // 2. 直接是 Netscape 格式
    let content = '# Netscape HTTP Cookie File\n'

    if (cookieStr.includes('\t')) {
      // 已经是 Netscape 格式
      content = cookieStr
    } else {
      // 解析 "name=value; name=value" 格式
      const pairs = cookieStr.split(';').map(s => s.trim()).filter(Boolean)
      for (const pair of pairs) {
        const eqIdx = pair.indexOf('=')
        if (eqIdx === -1) continue
        const name = pair.slice(0, eqIdx).trim()
        const value = pair.slice(eqIdx + 1).trim()
        content += `.douyin.com\tTRUE\t/\tFALSE\t0\t${name}\t${value}\n`
      }
    }

    const tmpFile = path.join(os.tmpdir(), `douyin_cookies_${Date.now()}.txt`)
    fs.writeFileSync(tmpFile, content, 'utf-8')
    return tmpFile
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
