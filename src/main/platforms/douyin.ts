/** 抖音（Douyin）平台适配器 — 通过 Python 脚本调用 douyin-downloader */

import { spawn } from 'child_process'
import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'
import type { PlatformAdapter, AudioExtractResult } from './types'
import { loadConfig } from '../config'

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
      const proc = spawn('python', [scriptPath, url, '--output', downloadDir], {
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
      throw new Error(downloadResult.error || `抖音下载失败 (exit ${result.code})`)
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
