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
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        animation: 'fadeIn 0.2s',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 380,
          maxWidth: 'calc(100vw - 32px)',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          padding: '24px 24px 20px',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          animation: 'modalSlide 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* 图标和标题 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-md)',
              background: danger ? 'rgba(240, 64, 96, 0.15)' : 'rgba(108, 92, 231, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              flexShrink: 0,
            }}
          >
            {danger ? <AlertTriangle size={20} /> : <HelpCircle size={20} />}
          </div>
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--text-primary)',
                lineHeight: 1.4,
              }}
            >
              {title}
            </div>
          </div>
        </div>

        {/* 消息内容 */}
        <div
          style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            paddingLeft: 52,
          }}
        >
          {message}
        </div>

        {/* 按钮组 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            marginTop: 4,
          }}
        >
          <button
            onClick={onCancel}
            style={{
              height: 36,
              padding: '0 16px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-primary)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--bg-surface)'
              e.currentTarget.style.borderColor = 'var(--border-light)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--bg-card)'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          >
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            style={{
              height: 36,
              padding: '0 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: danger ? 'var(--error)' : 'var(--accent)',
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: danger
                ? '0 2px 12px rgba(240, 64, 96, 0.3)'
                : '0 2px 12px rgba(108, 92, 231, 0.3)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.opacity = '0.9'
              e.currentTarget.style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.opacity = '1'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}