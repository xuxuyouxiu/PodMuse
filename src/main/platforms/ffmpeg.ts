/** ffmpeg/ffprobe 检测与自动下载
 *
 * yt-dlp 执行 `--extract-audio --audio-format mp3` 时依赖命令行 ffmpeg/ffprobe。
 * 这里不能使用 Electron 运行时自带的 ffmpeg.dll（那是给 Chromium/Electron 用的运行库，
 * 不是可执行的 CLI）。本项目采用与 yt-dlp 自动下载一致的思路：优先使用已安装/已打包的
 * ffmpeg/ffprobe，缺失时自动下载到用户数据目录，全程无需用户手动安装。
 */

import * as fs from 'fs'
import * as path from 'path'
import { execSync, spawn } from 'child_process'

/** 国内 GitHub 加速镜像前缀（直连失败后按顺序尝试） */
const GITHUB_MIRROR_PREFIXES = [
  'https://ghfast.top/',
  'https://gh-proxy.com/',
  'https://mirror.ghproxy.com/',
]

interface FfmpegUrls {
  ffmpeg: string
  ffprobe: string
}

function isWindows(): boolean {
  return process.platform === 'win32'
}

function binaryName(base: 'ffmpeg' | 'ffprobe'): string {
  return isWindows() ? `${base}.exe` : base
}

function hasBinaries(dir: string | null | undefined): boolean {
  if (!dir) return false
  return (
    fs.existsSync(path.join(dir, binaryName('ffmpeg'))) &&
    fs.existsSync(path.join(dir, binaryName('ffprobe')))
  )
}

/** 自动下载安装目录（用户数据目录，避免向程序目录写文件） */
function resolveInstallDir(): string {
  try {
    const { app } = require('electron')
    const userDataDir = app.getPath('userData')
    return path.join(userDataDir, 'ffmpeg')
  } catch {
    const home = process.env.USERPROFILE || process.env.HOME || '.'
    return path.join(home, 'tools', 'ffmpeg')
  }
}

/** 查找包含 ffmpeg + ffprobe 的目录（返回可用于 --ffmpeg-location 的目录） */
export function findFfmpegDir(): string | null {
  const candidates: string[] = []

  // 1) 应用根目录/打包目录
  try {
    const appRoot = path.dirname(process.execPath)
    candidates.push(
      path.join(appRoot, 'ffmpeg', 'bin'),
      path.join(appRoot, 'ffmpeg'),
      path.join(appRoot, 'bin'),
      appRoot,
    )
  } catch {}

  // 2) portable data 目录（与 yt-dlp 搜索路径一致）
  try {
    const { app } = require('electron')
    const userDataDir = app.getPath('userData')
    const portableDir = path.join(path.dirname(path.dirname(userDataDir)), 'data')
    candidates.push(path.join(portableDir, 'ffmpeg', 'bin'), path.join(portableDir, 'ffmpeg'))
  } catch {}

  // 3) 用户级工具目录
  const home = process.env.USERPROFILE || process.env.HOME || ''
  if (home) {
    candidates.push(path.join(home, 'tools', 'ffmpeg', 'bin'), path.join(home, 'tools', 'ffmpeg'))
    const localBin = path.join(home, '.local', 'bin')
    if (fs.existsSync(path.join(localBin, binaryName('ffmpeg')))) {
      candidates.push(localBin)
    }
  }

  // 4) 自动下载缓存目录
  candidates.push(path.join(resolveInstallDir(), 'bin'), resolveInstallDir())

  for (const dir of candidates) {
    if (hasBinaries(dir)) return dir
  }

  // 5) 系统 PATH
  try {
    const cmd = isWindows() ? 'where ffmpeg' : 'which ffmpeg'
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim()
    const first = output.split(/\r?\n/)[0].trim()
    if (first) {
      const dir = path.dirname(first)
      if (hasBinaries(dir)) return dir
    }
  } catch {}

  return null
}

/** 当前平台对应的 ffmpeg/ffprobe 下载地址（ffbinaries 预编译包，体积比完整发行包小） */
function getFfmpegUrls(): FfmpegUrls {
  const base = 'https://github.com/ffbinaries/ffbinaries-prebuilt/releases/download/v6.1'
  if (isWindows()) {
    return {
      ffmpeg: `${base}/ffmpeg-6.1-win-64.zip`,
      ffprobe: `${base}/ffprobe-6.1-win-64.zip`,
    }
  }
  if (process.platform === 'darwin') {
    return {
      ffmpeg: `${base}/ffmpeg-6.1-macos-64.zip`,
      ffprobe: `${base}/ffprobe-6.1-macos-64.zip`,
    }
  }
  if (process.platform === 'linux') {
    if (process.arch === 'arm64') {
      return {
        ffmpeg: `${base}/ffmpeg-6.1-linux-arm-64.zip`,
        ffprobe: `${base}/ffprobe-6.1-linux-arm-64.zip`,
      }
    }
    return {
      ffmpeg: `${base}/ffmpeg-6.1-linux-64.zip`,
      ffprobe: `${base}/ffprobe-6.1-linux-64.zip`,
    }
  }
  throw new Error('当前平台暂不支持自动下载 ffmpeg/ffprobe')
}

function buildDownloadCandidates(url: string): string[] {
  return [url, ...GITHUB_MIRROR_PREFIXES.map(prefix => prefix + url)]
}

async function downloadBinary(
  url: string,
  savePath: string,
  expectedSize: number,
  signal: AbortSignal | undefined,
  onProgress?: (msg: string) => void,
): Promise<void> {
  const resp = await fetch(url, { signal })
  if (!resp.ok) throw new Error(`下载失败: ${resp.status}`)
  if (!resp.body) throw new Error('下载响应为空')

  const totalSize = expectedSize || Number(resp.headers.get('content-length')) || 0
  const tmpPath = savePath + '.downloading'
  const writer = fs.createWriteStream(tmpPath)
  const reader = resp.body.getReader()
  let downloaded = 0
  let writerError: Error | null = null
  writer.on('error', err => {
    writerError = err
  })

  const writeChunk = async (chunk: Uint8Array): Promise<void> => {
    if (writerError) throw writerError
    if (writer.write(chunk)) return
    await new Promise<void>((resolve, reject) => {
      writer.once('drain', resolve)
      writer.once('error', reject)
    })
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (signal?.aborted) {
        try {
          await reader.cancel()
        } catch {}
        throw new Error('已取消')
      }
      await writeChunk(value)
      downloaded += value.length
      if (totalSize > 0) {
        const pct = Math.min(99, Math.round((downloaded / totalSize) * 100))
        onProgress?.(
          `下载中 ${pct}% (${(downloaded / 1048576).toFixed(1)}/${(totalSize / 1048576).toFixed(1)} MB)`,
        )
      }
    }
    await new Promise<void>((resolve, reject) => {
      if (writerError) {
        reject(writerError)
        return
      }
      writer.once('error', reject)
      writer.once('finish', resolve)
      writer.end()
    })
  } catch (e) {
    writer.destroy()
    try {
      fs.unlinkSync(tmpPath)
    } catch {}
    throw e
  }

  if (signal?.aborted) {
    try {
      fs.unlinkSync(tmpPath)
    } catch {}
    throw new Error('已取消')
  }

  if (fs.existsSync(savePath)) fs.unlinkSync(savePath)
  fs.renameSync(tmpPath, savePath)
}

async function downloadWithFallback(
  urls: string[],
  savePath: string,
  expectedSize: number,
  signal?: AbortSignal,
  onProgress?: (msg: string) => void,
): Promise<void> {
  let lastError: Error | null = null
  for (let i = 0; i < urls.length; i++) {
    try {
      if (i > 0) onProgress?.(`直连失败，切换备用下载源 ${i + 1}/${urls.length}...`)
      await downloadBinary(urls[i], savePath, expectedSize, signal, onProgress)
      return
    } catch (e) {
      if (signal?.aborted) throw e
      lastError = e instanceof Error ? e : new Error(String(e))
      try {
        if (fs.existsSync(savePath + '.downloading')) fs.unlinkSync(savePath + '.downloading')
      } catch {}
    }
  }
  throw lastError ?? new Error('所有下载源均失败')
}

/** 解压 zip：Windows 优先使用系统自带 bsdtar，其他平台回退 unzip */
function extractZip(archivePath: string, destDir: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const systemTar = isWindows()
      ? path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe')
      : null
    const useSystemTar = !!systemTar && fs.existsSync(systemTar)
    const command = useSystemTar ? (systemTar as string) : 'unzip'
    const args = useSystemTar
      ? ['-xf', archivePath, '-C', destDir]
      : ['-o', archivePath, '-d', destDir]

    let stderrTail = ''
    const proc = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })

    proc.stderr?.on('data', (data: Buffer) => {
      stderrTail = (stderrTail + data.toString()).slice(-400)
    })

    if (signal) {
      signal.addEventListener('abort', () => {
        try {
          proc.kill()
        } catch {}
        reject(new Error('已取消'))
      })
    }

    proc.on('error', err => {
      reject(new Error(`解压失败: ${err.message}`))
    })

    proc.on('close', code => {
      if (signal?.aborted) return
      if (code !== 0) {
        reject(new Error(`解压失败（退出码 ${code}）${stderrTail ? `：${stderrTail}` : ''}`))
        return
      }
      resolve()
    })
  })
}

/** 自动下载 ffmpeg/ffprobe 到用户数据目录；已存在时直接返回目录 */
export async function autoDownloadFfmpeg(
  onProgress?: (msg: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const existing = findFfmpegDir()
  if (existing) return existing

  const installDir = resolveInstallDir()
  const binDir = path.join(installDir, 'bin')
  fs.mkdirSync(binDir, { recursive: true })

  const urls = getFfmpegUrls()
  const tasks = [
    {
      name: binaryName('ffmpeg'),
      url: urls.ffmpeg,
      zipName: urls.ffmpeg.split('/').pop() || 'ffmpeg.zip',
    },
    {
      name: binaryName('ffprobe'),
      url: urls.ffprobe,
      zipName: urls.ffprobe.split('/').pop() || 'ffprobe.zip',
    },
  ]

  for (const task of tasks) {
    const archivePath = path.join(installDir, task.zipName)
    onProgress?.(`下载 ${task.name}...`)
    await downloadWithFallback(buildDownloadCandidates(task.url), archivePath, 0, signal, msg =>
      onProgress?.(`${task.name} ${msg}`),
    )
    onProgress?.(`解压 ${task.name}...`)
    await extractZip(archivePath, binDir, signal)
    try {
      fs.unlinkSync(archivePath)
    } catch {}
  }

  if (!hasBinaries(binDir)) {
    throw new Error('ffmpeg/ffprobe 解压后未找到，请检查网络后重试')
  }
  return binDir
}

/** 确保 ffmpeg/ffprobe 可用；缺失时自动下载，全程无需用户手动安装 */
export async function ensureFfmpeg(
  onProgress?: (msg: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const existing = findFfmpegDir()
  if (existing) return existing
  return autoDownloadFfmpeg(onProgress, signal)
}
