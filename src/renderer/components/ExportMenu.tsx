import { useState, useRef, useEffect, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Share, FileText, BookOpen, Globe, Loader2 } from 'lucide-react'
import { useI18n } from '../i18n'

interface Props {
  taskId: string
  logseqDir: string // 配置中的 export.logseq_dir
  notionConfigured: boolean // export.notion.token 和 database_id 都有值
  onToast: (msg: string, type: 'success' | 'error') => void
}

type ExportTarget = 'markdown' | 'logseq' | 'notion'

export default function ExportMenu({ taskId, logseqDir, notionConfigured, onToast }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState<ExportTarget | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const containerRef: RefObject<HTMLDivElement> = useRef(null)
  const btnRef: RefObject<HTMLButtonElement> = useRef(null)
  const menuRef: RefObject<HTMLDivElement> = useRef(null)

  const openMenu = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      const menuHeight = 120 // 三个菜单项的估算高度
      const menuWidth = 180
      let top = rect.bottom + 4
      let left = rect.left

      // 空间不够往下展开时，往上弹
      if (top + menuHeight > window.innerHeight) {
        top = rect.top - menuHeight - 4
      }
      // 右侧溢出时往左移
      if (left + menuWidth > window.innerWidth) {
        left = window.innerWidth - menuWidth - 8
      }

      setMenuPos({ top, left })
    }
    setOpen(true)
  }

  // 点击外部关闭下拉
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open])

  async function handleExportMarkdown() {
    if (exporting) return
    setOpen(false)
    setExporting('markdown')
    try {
      const targetDir = await window.electronAPI.selectDir()
      if (!targetDir) {
        setExporting(null)
        return
      }
      const result = await window.electronAPI.exportToMarkdown({
        taskId,
        targetDir,
        stripObsidianSyntax: false,
      })
      if (result.success && result.outputPath) {
        onToast(t('已导出到 Markdown') + '：' + result.outputPath, 'success')
      } else {
        onToast(result.error || t('导出失败'), 'error')
      }
    } catch (e) {
      onToast(t('导出失败') + ': ' + (e as Error).message, 'error')
    } finally {
      setExporting(null)
    }
  }

  async function handleExportLogseq() {
    if (exporting) return
    setOpen(false)
    setExporting('logseq')
    try {
      const result = await window.electronAPI.exportToLogseq(taskId)
      if (result.success && result.outputPath) {
        onToast(t('已导出到 Logseq') + '：' + result.outputPath, 'success')
      } else {
        onToast(result.error || t('导出失败'), 'error')
      }
    } catch (e) {
      onToast(t('导出失败') + ': ' + (e as Error).message, 'error')
    } finally {
      setExporting(null)
    }
  }

  async function handleExportNotion() {
    if (exporting) return
    setOpen(false)
    setExporting('notion')
    try {
      const result = await window.electronAPI.exportToNotion(taskId)
      if (result.success && result.pageUrl) {
        onToast(t('已导出到 Notion'), 'success')
        // 提供"在浏览器中打开"链接：自动打开
        try {
          await window.electronAPI.openExternal(result.pageUrl)
        } catch {
          // 静默失败，用户已收到 toast 通知
        }
      } else if (result.pageUrl) {
        // 重复检测失败：有 existingPageUrl 但 success=false
        onToast(result.error + t('（页面已存在）'), 'error')
        try {
          await window.electronAPI.openExternal(result.pageUrl)
        } catch {}
      } else {
        onToast(result.error || t('导出失败'), 'error')
      }
    } catch (e) {
      onToast(t('导出失败') + ': ' + (e as Error).message, 'error')
    } finally {
      setExporting(null)
    }
  }

  const logseqEnabled = !!logseqDir.trim()
  const notionEnabled = notionConfigured
  const isExporting = exporting !== null

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              boxShadow: 'var(--shadow-md)',
              zIndex: 99999,
              minWidth: 180,
              overflow: 'hidden',
            }}
          >
            <button
              onClick={handleExportMarkdown}
              disabled={isExporting}
              style={menuItemStyle(false)}
              onMouseEnter={e =>
                !isExporting && (e.currentTarget.style.background = 'var(--bg-hover)')
              }
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <FileText size={14} />
              <span>Markdown…</span>
            </button>

            <button
              onClick={handleExportLogseq}
              disabled={isExporting || !logseqEnabled}
              title={logseqEnabled ? t('导出到 Logseq 目录') : t('未配置 Logseq 目录，请在设置中配置')}
              style={menuItemStyle(!logseqEnabled)}
              onMouseEnter={e =>
                logseqEnabled &&
                !isExporting &&
                (e.currentTarget.style.background = 'var(--bg-hover)')
              }
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <BookOpen size={14} />
              <span>Logseq</span>
              {!logseqEnabled && <span style={disabledHintStyle}>{t('未配置')}</span>}
            </button>

            <button
              onClick={handleExportNotion}
              disabled={isExporting || !notionEnabled}
              title={
                notionEnabled ? t('上传到 Notion database') : t('未配置 Notion 集成，请在设置中配置')
              }
              style={menuItemStyle(!notionEnabled)}
              onMouseEnter={e =>
                notionEnabled &&
                !isExporting &&
                (e.currentTarget.style.background = 'var(--bg-hover)')
              }
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <Globe size={14} />
              <span>Notion</span>
              {!notionEnabled && <span style={disabledHintStyle}>{t('未配置')}</span>}
            </button>
          </div>,
          document.body,
        )
      : null

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={btnRef}
        onClick={() => (open ? setOpen(false) : openMenu())}
        disabled={isExporting}
        className="recent-task-secondary"
        title={t('导出到其他平台')}
        style={{ opacity: isExporting ? 0.6 : 1 }}
      >
        {exporting ? <Loader2 size={12} className="animate-spin" /> : <Share size={12} />}
        {exporting ? t('导出中...') : t('导出')}
      </button>
      {menu}
    </div>
  )
}

function menuItemStyle(disabled: boolean): React.CSSProperties {
  return {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    border: 'none',
    background: 'transparent',
    color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13,
    fontWeight: 400,
    textAlign: 'left',
    justifyContent: 'flex-start',
    transition: 'background 0.15s',
  }
}

const disabledHintStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: 10,
  color: 'var(--text-muted)',
}
