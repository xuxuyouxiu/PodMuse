import * as path from 'path'
import * as fs from 'fs'
import { loadConfig, loadState } from './config'
import { exportToNotion, testNotionConnection } from './notion-converter'
import type { ExportResult } from './exporter-types'

/**
 * 把 markdown 内容中的 Obsidian wiki-link 转换为纯文本
 * - [[xxx|alias]] → alias（有 alias 时取 alias）
 * - [[xxx]]       → xxx（无 alias 时取链接目标）
 */
export function stripWikiLinks(content: string): string {
  return content
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')  // [[xxx|alias]] → alias
    .replace(/\[\[([^\]]+)\]\]/g, '$1')              // [[xxx]] → xxx
}

/**
 * 根据 taskId 查找笔记的绝对路径
 * - 从 feishu_state.json 的 recentTasks 数组中按 id 查找
 * - 拿到 task.filename（相对于 obsidian_dir 的路径，可能含子目录）
 * - 用 path.join 拼接为绝对路径
 */
export function getNotePathByTaskId(taskId: string): { absolutePath: string; relativePath: string } | null {
  try {
    const state = loadState()
    const allTasks = [...state.activeTasks, ...state.recentTasks]
    const task = allTasks.find(t => t.id === taskId)
    if (!task) return null
    if (!task.filename) return null

    const config = loadConfig()
    const obsDir = config.obsidian_dir?.trim() || ''
    if (!obsDir) return null

    const abs = path.isAbsolute(task.filename) ? task.filename : path.join(obsDir, task.filename)
    return { absolutePath: abs, relativePath: task.filename }
  } catch {
    return null
  }
}

interface CopyOptions {
  stripObsidianSyntax?: boolean
}

/**
 * 把笔记复制到目标目录的核心函数
 * - 检查源文件可读、目标目录可写
 * - 可选：去除 Obsidian wiki-link
 * - 文件名冲突自动追加时间戳后缀
 */
export async function copyNoteToDir(
  srcPath: string,
  targetDir: string,
  options: CopyOptions = {}
): Promise<string> {
  // 1. 检查源文件可读
  await fs.promises.access(srcPath, fs.constants.R_OK)

  // 2. 检查目标目录存在且可写
  await fs.promises.access(targetDir, fs.constants.W_OK)

  // 3. 读取源文件
  let content = await fs.promises.readFile(srcPath, 'utf-8')

  // 4. 可选：去除 Obsidian wiki-link
  if (options.stripObsidianSyntax) {
    content = stripWikiLinks(content)
  }

  // 5. 文件名冲突处理：自动追加时间戳后缀
  const originalName = path.basename(srcPath)
  let targetName = originalName
  let targetPath = path.join(targetDir, targetName)
  if (fs.existsSync(targetPath)) {
    const stem = path.parse(originalName).name
    const ext = path.parse(originalName).ext
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').substring(0, 14) // YYYYMMDDHHmmss
    targetName = `${stem}_${timestamp}${ext}`
    targetPath = path.join(targetDir, targetName)
  }

  // 6. 写入
  await fs.promises.writeFile(targetPath, content, 'utf-8')
  return targetPath
}

/**
 * 导出总入口：根据 target 分发到具体实现
 */
export async function exportNote(params: {
  taskId: string
  target: 'markdown' | 'logseq' | 'notion'
  targetDir?: string
  stripObsidianSyntax?: boolean
}): Promise<ExportResult> {
  const { taskId, target } = params

  // 1. 查找源笔记路径
  const noteLocation = getNotePathByTaskId(taskId)
  if (!noteLocation) {
    return { success: false, error: '任务不存在或尚未生成笔记' }
  }
  const srcPath = noteLocation.absolutePath

  // 2. 检查源文件是否还存在（用户可能已删除）
  try {
    await fs.promises.access(srcPath, fs.constants.R_OK)
  } catch {
    return { success: false, error: '源笔记文件不存在，可能已被删除' }
  }

  // 3. 按平台分发
  if (target === 'markdown') {
    if (!params.targetDir) {
      return { success: false, error: '未指定目标目录' }
    }
    try {
      const outputPath = await copyNoteToDir(srcPath, params.targetDir, {
        stripObsidianSyntax: params.stripObsidianSyntax,
      })
      return { success: true, outputPath }
    } catch (e) {
      return { success: false, error: mapFsError(e) }
    }
  }

  if (target === 'logseq') {
    const config = loadConfig()
    const logseqDir = config.export?.logseq_dir?.trim() || ''
    if (!logseqDir) {
      return { success: false, error: '未配置 Logseq 目录，请在设置中配置' }
    }
    try {
      await fs.promises.access(logseqDir, fs.constants.W_OK)
    } catch {
      return { success: false, error: 'Logseq 目录不存在或不可写，请检查路径' }
    }
    try {
      const outputPath = await copyNoteToDir(srcPath, logseqDir, { stripObsidianSyntax: false })
      return { success: true, outputPath }
    } catch (e) {
      return { success: false, error: mapFsError(e) }
    }
  }

  if (target === 'notion') {
    const config = loadConfig()
    const notion = config.export?.notion
    if (!notion?.token?.trim() || !notion?.database_id?.trim()) {
      return { success: false, error: '未配置 Notion 集成，请在设置中配置 Token 和 Database ID' }
    }
    try {
      const content = await fs.promises.readFile(srcPath, 'utf-8')
      const result = await exportToNotion({
        token: notion.token.trim(),
        databaseId: notion.database_id.trim(),
        markdown: content,
        relativePath: noteLocation.relativePath,
      })
      return result
    } catch (e) {
      return { success: false, error: mapNotionError(e) }
    }
  }

  return { success: false, error: `未知导出目标: ${target}` }
}

/**
 * 把 NodeJS.ErrnoException 映射为中文错误提示
 */
function mapFsError(e: unknown): string {
  const err = e as NodeJS.ErrnoException
  const code = err?.code || ''
  const msg = err?.message || String(e)
  if (code === 'ENOENT') return '文件或目录不存在'
  if (code === 'EACCES' || code === 'EPERM') return '权限不足，无法写入目标目录'
  if (code === 'ENOSPC') return '磁盘空间不足'
  if (code === 'ENAMETOOLONG') return '文件名过长'
  if (code === 'EROFS') return '目标目录是只读文件系统'
  return `文件操作失败: ${msg}`
}

/**
 * 把 Notion API 错误映射为中文提示
 */
function mapNotionError(e: unknown): string {
  const err = e as { status?: number; message?: string }
  const status = err?.status
  const msg = err?.message || String(e)
  if (status === 401) return 'Notion Integration Token 无效或已过期'
  if (status === 404) return 'Notion Database 不存在或集成未共享该 database'
  if (status === 429) return 'Notion API 速率限制，请稍后再试'
  return `Notion API 错误: ${msg}`
}

export { testNotionConnection }
