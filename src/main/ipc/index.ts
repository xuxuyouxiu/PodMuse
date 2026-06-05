import { BrowserWindow } from 'electron'
import { registerConfigIPC } from './config-ipc'
import { registerTaskIPC } from './task-ipc'
import { registerSearchIPC } from './search-ipc'
import { registerWindowIPC } from './window-ipc'

/**
 * 注册所有无状态 / 轻量状态的 IPC handler
 * 涉及复杂模块级状态的 handler（podcast、feishu、whisper、ai）由调用方自行注册
 */
export function registerCoreIPC(mainWindow?: BrowserWindow | null): void {
  registerConfigIPC(mainWindow)
  registerTaskIPC(mainWindow)
  registerSearchIPC(mainWindow)
  registerWindowIPC(mainWindow)
}
