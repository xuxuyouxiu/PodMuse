/**
 * 一键默认目录单元测试（createDefaultDirs / defaultDirPaths）。
 * mock electron app.getPath 与 config 读写链路；fs 用真实实现落到临时目录。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const { mockGetPath, mockLoadConfig, mockSaveConfig } = vi.hoisted(() => ({
  mockGetPath: vi.fn(),
  mockLoadConfig: vi.fn(),
  mockSaveConfig: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { getPath: mockGetPath },
}))

vi.mock('../src/main/config', () => ({
  loadConfig: mockLoadConfig,
  saveConfig: mockSaveConfig,
}))

import { createDefaultDirs, defaultDirPaths } from '../src/main/default-dirs'

describe('defaultDirPaths', () => {
  it('基于 Documents/Downloads 拼默认目录名', () => {
    expect(defaultDirPaths('C:/docs', 'C:/downloads')).toEqual({
      obsidian_dir: path.join('C:/docs', 'PodMuse笔记'),
      audio_dir: path.join('C:/downloads', 'PodMuse音频'),
    })
  })
})

describe('createDefaultDirs', () => {
  let docsDir: string
  let downloadsDir: string

  beforeEach(() => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'default-dirs-test-'))
    docsDir = path.join(tmp, 'docs')
    downloadsDir = path.join(tmp, 'downloads')
    mockGetPath.mockImplementation((name: string) =>
      name === 'documents' ? docsDir : downloadsDir,
    )
    mockLoadConfig.mockReset()
    mockSaveConfig.mockReset()
  })

  it('两个目录都空：创建两个目录并写回两个字段', () => {
    mockLoadConfig.mockReturnValue({ obsidian_dir: '', audio_dir: '' })
    const result = createDefaultDirs()
    const obsidianDir = path.join(docsDir, 'PodMuse笔记')
    const audioDir = path.join(downloadsDir, 'PodMuse音频')
    expect(result).toEqual({ obsidian_dir: obsidianDir, audio_dir: audioDir })
    expect(result.error).toBeUndefined()
    expect(fs.existsSync(obsidianDir)).toBe(true)
    expect(fs.existsSync(audioDir)).toBe(true)
    expect(mockSaveConfig).toHaveBeenCalledTimes(1)
    expect(mockSaveConfig.mock.calls[0][0]).toEqual({
      obsidian_dir: obsidianDir,
      audio_dir: audioDir,
    })
  })

  it('仅缺音频目录：只写回 audio_dir，obsidian_dir 保留原值', () => {
    const existing = 'D:/my-vault'
    mockLoadConfig.mockReturnValue({ obsidian_dir: existing, audio_dir: '' })
    const result = createDefaultDirs()
    expect(result.obsidian_dir).toBe(existing)
    expect(result.audio_dir).toBe(path.join(downloadsDir, 'PodMuse音频'))
    const saved = mockSaveConfig.mock.calls[0][0]
    expect(saved.obsidian_dir).toBe(existing)
    expect(saved.audio_dir).toBe(path.join(downloadsDir, 'PodMuse音频'))
  })

  it('两个目录都已配置：不写回配置（saveConfig 不调用），返回原值', () => {
    const obsidian = 'D:/vault'
    const audio = 'E:/audio'
    mockLoadConfig.mockReturnValue({ obsidian_dir: obsidian, audio_dir: audio })
    const result = createDefaultDirs()
    expect(result).toEqual({ obsidian_dir: obsidian, audio_dir: audio })
    expect(mockSaveConfig).not.toHaveBeenCalled()
  })

  it('创建失败（getPath 抛错）：返回 error，不写回配置', () => {
    mockGetPath.mockImplementation(() => {
      throw new Error('no documents dir')
    })
    mockLoadConfig.mockReturnValue({ obsidian_dir: '', audio_dir: '' })
    const result = createDefaultDirs()
    expect(result.error).toContain('no documents dir')
    expect(result.obsidian_dir).toBe('')
    expect(mockSaveConfig).not.toHaveBeenCalled()
  })

  it('目录已存在时 mkdirSync recursive 不报错', () => {
    const obsidianDir = path.join(docsDir, 'PodMuse笔记')
    fs.mkdirSync(obsidianDir, { recursive: true })
    mockLoadConfig.mockReturnValue({ obsidian_dir: '', audio_dir: '' })
    const result = createDefaultDirs()
    expect(result.error).toBeUndefined()
  })
})
