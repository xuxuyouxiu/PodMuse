/** 抖音（Douyin）平台适配器 — 通过打包的 douyin-cli.exe 下载音频 */

import { spawn } from 'child_process'
import * as path from 'path'
import { app } from 'electron'
import * as fs from 'fs'
import type { PlatformAdapter, AudioExtractResult } from './types'

/** 获取 douyin-cli.exe 路径（打包后在 resources/douyin/ 下） */
function getDouyinCliPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'douyin', 'douyin-cli.exe')
  }
  // 开发模式：从项目根目录找
  return path.join(__dirname, '..', '..', '..', 'resources', 'douyin', 'douyin-cli.exe')
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
    const cliPath = getDouyinCliPath()

    // 检查 exe 是否存在
    if (!fs.existsSync(cliPath)) {
      throw new Error(
        '抖音下载组件未找到。请重新安装播客笔记助手，或联系开发者。'
      )
    }

    // 准备输出目录（放在 userData 下）
    const downloadDir = path.join(app.getPath('userData'), '_douyin_temp')
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true })
    }

    // 记录下载前的文件列表
    const beforeFiles = new Set<string>()
    try {
      for (const e of fs.readdirSync(downloadDir)) beforeFiles.add(e)
    } catch {}

    // 调用 douyin-cli.exe
    const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
      const proc = spawn(cliPath, [url, '--output', downloadDir], {
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
        reject(new Error(`启动抖音下载组件失败: ${err.message}`))
      })
    })

    // 解析 JSON 输出
    let downloadResult: { success?: boolean; error?: string } = {}
    try {
      // stdout 的最后一行是 JSON
      const lines = result.stdout.trim().split('\n')
      downloadResult = JSON.parse(lines[lines.length - 1])
    } catch {
      // JSON 解析失败，尝试找文件
    }

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
