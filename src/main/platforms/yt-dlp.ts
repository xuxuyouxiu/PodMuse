/** yt-dlp 检测、版本管理与音视频提取 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawn } from 'child_process'

const MIN_VERSION = '2024.01.01'

function findYtDlpPath(): string | null {
  // 1) portable data 目录
  try {
    const { app } = require('electron')
    const userDataDir = app.getPath('userData')
    const portableDir = path.join(path.dirname(path.dirname(userDataDir)), 'data')
    const candidates = ['yt-dlp.exe', 'yt-dlp']
    for (const name of candidates) {
      const p = path.join(portableDir, name)
      if (fs.existsSync(p)) return p
    }
  } catch {}

  // 2) 应用根目录
  try {
    const appRoot = path.dirname(process.execPath)
    const candidates = ['yt-dlp.exe', 'yt-dlp']
    for (const name of candidates) {
      const p = path.join(appRoot, name)
      if (fs.existsSync(p)) return p
    }
  } catch {}

  // 3) 用户级工具目录（跨平台）
  try {
    const home = process.env.USERPROFILE || process.env.HOME || ''
    if (home) {
      const userDirs = [path.join(home, 'tools'), path.join(home, '.local', 'bin')]
      const candidates = process.platform === 'win32' ? ['yt-dlp.exe'] : ['yt-dlp']
      for (const dir of userDirs) {
        for (const name of candidates) {
          const p = path.join(dir, name)
          if (fs.existsSync(p)) return p
        }
      }
    }
  } catch {}

  // 4) 系统 PATH
  try {
    const isWin = process.platform === 'win32'
    const cmd = isWin ? 'where yt-dlp' : 'which yt-dlp'
    const result = require('child_process')
      .execSync(cmd, { encoding: 'utf-8', timeout: 5000 })
      .trim()
    if (result) return result.split('\n')[0].trim()
  } catch {}

  return null
}

export interface YtDlpStatus {
  available: boolean
  path: string | null
  version: string | null
  outdated: boolean
}

export function detectYtDlp(): YtDlpStatus {
  const exePath = findYtDlpPath()
  if (!exePath) return { available: false, path: null, version: null, outdated: false }

  try {
    const version = require('child_process')
      .execSync(`"${exePath}" --version`, { encoding: 'utf-8', timeout: 5000 })
      .trim()

    const outdated = version < MIN_VERSION
    return { available: true, path: exePath, version, outdated }
  } catch {
    return { available: false, path: exePath, version: null, outdated: false }
  }
}

/** 自动从 GitHub 下载 yt-dlp 到本地 */
export async function autoDownloadYtDlp(
  onProgress?: (msg: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const isWin = process.platform === 'win32'
  const binaryName = isWin ? 'yt-dlp.exe' : 'yt-dlp'

  // 1) 查询最新版本
  onProgress?.('查询最新版本...')
  const apiResp = await fetch('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest', {
    headers: { Accept: 'application/vnd.github.v3+json' },
    signal,
  })
  if (!apiResp.ok) throw new Error(`GitHub API 请求失败: ${apiResp.status}`)
  const release = (await apiResp.json()) as {
    tag_name: string
    assets: { name: string; browser_download_url: string; size: number }[]
  }
  const asset = release.assets.find((a: { name: string }) => a.name === binaryName)
  if (!asset) throw new Error(`未找到 ${binaryName} 下载资源`)

  // 2) 确定保存目录（portable data > userData）
  let saveDir: string
  try {
    const { app } = require('electron')
    const userDataDir = app.getPath('userData')
    saveDir = path.join(path.dirname(path.dirname(userDataDir)), 'data')
    if (!fs.existsSync(saveDir)) {
      saveDir = app.getPath('userData')
    }
  } catch {
    // 非 Electron 环境，存到用户工具目录
    const home = process.env.USERPROFILE || process.env.HOME || '.'
    saveDir = path.join(home, 'tools')
  }
  fs.mkdirSync(saveDir, { recursive: true })

  // 3) 下载
  onProgress?.(`下载 yt-dlp ${release.tag_name}...`)
  const dlResp = await fetch(asset.browser_download_url, { signal })
  if (!dlResp.ok) throw new Error(`下载失败: ${dlResp.status}`)
  if (!dlResp.body) throw new Error('下载响应为空')

  const totalSize = asset.size || Number(dlResp.headers.get('content-length')) || 0
  const savePath = path.join(saveDir, binaryName)
  const tmpPath = savePath + '.downloading'
  const writer = fs.createWriteStream(tmpPath)
  const reader = dlResp.body.getReader()
  let downloaded = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (signal?.aborted) {
      writer.close()
      fs.unlinkSync(tmpPath)
      throw new Error('已取消')
    }
    writer.write(value)
    downloaded += value.length
    if (totalSize > 0) {
      const pct = Math.round((downloaded / totalSize) * 100)
      onProgress?.(
        `下载中 ${pct}% (${(downloaded / 1048576).toFixed(1)}/${(totalSize / 1048576).toFixed(1)} MB)`,
      )
    }
  }

  await new Promise<void>((resolve, reject) => {
    writer.end((err?: Error) => (err ? reject(err) : resolve()))
  })

  // 4) 替换旧文件
  if (fs.existsSync(savePath)) fs.unlinkSync(savePath)
  fs.renameSync(tmpPath, savePath)
  // 非 Windows 加执行权限
  if (!isWin) fs.chmodSync(savePath, 0o755)

  onProgress?.(`下载完成: ${savePath}`)
  return savePath
}

/** 使用 yt-dlp 提取音频到指定目录 */
export function extractAudioWithYtDlp(
  ytDlpPath: string,
  videoUrl: string,
  outputDir: string,
  outputName: string,
  onLog?: (msg: string) => void,
  signal?: AbortSignal,
  cookieFile?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputTemplate = outputDir && outputName
      ? path.join(outputDir, `${outputName}.%(ext)s`)
      : path.join(os.tmpdir(), `podcast_dl_${Date.now()}.%(ext)s`)
    const args = [
      '--extract-audio',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '0',
      '-o',
      outputTemplate,
      '--no-playlist',
      ...(cookieFile ? ['--cookies', cookieFile] : []),
      videoUrl,
    ]

    const proc = spawn(ytDlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let outputPath = ''

    proc.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim()
      onLog?.(line)
      // 捕获输出文件路径
      const match =
        line.match(/\[Merger\] Merging formats into "(.+)"/) || line.match(/Destination: (.+)/)
      if (match) outputPath = match[1]
    })

    proc.stderr?.on('data', (data: Buffer) => {
      onLog?.(data.toString().trim())
    })

    if (signal) {
      signal.addEventListener('abort', () => {
        proc.kill('SIGTERM')
        reject(new Error('已取消'))
      })
    }

    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`yt-dlp 退出码 ${code}`))
        return
      }
      // 如果未从日志捕获路径，查找 .mp3 文件
      if (!outputPath || !fs.existsSync(outputPath)) {
        const mp3Path = path.join(outputDir, `${outputName}.mp3`)
        if (fs.existsSync(mp3Path)) {
          outputPath = mp3Path
        } else {
          reject(new Error('yt-dlp 未生成音频文件'))
          return
        }
      }
      resolve(outputPath)
    })

    proc.on('error', err => {
      reject(new Error(`yt-dlp 启动失败: ${err.message}`))
    })
  })
}

/** 使用 yt-dlp 获取视频元数据（JSON） */
export function getYtDlpMetadata(
  ytDlpPath: string,
  videoUrl: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const args = ['--dump-json', '--no-download', '--no-playlist', videoUrl]
    const proc = spawn(ytDlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
    })
    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`yt-dlp metadata 退出码 ${code}`))
        return
      }
      try {
        resolve(JSON.parse(stdout))
      } catch {
        reject(new Error('yt-dlp metadata JSON 解析失败'))
      }
    })
    proc.on('error', err => reject(err))
  })
}

/** 使用 yt-dlp 提取字幕 */
export function extractSubtitles(
  ytDlpPath: string,
  videoUrl: string,
  outputDir: string,
  outputName: string,
  langs: string[] = ['zh-Hans', 'zh', 'zh-CN', 'en'],
  onLog?: (msg: string) => void,
  signal?: AbortSignal,
): Promise<string | null> {
  return new Promise(resolve => {
    const outputTemplate = path.join(outputDir, `${outputName}.%(ext)s`)
    const args = [
      '--write-auto-sub',
      '--write-sub',
      '--sub-lang',
      langs.join(','),
      '--sub-format',
      'vtt/srt/best',
      '--skip-download',
      '-o',
      outputTemplate,
      '--no-playlist',
      videoUrl,
    ]

    const proc = spawn(ytDlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let subtitlePath = ''

    proc.stdout?.on('data', (data: Buffer) => {
      const line = data.toString().trim()
      onLog?.(line)
      // 检测字幕文件路径
      for (const lang of langs) {
        const patterns = [`${outputName}.${lang}.vtt`, `${outputName}.${lang}.srt`]
        for (const p of patterns) {
          if (line.includes(p)) {
            subtitlePath = path.join(outputDir, p)
          }
        }
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      onLog?.(data.toString().trim())
    })

    if (signal) {
      signal.addEventListener('abort', () => {
        proc.kill('SIGTERM')
        resolve(null)
      })
    }

    proc.on('close', () => {
      // 查找生成的字幕文件
      if (subtitlePath && fs.existsSync(subtitlePath)) {
        resolve(subtitlePath)
        return
      }
      // 按优先级搜索
      for (const lang of langs) {
        for (const ext of ['vtt', 'srt']) {
          const p = path.join(outputDir, `${outputName}.${lang}.${ext}`)
          if (fs.existsSync(p)) {
            resolve(p)
            return
          }
        }
      }
      resolve(null)
    })

    proc.on('error', () => resolve(null))
  })
}

/** 解析 VTT/SRT 字幕文件为纯文本 */
export function parseSubtitleToText(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    const textLines: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      // 跳过空行、时间轴行、序号行、VTT 头
      if (!trimmed) continue
      if (trimmed === 'WEBVTT' || trimmed.startsWith('Kind:') || trimmed.startsWith('Language:'))
        continue
      if (/^\d+$/.test(trimmed)) continue
      if (/^\d{2}:\d{2}/.test(trimmed) && trimmed.includes('-->')) continue
      if (/^NOTE/.test(trimmed)) continue
      if (/^Style:/.test(trimmed) || /^Region:/.test(trimmed)) continue

      // 去除 VTT 标签（如 <c>, </c>）
      const clean = trimmed.replace(/<[^>]+>/g, '').trim()
      if (clean && !textLines.includes(clean)) {
        textLines.push(clean)
      }
    }

    return textLines.length > 0 ? textLines.join('\n') : null
  } catch {
    return null
  }
}
