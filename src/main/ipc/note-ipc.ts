import { ipcMain, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { loadConfig } from '../config'
import { isPathWithinBase } from '../security'

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
}
