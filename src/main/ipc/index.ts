import { BrowserWindow } from 'electron'
import { registerConfigIPC } from './config-ipc'
import { registerTaskIPC } from './task-ipc'
import { registerSearchIPC } from './search-ipc'
import { registerWindowIPC } from './window-ipc'
import { registerExportIPC } from './export-ipc'
import type { FeishuMonitor } from '../feishu'

/**
 * 注册所有无状态 / 轻量状态的 IPC handler
 * 涉及复杂模块级状态的 handler（podcast、feishu、whisper、ai）由调用方自行注册
 */
export function registerCoreIPC(
  mainWindow?: BrowserWindow | null,
  monitor?: FeishuMonitor | null,
): void {
  registerConfigIPC(mainWindow)
  registerTaskIPC(mainWindow, monitor)
  registerSearchIPC(mainWindow)
  registerWindowIPC(mainWindow)
  registerExportIPC(mainWindow)
}
