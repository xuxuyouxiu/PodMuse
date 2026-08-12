import { ipcMain, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { loadConfig } from '../config'
import { isPathWithinBase } from '../security'

export interface NoteFileEntry {
  name: string
  path: string
  /** 相对 obsidian_dir 的路径（含子目录），用于面包屑 */
  relPath: string
  mtime: number
}

export interface NoteDirGroup {
  dir: string
  files: NoteFileEntry[]
}

/**
 * 笔记读取 IPC — 供渲染进程预览生成的笔记内容
 * 仅允许读取 obsidian_dir 内的 .md 文件（防路径遍历）
 */
export function registerNoteIpc(): void {
  ipcMain.handle('notes:read', async (_e, filePath: string) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: '无效路径' }
      }

      const config = loadConfig()
      const obsidianDir = config.obsidian_dir?.trim()
      const allowedDirs = [obsidianDir, app.getPath('userData')].filter(Boolean)

      // 仅允许 .md 文件
      if (path.extname(filePath).toLowerCase() !== '.md') {
        return { success: false, error: '仅支持读取 .md 笔记文件' }
      }
      // 路径必须位于允许的目录内
      if (!isPathWithinBase(filePath, allowedDirs)) {
        console.warn('notes:read blocked:', filePath)
        return { success: false, error: '路径不在允许范围内' }
      }
      if (!fs.existsSync(filePath)) {
        return { success: false, error: '笔记文件不存在' }
      }

      const content = fs.readFileSync(filePath, 'utf-8')
      return { success: true, content, filename: path.basename(filePath) }
    } catch (e) {
      return { success: false, error: (e as Error).message || '读取失败' }
    }
  })

  // 扫描 Obsidian 库，返回按目录分组的 .md 文件列表
  ipcMain.handle('notes:list', async () => {
    try {
      const config = loadConfig()
      const obsidianDir = config.obsidian_dir?.trim()
      if (!obsidianDir || !fs.existsSync(obsidianDir)) {
        return { success: true, groups: [], rootDir: null }
      }

      const rootDir = obsidianDir
      const groups: NoteDirGroup[] = []
      const rootFiles: NoteFileEntry[] = []

      const readDir = (dir: string, depth: number) => {
        if (depth > 2) return // 最多两级子目录
        let entries: fs.Dirent[]
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true })
        } catch {
          return
        }
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          if (entry.isDirectory()) {
            readDir(fullPath, depth + 1)
          } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
            const relPath = path.relative(rootDir, fullPath)
            const fileEntry: NoteFileEntry = {
              name: entry.name.replace(/\.md$/i, ''),
              path: fullPath,
              relPath: relPath.replace(/\\/g, '/'),
              mtime: fs.statSync(fullPath).mtimeMs,
            }
            if (dir === rootDir) {
              rootFiles.push(fileEntry)
            } else {
              const groupName = path.relative(rootDir, dir).split(path.sep)[0]
              let group = groups.find(g => g.dir === groupName)
              if (!group) {
                group = { dir: groupName, files: [] }
                groups.push(group)
              }
              group.files.push(fileEntry)
            }
          }
        }
      }

      readDir(rootDir, 0)

      // 排序：目录按名，文件按修改时间倒序
      groups.sort((a, b) => a.dir.localeCompare(b.dir, 'zh'))
      for (const g of groups) g.files.sort((a, b) => b.mtime - a.mtime)
      rootFiles.sort((a, b) => b.mtime - a.mtime)
      if (rootFiles.length > 0) {
        groups.unshift({ dir: '根目录', files: rootFiles })
      }

      return { success: true, groups, rootDir }
    } catch (e) {
      return { success: false, error: (e as Error).message || '扫描失败' }
    }
  })
}
