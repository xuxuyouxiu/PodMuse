/** 抖音（Douyin）平台适配器 — 通过 Python 脚本调用 douyin-downloader */

import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import type { PlatformAdapter, AudioExtractResult } from './types'

/** douyin-downloader 项目路径 */
function getDownloaderPath(): string {
  // 优先用环境变量
  if (process.env.DOUYIN_DOWNLOADER_PATH) return process.env.DOUYIN_DOWNLOADER_PATH
  // 默认路径
  return 'G:\\douyin-downloader-main'
}

/** 获取 Python 可执行文件 */
function getPythonPath(): string {
  return process.env.DOUYIN_PYTHON || 'python'
}

/** 从输出目录找最新的音频文件 */
function findLatestAudio(downloadDir: string): string | null {
  try {
    if (!fs.existsSync(downloadDir)) return null
    const entries = fs.readdirSync(downloadDir, { withFileTypes: true })
    const audioExts = ['.mp3', '.m4a', '.wav', '.aac', '.flac']
    const audioFiles: { name: string; mtime: number }[] = []

    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (audioExts.includes(ext)) {
          const fullPath = path.join(downloadDir, entry.name)
          const stat = fs.statSync(fullPath)
          audioFiles.push({ name: fullPath, mtime: stat.mtimeMs })
        }
      }
    }

    audioFiles.sort((a, b) => b.mtime - a.mtime)
    return audioFiles[0]?.name || null
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
    const downloaderPath = getDownloaderPath()
    const scriptPath = path.join(downloaderPath, 'douyin-cli.py')

    // 检查脚本是否存在
    if (!fs.existsSync(scriptPath)) {
      throw new Error(
        `抖音下载脚本未找到。请设置环境变量 DOUYIN_DOWNLOADER_PATH 指向 douyin-downloader 目录，\n` +
        `或将项目放在 G:\\douyin-downloader-main。\n` +
        `需要 Python 3.8+ 和依赖：pip install -r requirements.txt`
      )
    }

    // 准备输出目录
    const downloadDir = path.join(downloaderPath, 'Downloaded')
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true })
    }

    // 调用 Python 脚本
    const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
      const proc = spawn(getPythonPath(), [scriptPath, url, '--output', downloadDir], {
        cwd: downloaderPath,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
      proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

      signal?.addEventListener('abort', () => {
        proc.kill()
        reject(new Error('用户取消'))
      }, { once: true })

      proc.on('close', (code) => {
        resolve({ code: code ?? 1, stdout, stderr })
      })

      proc.on('error', (err) => {
        reject(new Error(`启动 Python 失败: ${err.message}。请确认已安装 Python 3.8+ 和依赖。`))
      })
    })

    // 解析 JSON 输出
    let downloadResult: { success?: boolean; error?: string } = {}
    try {
      const lines = result.stdout.trim().split('\n')
      downloadResult = JSON.parse(lines[lines.length - 1])
    } catch {}

    if (!downloadResult.success) {
      throw new Error(downloadResult.error || `抖音下载失败 (exit ${result.code}): ${result.stderr.slice(0, 200)}`)
    }

    // 找到新下载的音频文件
    const audioFile = findLatestAudio(downloadDir)
    if (!audioFile) {
      throw new Error('抖音下载完成但未找到音频文件')
    }

    return {
      type: 'direct_url',
      audioUrl: audioFile,
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
