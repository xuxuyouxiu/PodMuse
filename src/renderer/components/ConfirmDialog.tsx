import { useEffect, useRef } from 'react'
import { AlertTriangle, HelpCircle } from 'lucide-react'

interface Props {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  // 自动聚焦确认按钮
  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  // ESC 键关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div
      className="confirm-dialog-overlay"
      onClick={onCancel}
    >
      <div
        className="confirm-dialog-modal"
        onClick={e => e.stopPropagation()}
      >
        {/* 图标和标题 */}
        <div className="confirm-dialog-header">
          <div
            className={`confirm-dialog-icon ${danger ? 'confirm-dialog-icon--danger' : 'confirm-dialog-icon--default'}`}
          >
            {danger ? <AlertTriangle size={20} /> : <HelpCircle size={20} />}
          </div>
          <div>
            <div className="confirm-dialog-title">
              {title}
            </div>
          </div>
        </div>

        {/* 消息内容 */}
        <div className="confirm-dialog-message">
          {message}
        </div>

        {/* 按钮组 */}
        <div className="confirm-dialog-actions">
          <button
            className="confirm-dialog-cancel-btn"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            className={`confirm-dialog-confirm-btn ${danger ? 'confirm-dialog-confirm-btn--danger' : ''}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}