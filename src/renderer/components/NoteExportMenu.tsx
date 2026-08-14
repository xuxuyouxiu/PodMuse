import { useState, useRef, useEffect } from 'react'
import { Download, Image as ImageIcon, FileText, FileCode2, Loader2 } from 'lucide-react'
import { useI18n } from '../i18n'

export type ExportAction = 'share' | 'pdf' | 'md' | 'notion' | 'logseq'

interface Props {
  /** 当前正在执行的导出动作（显示 loading） */
  busy?: ExportAction | null
  onAction: (action: ExportAction) => void
  className?: string
  size?: number
}

/** 统一导出菜单（笔记本地导出）：分享图 / PDF / Markdown / Notion / Logseq */
export default function NoteExportMenu({ busy, onAction, className, size = 13 }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const items: { key: ExportAction; label: string; icon: React.ReactNode }[] = [
    { key: 'share', label: t('分享图'), icon: <ImageIcon size={12} /> },
    { key: 'pdf', label: t('导出 PDF'), icon: <FileText size={12} /> },
    { key: 'md', label: t('导出 Markdown'), icon: <FileCode2 size={12} /> },
    { key: 'notion', label: t('导出到 Notion'), icon: <FileText size={12} /> },
    { key: 'logseq', label: t('导出到 Logseq'), icon: <FileText size={12} /> },
  ]

  return (
    <div className="export-menu" ref={ref}>
      <button
        className={`export-menu__trigger ${className || ''}`}
        onClick={() => setOpen(o => !o)}
        title={t('导出')}
      >
        {busy ? <Loader2 size={size} className="note-preview__spin" /> : <Download size={size} />}
      </button>
      {open && (
        <div className="export-menu__pop">
          {items.map(item => (
            <button
              key={item.key}
              className="export-menu__item"
              disabled={!!busy}
              onClick={() => {
                setOpen(false)
                onAction(item.key)
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
