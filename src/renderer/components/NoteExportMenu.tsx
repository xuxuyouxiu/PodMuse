import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (
        popRef.current &&
        !popRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const openMenu = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      let top = rect.bottom + 4
      let left = rect.left
      // 空间不足向上弹
      if (top + 180 > window.innerHeight) {
        top = Math.max(8, rect.top - 180)
      }
      // 右侧溢出向左
      if (left + 160 > window.innerWidth) {
        left = window.innerWidth - 160 - 8
      }
      setPos({ top, left })
    }
    setOpen(o => !o)
  }

  const items: { key: ExportAction; label: string; icon: React.ReactNode }[] = [
    { key: 'share', label: t('分享图'), icon: <ImageIcon size={12} /> },
    { key: 'pdf', label: t('导出 PDF'), icon: <FileText size={12} /> },
    { key: 'md', label: t('导出 Markdown'), icon: <FileCode2 size={12} /> },
    { key: 'notion', label: t('导出到 Notion'), icon: <FileText size={12} /> },
    { key: 'logseq', label: t('导出到 Logseq'), icon: <FileText size={12} /> },
  ]

  return (
    <>
      <button
        ref={btnRef}
        className={`export-menu__trigger ${className || ''}`}
        onClick={openMenu}
        title={t('导出')}
      >
        {busy ? <Loader2 size={size} className="note-preview__spin" /> : <Download size={size} />}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            className="export-menu__pop export-menu__pop--fixed"
            style={{ top: pos.top, left: pos.left }}
          >
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
          </div>,
          document.body,
        )}
    </>
  )
}
