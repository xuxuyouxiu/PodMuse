import { useState, useEffect } from 'react'
import { X, ExternalLink, Loader2 } from 'lucide-react'
import { marked } from 'marked'
import { useI18n } from '../i18n'

interface Props {
  filePath: string
  filename?: string
  obsidianDir?: string
  onClose: () => void
}

/** 简单清理：移除 script 标签等危险内容 */
function sanitizeHtml(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '')
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

  // 渲染 markdown（移除 frontmatter）
  const renderHtml = () => {
    let md = content
    const fmEnd = md.indexOf('\n---', 3)
    if (md.startsWith('---') && fmEnd > 0) {
      md = md.substring(fmEnd + 4)
    }
    try {
      return sanitizeHtml(marked.parse(md, { breaks: true }) as string)
    } catch {
      return `<pre>${md.replace(/</g, '&lt;')}</pre>`
    }
  }

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
            <div
              className="note-preview__markdown markdown-body"
              dangerouslySetInnerHTML={{ __html: renderHtml() }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
