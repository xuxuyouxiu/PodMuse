import { ipcMain } from 'electron'
import { generateShareCard } from '../share-card'

export function registerShareIpc(): void {
  ipcMain.handle(
    'share:generate',
    async (
      _e,
      params: { notePath: string; title: string; podcastName?: string; platform?: string },
    ) => {
      return generateShareCard(params || { notePath: '', title: '' })
    },
  )
}
