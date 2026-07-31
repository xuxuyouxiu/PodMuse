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
  return (
    <div className="settings-field">
      <div className="settings-field-label">{label}</div>
      <div className="settings-dir-row">
        <div className={`settings-dir-display ${value ? 'has-value' : ''}`}>
          {value || placeholder || '未设置'}
        </div>
        <button onClick={onBrowse} className="settings-browse-button">
          浏览
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
}: {
  label: string
  value: string
  onChange: (v: string) => void
  secret?: boolean
  error?: string
  required?: boolean
  placeholder?: string
}) {
  return (
    <div className="settings-field">
      <div className="settings-field-label">
        {label}
        {required && <span style={{ color: 'var(--error)', marginLeft: 4 }}>*</span>}
      </div>
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
      {error && <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 4 }}>{error}</div>}
    </div>
  )
}
