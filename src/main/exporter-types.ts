/**
 * 导出功能的类型定义
 * 单独抽出以避免 exporter.ts 和 notion-converter.ts 之间的循环依赖
 */

export type ExportTarget = 'markdown' | 'logseq' | 'notion'

export interface ExportParams {
  taskId: string
  target: ExportTarget
  targetDir?: string                // markdown 平台必填
  stripObsidianSyntax?: boolean     // markdown 平台可选，默认 false
}

export interface ExportResult {
  success: boolean
  outputPath?: string               // markdown/logseq 的绝对路径
  pageUrl?: string                  // notion 的页面 URL
  pageId?: string                   // notion 的页面 ID
  error?: string                    // 失败时的中文错误
}

export interface NotionTestConnectionParams {
  token: string
  databaseId: string
}

export interface NotionTestConnectionResult {
  success: boolean
  databaseTitle?: string
  error?: string
}
