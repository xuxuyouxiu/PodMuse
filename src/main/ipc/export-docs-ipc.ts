import { ipcMain } from 'electron'
import { exportNotePdf, exportNoteMd, exportCollectionPdf } from '../export-docs'

export function registerExportDocsIpc(): void {
  ipcMain.handle('export:pdf', async (_e, params: { notePath: string; title?: string }) => {
    return exportNotePdf(params || { notePath: '' })
  })
  ipcMain.handle('export:md', async (_e, params: { notePath: string; title?: string }) => {
    return exportNoteMd(params || { notePath: '' })
  })
  ipcMain.handle(
    'export:pdfCollection',
    async (_e, params: { items: { notePath: string; title: string }[] }) => {
      return exportCollectionPdf(params || { items: [] })
    },
  )
}
