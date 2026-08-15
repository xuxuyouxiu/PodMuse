import { ipcMain } from 'electron'
import { generateShareCard } from '../share-card'
import { sendNotification } from '../notify'

export function registerShareIpc(): void {
  ipcMain.handle(
    'share:generate',
    async (
      _e,
      params: { notePath: string; title: string; podcastName?: string; platform?: string },
    ) => {
      const result = await generateShareCard(params || { notePath: '', title: '' })
      // AI 未生效时给用户明确提示，方便排查
      if (result.success && !result.cancelled && result.warning) {
        sendNotification('分享图已生成（AI 未生效）', result.warning)
      }
      return result
    },
  )
}
