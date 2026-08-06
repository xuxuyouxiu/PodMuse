import { app, BrowserWindow, Notification, nativeImage } from 'electron'
import { join } from 'path'
import * as fs from 'fs'

let appIcon: Electron.NativeImage | undefined
let iconResolved = false

function getIcon(): Electron.NativeImage | undefined {
  if (iconResolved) return appIcon
  iconResolved = true
  try {
    const baseDirs = [process.resourcesPath, join(__dirname, '..', '..'), app.getAppPath()].filter(
      Boolean,
    )
    const candidates = ['build/icon.png', '播客笔记_256.png', '播客笔记.png']
    for (const base of baseDirs) {
      for (const c of candidates) {
        const p = join(base, c)
        if (fs.existsSync(p)) {
          appIcon = nativeImage.createFromPath(p)
          return appIcon
        }
      }
    }
  } catch {}
  return undefined
}

export function setupNotificationAppId() {
  // Windows 需要设置 AppUserModelID 才能在 Action Center 正确显示通知
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.podcastnotes.app')
  }
}

export function sendNotification(title: string, body: string, onClick?: () => void) {
  if (!Notification.isSupported()) return
  try {
    const n = new Notification({ title, body, icon: getIcon() })

    // 点击通知时恢复窗口
    n.on('click', () => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
      }
      onClick?.()
    })

    n.show()
  } catch {}
}
