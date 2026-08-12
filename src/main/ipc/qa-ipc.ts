/**
 * QA IPC — 问答事件通道
 * renderer 调 qa:ask 发起提问；主进程通过 qa:chunk / qa:done / qa:error 事件推送
 */

import { ipcMain } from 'electron'
import { loadConfig } from '../config'
import { getActiveProviderConfig } from '../ai-providers'
import { askQuestion } from '../qa-service'

const activeRequests = new Map<string, AbortController>()

export function registerQaIpc(): void {
  ipcMain.handle('qa:ask', async (event, params: { requestId: string; question: string }) => {
    const { requestId, question } = params || {}
    const sender = event.sender

    if (!requestId || !question || typeof question !== 'string' || !question.trim()) {
      return { success: false, error: '无效请求' }
    }

    // 取消同窗口的前一个请求
    const prev = activeRequests.get(requestId)
    if (prev) prev.abort()
    const controller = new AbortController()
    activeRequests.set(requestId, controller)

    try {
      const config = loadConfig()
      const obsidianDir = config.obsidian_dir?.trim() || ''
      const providerConfig = getActiveProviderConfig(config.ai_provider, config.ai_providers)

      if (!providerConfig) {
        sender.send('qa:error', { requestId, error: '未配置 AI 模型，请在设置中配置' })
        return { success: true, started: false }
      }
      if (!obsidianDir) {
        sender.send('qa:error', { requestId, error: '未配置 Obsidian 笔记目录' })
        return { success: true, started: false }
      }

      const result = await askQuestion(
        obsidianDir,
        providerConfig,
        config.ai_provider,
        question.trim(),
        text => sender.send('qa:chunk', { requestId, text }),
        controller.signal,
      )
      sender.send('qa:done', { requestId, answer: result.answer, sources: result.sources })
      return { success: true, started: true }
    } catch (e: unknown) {
      const err = e as Error
      if (err.name === 'AbortError') {
        sender.send('qa:error', { requestId, error: '已取消', aborted: true })
      } else {
        sender.send('qa:error', { requestId, error: err.message || '回答失败' })
      }
      return { success: true, started: false }
    } finally {
      activeRequests.delete(requestId)
    }
  })

  ipcMain.handle('qa:cancel', (_e, requestId: string) => {
    const ctrl = activeRequests.get(requestId)
    if (ctrl) ctrl.abort()
    return true
  })
}
