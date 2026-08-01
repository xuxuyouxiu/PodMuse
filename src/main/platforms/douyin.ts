/** 抖音（Douyin）平台适配器 — 通过 Python 子进程调用 douyin-downloader */

import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import type { PlatformAdapter, AudioExtractResult } from './types'

/** douyin-downloader 项目路径（优先用环境变量，否则用默认路径） */
function getDownloaderPath(): string {
  return process.env.DOUYIN_DOWNLOADER_PATH || 'G:\\douyin-downloader-main'
}

/** 从 douyin-downloader 的输出目录找最新的音频文件 */
function findLatestAudio(downloadDir: string): string | null {
  try {
    const entries = fs.readdirSync(downloadDir, { withFileTypes: true })
    const audioExts = ['.mp3', '.m4a', '.wav', '.aac', '.flac', '.mp4']
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

    // 按修改时间降序，返回最新的
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
    const runScript = path.join(downloaderPath, 'run.py')

    // 检查下载器是否存在
    if (!fs.existsSync(runScript)) {
      throw new Error(
        `抖音下载器未找到。请设置环境变量 DOUYIN_DOWNLOADER_PATH 指向 douyin-downloader 项目目录，\n` +
        `或将项目放在 G:\\douyin-downloader-main。\n` +
        `项目地址: https://github.com/jiji262/douyin-downloader`
      )
    }

    // 准备下载目录
    const downloadDir = path.join(downloaderPath, 'Downloaded')
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true })
    }

    // 记录下载前的文件列表，用于识别新文件
    const beforeFiles = new Set<string>()
    try {
      const entries = fs.readdirSync(downloadDir)
      for (const e of entries) beforeFiles.add(e)
    } catch {}

    // 调用 Python 下载器
    const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
      const proc = spawn('python', [runScript, '--url', url], {
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
        reject(new Error(`启动抖音下载器失败: ${err.message}。请确认已安装 Python 和依赖 (pip install -r requirements.txt)`))
      })
    })

    if (result.code !== 0) {
      throw new Error(`抖音下载器退出码 ${result.code}: ${result.stderr.slice(0, 300)}`)
    }

    // 找到新下载的音频文件
    const audioFile = findLatestAudio(downloadDir)
    if (!audioFile) {
      // 也检查子目录（folderstyle 模式下文件在子目录中）
      const subDirs = fs.readdirSync(downloadDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => path.join(downloadDir, d.name))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)

      for (const sub of subDirs) {
        const found = findLatestAudio(sub)
        if (found) {
          return {
            type: 'direct_url',
            audioUrl: found,
            metadata: { platform: 'douyin' },
          }
        }
      }

      throw new Error('抖音下载完成但未找到音频文件，请检查下载目录: ' + downloadDir)
    }

    return {
      type: 'direct_url',
      audioUrl: audioFile,
      metadata: { platform: 'douyin' },
    }
  }

  getDedupKey(url: string): string | null {
    // 抖音视频 ID：/video/1234567890
    const videoMatch = url.match(/\/video\/(\d+)/)
    if (videoMatch) return `douyin:${videoMatch[1]}`

    // 抖音图文 ID：/note/1234567890
    const noteMatch = url.match(/\/note\/(\d+)/)
    if (noteMatch) return `douyin:${noteMatch[1]}`

    // 短链：用完整 URL 做 key
    const shortMatch = url.match(/v\.douyin\.com\/[\w]+/)
    if (shortMatch) return `douyin:short:${shortMatch[0]}`

    return null
  }
}
