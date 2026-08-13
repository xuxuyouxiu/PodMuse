/**
 * 订阅 IPC
 */

import { ipcMain } from 'electron'
import type { SubscriptionService } from '../subscription-service'

export function registerSubscriptionIPC(service: SubscriptionService): void {
  ipcMain.handle('subscription:list', () => service.info())

  ipcMain.handle(
    'subscription:add',
    async (_e, params: { name: string; url: string }) => {
      return service.add(params?.name || '', params?.url || '')
    },
  )

  ipcMain.handle('subscription:remove', (_e, id: string) => {
    service.remove(id)
    return true
  })

  ipcMain.handle(
    'subscription:update',
    (_e, params: { id: string; patch: { name?: string; autoProcess?: boolean; enabled?: boolean } }) => {
      service.update(params?.id, params?.patch || {})
      return true
    },
  )

  ipcMain.handle('subscription:checkNow', (_e, id?: string) => service.checkNow(id))

  ipcMain.handle('subscription:markSeen', (_e, params: { subId: string; keys: string[] }) => {
    service.markSeen(params?.subId || '', params?.keys || [])
    return true
  })
}
