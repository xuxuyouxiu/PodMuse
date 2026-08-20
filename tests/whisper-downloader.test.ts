import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// whisper-downloader 依赖 config.ts（electron/app 链路），测试里整体 mock
vi.mock('../src/main/config', () => ({
  getUserDataDir: vi.fn(() => 'C:/fake/userdata'),
  loadConfig: vi.fn(() => ({})),
  saveConfig: vi.fn(),
}))

import {
  parseAssetVersion,
  pickAssetForPlatform,
  buildMirrorCandidates,
  findWhisperExeInDir,
  getWhisperDownloadState,
  GITHUB_MIRROR_PREFIXES,
} from '../src/main/whisper-downloader'
import type { WhisperAsset } from '../src/main/whisper-downloader'

describe('parseAssetVersion', () => {
  it('解析 r{major}.{minor} 版本号', () => {
    expect(parseAssetVersion('Faster-Whisper-XXL_r245.4_windows.7z')).toEqual({ major: 245, minor: 4 })
    expect(parseAssetVersion('Faster-Whisper-XXL_r192.3.4_windows.7z')).toEqual({ major: 192, minor: 3 })
  })

  it('无版本号返回 null', () => {
    expect(parseAssetVersion('Faster-Whisper-XXL_windows.7z')).toBeNull()
  })
})

describe('pickAssetForPlatform', () => {
  const assets: WhisperAsset[] = [
    { name: 'Faster-Whisper-XXL_r192.3.1_linux.7z', browser_download_url: 'https://x/1', size: 1 },
    { name: 'Faster-Whisper-XXL_r192.3.4_windows.7z', browser_download_url: 'https://x/2', size: 2 },
    { name: 'Faster-Whisper-XXL_r245.1_windows.7z', browser_download_url: 'https://x/3', size: 3 },
    { name: 'Faster-Whisper-XXL_r245.4_linux.7z', browser_download_url: 'https://x/4', size: 4 },
    { name: 'Faster-Whisper-XXL_r245.4_windows.7z', browser_download_url: 'https://x/5', size: 5 },
  ]

  it('win32 选出最高版本的 windows 7z', () => {
    const picked = pickAssetForPlatform(assets, 'win32')
    expect(picked?.name).toBe('Faster-Whisper-XXL_r245.4_windows.7z')
  })

  it('linux 选出最高版本的 linux 7z', () => {
    const picked = pickAssetForPlatform(assets, 'linux')
    expect(picked?.name).toBe('Faster-Whisper-XXL_r245.4_linux.7z')
  })

  it('darwin 无资产返回 null', () => {
    expect(pickAssetForPlatform(assets, 'darwin')).toBeNull()
  })

  it('空资产列表返回 null', () => {
    expect(pickAssetForPlatform([], 'win32')).toBeNull()
  })
})

describe('buildMirrorCandidates', () => {
  it('直连优先，镜像兜底', () => {
    const url = 'https://github.com/x/y.7z'
    const candidates = buildMirrorCandidates(url)
    expect(candidates[0]).toBe(url)
    expect(candidates.length).toBe(1 + GITHUB_MIRROR_PREFIXES.length)
    expect(candidates[1]).toBe(GITHUB_MIRROR_PREFIXES[0] + url)
  })
})

describe('findWhisperExeInDir', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-dl-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('压缩包解压后能定位 exe（嵌套目录）', () => {
    const nested = path.join(tmpDir, 'Faster-Whisper-XXL', 'bin')
    fs.mkdirSync(nested, { recursive: true })
    fs.writeFileSync(path.join(nested, 'faster-whisper-xxl.exe'), 'fake')
    const found = findWhisperExeInDir(tmpDir)
    expect(found).toBe(path.join(nested, 'faster-whisper-xxl.exe'))
  })

  it('识别 faster-whisper.exe 兜底名', () => {
    fs.writeFileSync(path.join(tmpDir, 'FASTER-WHISPER.EXE'), 'fake')
    expect(findWhisperExeInDir(tmpDir)).toBe(path.join(tmpDir, 'FASTER-WHISPER.EXE'))
  })

  it('深度超出限制返回 null', () => {
    const deep = path.join(tmpDir, 'a', 'b', 'c', 'd', 'e')
    fs.mkdirSync(deep, { recursive: true })
    fs.writeFileSync(path.join(deep, 'faster-whisper-xxl.exe'), 'fake')
    expect(findWhisperExeInDir(tmpDir, 4)).toBeNull()
    expect(findWhisperExeInDir(tmpDir, 6)).not.toBeNull()
  })

  it('不存在返回 null', () => {
    expect(findWhisperExeInDir(tmpDir)).toBeNull()
  })
})

describe('下载状态机', () => {
  it('初始状态为 idle', () => {
    const s = getWhisperDownloadState()
    expect(s.status).toBe('idle')
    expect(s.progress).toBe(0)
  })
})
