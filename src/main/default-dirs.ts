/**
 * 一键创建默认目录：文档/PodMuse笔记（笔记）+ 下载/PodMuse音频（音频缓存）。
 * 仅当配置对应字段为空时写回（用户已有的自定义目录绝不覆盖）。
 */
import { app } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import { loadConfig, saveConfig } from './config'
import type { PodcastConfig } from '@shared/types'

export interface DefaultDirsResult {
  obsidian_dir: string
  audio_dir: string
  error?: string
}

/** 默认目录路径（纯函数，便于测试） */
export function defaultDirPaths(
  docsBase: string,
  downloadsBase: string,
): { obsidian_dir: string; audio_dir: string } {
  return {
    obsidian_dir: join(docsBase, 'PodMuse笔记'),
    audio_dir: join(downloadsBase, 'PodMuse音频'),
  }
}

export function createDefaultDirs(): DefaultDirsResult {
  try {
    const paths = defaultDirPaths(app.getPath('documents'), app.getPath('downloads'))
    fs.mkdirSync(paths.obsidian_dir, { recursive: true })
    fs.mkdirSync(paths.audio_dir, { recursive: true })

    const cfg = loadConfig()
    const patch: Partial<PodcastConfig> = {}
    if (!cfg.obsidian_dir?.trim()) patch.obsidian_dir = paths.obsidian_dir
    if (!cfg.audio_dir?.trim()) patch.audio_dir = paths.audio_dir
    if (patch.obsidian_dir || patch.audio_dir) {
      saveConfig({ ...cfg, ...patch })
    }

    const final = { ...cfg, ...patch }
    return { obsidian_dir: final.obsidian_dir, audio_dir: final.audio_dir }
  } catch (e) {
    return { obsidian_dir: '', audio_dir: '', error: (e as Error).message }
  }
}
