import { useI18n } from '../../i18n'
import { ClipboardPaste } from 'lucide-react'

export function TabHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</div>
    </div>
  )
}

export function DirField({
  label,
  value,
  placeholder,
  onBrowse,
}: {
  label: string
  value: string
  placeholder?: string
  onBrowse: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="settings-field">
      <div className="settings-field-label">{label}</div>
      <div className="settings-dir-row">
        <div className={`settings-dir-display ${value ? 'has-value' : ''}`}>
          {value || placeholder || t('未设置')}
        </div>
        <button onClick={onBrowse} className="settings-browse-button">
          {t('浏览')}
        </button>
      </div>
    </div>
  )
}

export function Field({
  label,
  value,
  onChange,
  secret,
  error,
  required,
  placeholder,
  onPaste,
  pasteTitle,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  secret?: boolean
  error?: string
  required?: boolean
  placeholder?: string
  /** 提供后在该字段旁渲染「粘贴」按钮（读剪贴板填入本字段，Secret 等无特征化字段的兜底） */
  onPaste?: () => void
  /** 粘贴按钮悬浮提示（i18n key） */
  pasteTitle?: string
}) {
  const { t } = useI18n()
  const input = (
    <input
      type={secret ? 'password' : 'text'}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="settings-input"
      placeholder={placeholder}
      style={{
        outline: 'none',
        fontFamily: 'Consolas, monospace',
        borderColor: error ? 'var(--error)' : undefined,
      }}
    />
  )
  return (
    <div className="settings-field">
      <div className="settings-field-label">
        {label}
        {required && <span style={{ color: 'var(--error)', marginLeft: 4 }}>*</span>}
      </div>
      {onPaste ? (
        <div className="settings-dir-row">
          <div style={{ flex: 1 }}>{input}</div>
          <button
            onClick={onPaste}
            className="settings-browse-button"
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            title={pasteTitle ? t(pasteTitle) : undefined}
          >
            <ClipboardPaste size={12} style={{ marginRight: 4, verticalAlign: '-2px' }} />
            {t('粘贴')}
          </button>
        </div>
      ) : (
        input
      )}
      {error && <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 4 }}>{t(error)}</div>}
    </div>
  )
}
