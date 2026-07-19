import { ipcMain, BrowserWindow } from 'electron'
import { exportNote, testNotionConnection } from '../exporter'
import type { ExportParams, ExportResult, NotionTestConnectionParams, NotionTestConnectionResult } from '../exporter-types'

export function registerExportIPC(_mainWindow?: BrowserWindow | null): void {
  // 通用导出入口：根据 target 分发到 markdown / logseq / notion
  ipcMain.handle('export:toMarkdown', async (_e, params: { taskId: string; targetDir: string; stripObsidianSyntax?: boolean }): Promise<ExportResult> => {
    try {
      return await exportNote({
        taskId: params.taskId,
        target: 'markdown',
        targetDir: params.targetDir,
        stripObsidianSyntax: params.stripObsidianSyntax,
      })
    } catch (e) {
      return { success: false, error: `导出失败: ${(e as Error).message}` }
    }
  })

  ipcMain.handle('export:toLogseq', async (_e, params: { taskId: string }): Promise<ExportResult> => {
    try {
      return await exportNote({ taskId: params.taskId, target: 'logseq' })
    } catch (e) {
      return { success: false, error: `导出失败: ${(e as Error).message}` }
    }
  })

  ipcMain.handle('export:toNotion', async (_e, params: { taskId: string }): Promise<ExportResult> => {
    try {
      return await exportNote({ taskId: params.taskId, target: 'notion' })
    } catch (e) {
      return { success: false, error: `导出失败: ${(e as Error).message}` }
    }
  })

  ipcMain.handle('export:notion:testConnection', async (_e, params: NotionTestConnectionParams): Promise<NotionTestConnectionResult> => {
    try {
      return await testNotionConnection(params)
    } catch (e) {
      return { success: false, error: `测试连接失败: ${(e as Error).message}` }
    }
  })
}

// 让 lint 看到类型被使用（避免 unused import 在某些配置下报错）
export type { ExportParams }
