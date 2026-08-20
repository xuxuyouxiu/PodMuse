/** Faster-Whisper-XXL 一键下载：GitHub release → 7z 下载 → 解压 → 自动写回 whisper_exe_path
 *
 * 范式对齐 yt-dlp autoDownloadYtDlp（platforms/yt-dlp.ts），并做三处扩展：
 * 1. 发布源固定为 Purfview/whisper-standalone-win 的 Faster-Whisper-XXL tag
 *    （/releases/latest 指向无资产的 Pro 版，不能照抄 latest 接口）
 * 2. 资产是 .7z 压缩包（约 1.3GB），用 Windows 自带 bsdtar 解压，失败回退 7z
 * 3. 下载失败按国内镜像前缀逐个重试（ghfast.top / gh-proxy.com / mirror.ghproxy.com），
 *    全部失败时错误信息引导用户打开 GitHub 下载页手动安装
 */

import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'
import type { WhisperDownloadState } from '@shared/types'
import { getUserDataDir, loadConfig, saveConfig } from './config'

/** GitHub 发布页（手动下载回退入口） */
export const WHISPER_RELEASES_PAGE = 'https://github.com/Purfview/whisper-standalone-win/releases'

const RELEASE_API_URL =
  'https://api.github.com/repos/Purfview/whisper-standalone-win/releases/tags/Faster-Whisper-XXL'

/** 国内 GitHub 加速镜像前缀（直连失败后按顺序尝试） */
export const GITHUB_MIRROR_PREFIXES = [
  'https://ghfast.top/',
  'https://gh-proxy.com/',
  'https://mirror.ghproxy.com/',
]

/** 压缩包内可执行文件名（小写比较） */
const EXE_NAMES = ['faster-whisper-xxl.exe', 'faster-whisper.exe']

export interface WhisperAsset {
  name: string
  browser_download_url: string
  size: number
}

// ── 纯函数（供单元测试）──────────────────────────────────────────

/** 从资产名解析版本号，如 Faster-Whisper-XXL_r245.4_windows.7z → { major: 245, minor: 4 } */
export function parseAssetVersion(name: string): { major: number; minor: number } | null {
  const m = name.match(/r(\d+)\.(\d+)/i)
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2]) }
}

/** 选出当前平台下版本最高的 7z 资产 */
export function pickAssetForPlatform(assets: WhisperAsset[], platform: string): WhisperAsset | null {
  const suffix = platform === 'linux' ? '_linux.7z' : platform === 'win32' ? '_windows.7z' : null
  if (!suffix) return null
  const candidates = assets.filter(a => a.name.toLowerCase().endsWith(suffix))
  if (candidates.length === 0) return null
  const byVersion = [...candidates].sort((a, b) => {
    const va = parseAssetVersion(a.name)
    const vb = parseAssetVersion(b.name)
    if (!va || !vb) return a.name.localeCompare(b.name)
    return va.major - vb.major || va.minor - vb.minor
  })
  return byVersion[byVersion.length - 1]
}

/** 直连 + 镜像候选列表（按顺序尝试） */
export function buildMirrorCandidates(url: string): string[] {
  return [url, ...GITHUB_MIRROR_PREFIXES.map(prefix => prefix + url)]
}

/** 在目录内（深度受限）查找 faster-whisper exe */
export function findWhisperExeInDir(dir: string, maxDepth = 4): string | null {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    if (entry.isFile() && EXE_NAMES.includes(entry.name.toLowerCase())) {
      return path.join(dir, entry.name)
    }
  }
  if (maxDepth > 1) {
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const found = findWhisperExeInDir(path.join(dir, entry.name), maxDepth - 1)
        if (found) return found
      }
    }
  }
  return null
}

// ── 下载状态机（主进程单例，TabWhisper 与向导共用）─────────────────

type WhisperDownloadListener = (state: WhisperDownloadState) => void

const listeners = new Set<WhisperDownloadListener>()

let current: WhisperDownloadState = { status: 'idle', progress: 0, message: '' }
let running: AbortController | null = null

function setState(patch: Partial<WhisperDownloadState>): void {
  current = { ...current, ...patch }
  for (const listener of listeners) {
    try {
      listener({ ...current })
    } catch {}
  }
}

/** 订阅下载状态变化；返回取消订阅函数 */
export function onWhisperDownloadState(listener: WhisperDownloadListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getWhisperDownloadState(): WhisperDownloadState {
  return { ...current }
}

/** 取消正在进行的下载（解压/下载中的临时文件由主循环清理） */
export function cancelWhisperDownload(): boolean {
  if (!running || running.signal.aborted) return false
  running.abort()
  return true
}

/** 启动一键下载；已在下载中时直接返回当前状态（不重复启动） */
export async function startWhisperDownload(): Promise<WhisperDownloadState> {
  if (running && !running.signal.aborted) {
    return getWhisperDownloadState()
  }
  const controller = new AbortController()
  running = controller
  try {
    await downloadInternal(controller.signal)
  } finally {
    running = null
  }
  return getWhisperDownloadState()
}

// ── 下载实现 ──────────────────────────────────────────────────────

function resolveInstallDir(): string {
  try {
    return path.join(getUserDataDir(), 'Faster-Whisper-XXL')
  } catch {
    const home = process.env.USERPROFILE || process.env.HOME || '.'
    return path.join(home, 'PodMuse', 'Faster-Whisper-XXL')
  }
}

async function downloadInternal(signal: AbortSignal): Promise<void> {
  try {
    setState({ status: 'checking', progress: 0, message: '正在获取最新版本信息…', exePath: undefined, error: undefined })

    const release = await fetchReleaseInfo(signal)
    const asset = pickAssetForPlatform(release.assets, process.platform)
    if (!asset) {
      throw new Error('当前平台暂无自动安装包，请到 GitHub 下载页手动下载')
    }

    const installDir = resolveInstallDir()
    fs.mkdirSync(installDir, { recursive: true })

    // 已安装则直接复用（重进设置页/向导时快速命中）
    const existing = findWhisperExeInDir(installDir)
    if (existing) {
      setState({ status: 'installed', progress: 100, message: `已安装：${existing}`, exePath: existing })
      return
    }

    const archivePath = path.join(installDir, asset.name)
    setState({ status: 'downloading', progress: 0, message: `开始下载 ${asset.name}（${(asset.size / 1048576).toFixed(0)} MB）` })

    const candidates = buildMirrorCandidates(asset.browser_download_url)
    await downloadBinaryWithFallback(candidates, archivePath, asset.size, signal, (progress, message) => {
      setState({ status: 'downloading', progress, message })
    })

    setState({ status: 'extracting', message: '正在解压安装…' })
    await extractArchive(archivePath, installDir, signal)

    // 解压成功即删除压缩包，避免 1.3GB 残留
    try {
      fs.unlinkSync(archivePath)
    } catch {}

    const exePath = findWhisperExeInDir(installDir)
    if (!exePath) {
      throw new Error('解压完成但未找到 faster-whisper-xxl.exe，请到 GitHub 下载页手动安装')
    }

    // 自动写回 whisper_exe_path（含安全检查由 config:save 之外的直接 saveConfig 承接，路径来自本应用目录）
    const cfg = loadConfig()
    saveConfig({ ...cfg, whisper_exe_path: exePath })

    setState({ status: 'installed', progress: 100, message: `已安装：${exePath}`, exePath })
  } catch (e) {
    if (signal.aborted) {
      setState({ status: 'cancelled', message: '已取消下载', error: undefined })
    } else {
      const msg = e instanceof Error ? e.message : String(e)
      setState({ status: 'error', message: `安装失败：${msg}`, error: msg })
    }
  }
}

interface ReleaseInfo {
  tag_name: string
  assets: WhisperAsset[]
}

async function fetchReleaseInfo(signal?: AbortSignal): Promise<ReleaseInfo> {
  let lastError: Error | null = null
  for (const url of buildMirrorCandidates(RELEASE_API_URL)) {
    try {
      const resp = await fetch(url, {
        headers: { Accept: 'application/vnd.github.v3+json' },
        signal,
      })
      if (!resp.ok) throw new Error(`GitHub API 请求失败: ${resp.status}`)
      const release = (await resp.json()) as { tag_name?: string; assets?: WhisperAsset[] }
      if (!release.assets) throw new Error('GitHub API 响应缺少 assets')
      return { tag_name: release.tag_name ?? '', assets: release.assets }
    } catch (e) {
      if (signal?.aborted) throw e
      lastError = e instanceof Error ? e : new Error(String(e))
    }
  }
  throw lastError ?? new Error('GitHub API 请求失败')
}

/** 逐个候选源尝试下载二进制，全部失败后抛出最后一个错误 */
async function downloadBinaryWithFallback(
  urls: string[],
  savePath: string,
  expectedSize: number,
  signal: AbortSignal | undefined,
  onProgress?: (progress: number, message: string) => void,
): Promise<void> {
  let lastError: Error | null = null
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    try {
      if (i > 0) onProgress?.(0, `直连失败，切换备用下载源 ${i + 1}/${urls.length}…`)
      await downloadBinary(url, savePath, expectedSize, signal, onProgress)
      return
    } catch (e) {
      if (signal?.aborted) throw e
      lastError = e instanceof Error ? e : new Error(String(e))
      // 失败后清理残留临时文件，准备下一个源
      try {
        if (fs.existsSync(savePath + '.downloading')) fs.unlinkSync(savePath + '.downloading')
      } catch {}
    }
  }
  throw lastError ?? new Error('所有下载源均失败')
}

async function downloadBinary(
  url: string,
  savePath: string,
  expectedSize: number,
  signal: AbortSignal | undefined,
  onProgress?: (progress: number, message: string) => void,
): Promise<void> {
  const resp = await fetch(url, { signal })
  if (!resp.ok) throw new Error(`下载失败: ${resp.status}`)
  if (!resp.body) throw new Error('下载响应为空')

  const totalSize = expectedSize || Number(resp.headers.get('content-length')) || 0
  const tmpPath = savePath + '.downloading'
  const writer = fs.createWriteStream(tmpPath)
  const reader = resp.body.getReader()
  let downloaded = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (signal?.aborted) {
      writer.close()
      try {
        fs.unlinkSync(tmpPath)
      } catch {}
      throw new Error('已取消')
    }
    writer.write(value)
    downloaded += value.length
    if (totalSize > 0) {
      const pct = Math.min(99, Math.round((downloaded / totalSize) * 100))
      onProgress?.(
        pct,
        `下载中 ${pct}% (${(downloaded / 1048576).toFixed(1)}/${(totalSize / 1048576).toFixed(1)} MB)`,
      )
    }
  }

  await new Promise<void>((resolve, reject) => {
    writer.end((err?: Error) => (err ? reject(err) : resolve()))
  })

  if (signal?.aborted) {
    try {
      fs.unlinkSync(tmpPath)
    } catch {}
    throw new Error('已取消')
  }

  if (fs.existsSync(savePath)) fs.unlinkSync(savePath)
  fs.renameSync(tmpPath, savePath)
}

/** 解压 7z：优先 Windows 自带 bsdtar（libarchive 支持 7z），回退 7z 命令 */
function extractArchive(archivePath: string, destDir: string, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32'
    // 优先 SystemRoot（Windows 上基本总是存在）；兜底 'C:/Windows' 正斜杠避免转义歧义
    const systemTar = isWin
      ? path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe')
      : null
    const useSystemTar = !!systemTar && fs.existsSync(systemTar)

    const command = useSystemTar
      ? (systemTar as string)
      : isWin
        ? '7z'
        : 'tar'
    const args = useSystemTar || !isWin
      ? ['-xf', archivePath, '-C', destDir]
      : ['x', archivePath, `-o${destDir}`, '-y']

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
      reject(
        new Error(
          isWin
            ? `解压失败：未找到可用的解压工具（tar/7z），请到 GitHub 下载页手动下载解压: ${err.message}`
            : `解压失败: ${err.message}`,
        ),
      )
    })

    proc.on('close', code => {
      if (signal?.aborted) return
      if (code !== 0) {
        reject(
          new Error(
            `解压失败（退出码 ${code}）${stderrTail ? `：${stderrTail}` : ''}，请到 GitHub 下载页手动下载解压`,
          ),
        )
        return
      }
      resolve()
    })
  })
}
