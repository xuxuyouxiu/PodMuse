import { useState, useEffect } from 'react'
import { X, ExternalLink, Loader2 } from 'lucide-react'
import NoteMarkdown from './NoteMarkdown'
import { useI18n } from '../i18n'

interface Props {
  filePath: string
  filename?: string
  obsidianDir?: string
  onClose: () => void
}

/**
 * 笔记预览弹窗 — 读取生成的 Markdown 笔记并渲染展示
 */
export default function NotePreviewDialog({ filePath, filename, onClose }: Props) {
  const { t } = useI18n()
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    window.electronAPI
      .readNote(filePath)
      .then(res => {
        if (cancelled) return
        if (res.success && res.content) {
          setContent(res.content)
        } else {
          setError(res.error || t('读取失败'))
        }
      })
      .catch(e => {
        if (!cancelled) setError((e as Error).message || t('读取失败'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [filePath, t])

  return (
    <div
      className="note-preview-overlay"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="note-preview">
        <div className="note-preview__header">
          <span className="note-preview__title" title={filename || filePath}>
            {filename || t('笔记预览')}
          </span>
          <div className="note-preview__actions">
            <button
              className="note-preview__btn"
              onClick={() => window.electronAPI.openPath(filePath)}
              title={t('打开笔记')}
            >
              <ExternalLink size={13} />
              {t('打开')}
            </button>
            <button className="note-preview__btn" onClick={onClose} title={t('关闭')}>
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="note-preview__body">
          {loading ? (
            <div className="note-preview__status">
              <Loader2 size={18} className="note-preview__spin" />
              {t('加载中...')}
            </div>
          ) : error ? (
            <div className="note-preview__status note-preview__status--error">{error}</div>
          ) : (
            <NoteMarkdown content={content} />
          )}
        </div>
      </div>
    </div>
  )
}
