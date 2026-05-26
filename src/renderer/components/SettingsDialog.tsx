import { useState } from 'react'
import { PodcastConfig } from '../../../shared/types'

interface MigrateResult {
  scanned: number
  moved: number
  renamed: number
  skipped: number
  errors: string[]
}

interface Props {
  config: PodcastConfig
  onSave: (config: PodcastConfig) => void
  onClose: () => void
}

export default function SettingsDialog({ config, onSave, onClose }: Props) {
  const [form, setForm] = useState<PodcastConfig>({ ...config })
  const [migrating, setMigrating] = useState(false)
  const [migrateResult, setMigrateResult] = useState<MigrateResult | null>(null)

  async function handleMigrate() {
    setMigrating(true)
    setMigrateResult(null)
    try {
      const result = await window.electronAPI.migrateObsidianNotes()
      setMigrateResult(result)
    } catch (e: any) {
      setMigrateResult({ scanned: 0, moved: 0, renamed: 0, skipped: 0, errors: [e.message || String(e)] })
    } finally {
      setMigrating(false)
    }
  }

  function update(key: keyof PodcastConfig, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleBrowse(key: 'obsidian_dir' | 'audio_dir') {
    const dir = await window.electronAPI.selectDir()
    if (dir) update(key, dir)
  }

  function handleSave() {
    onSave({
      ...form,
      api_key: form.api_key.trim(),
      feishu_app_id: form.feishu_app_id.trim(),
      feishu_app_secret: form.feishu_app_secret.trim(),
      feishu_chat_id: form.feishu_chat_id.trim(),
    })
    onClose()
  }

  return (
    <div
      onClick={onClose}
      className="settings-dialog-overlay"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        animation: 'fadeIn 0.2s',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="settings-dialog"
        style={{
          width: 520,
          maxWidth: 'calc(100vw - 32px)',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          padding: 24,
          boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column', gap: 16,
          animation: 'modalSlide 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div className="settings-dialog-header">
          <div className="settings-dialog-title">⚙ 配置</div>
          <div className="settings-dialog-subtitle">统一管理飞书、转写和目录设置</div>
        </div>

        <section className="settings-section">
          <div className="settings-section-header">
            <div className="settings-section-title">接口与消息通知</div>
            <div className="settings-section-copy">保持现有字段不变，统一为工作台表单布局。</div>
          </div>
          <div className="settings-grid">
            <Field label="DeepSeek API Key" value={form.api_key} onChange={v => update('api_key', v)} secret />
            <Field label="飞书 App ID" value={form.feishu_app_id} onChange={v => update('feishu_app_id', v)} />
            <Field label="飞书 App Secret" value={form.feishu_app_secret} onChange={v => update('feishu_app_secret', v)} secret />
            <Field label="飞书群聊 Chat ID" value={form.feishu_chat_id} onChange={v => update('feishu_chat_id', v)} />
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-header">
            <div className="settings-section-title">转写偏好</div>
            <div className="settings-section-copy">语种与缓存目录使用相同的工作台控件风格。</div>
          </div>
          <div className="settings-grid">
            <div className="settings-field">
              <div className="settings-field-label">语音识别语言</div>
              <div className="settings-radio-grid">
                {([
                  { val: 'zh', label: '中文' },
                  { val: 'en', label: '英文' },
                  { val: 'auto', label: '自动检测 (中英混合)' },
                ] as const).map(({ val, label }) => (
                  <label key={val} className="settings-radio">
                    <input
                      type="radio"
                      name="lang"
                      value={val}
                      checked={form.language === val}
                      onChange={() => update('language', val)}
                      style={{ accentColor: 'var(--accent)' }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <DirField label="Obsidian 笔记目录" value={form.obsidian_dir} onBrowse={() => handleBrowse('obsidian_dir')} />
            <DirField label="音频缓存目录" value={form.audio_dir} placeholder="默认（用户数据目录）" onBrowse={() => handleBrowse('audio_dir')} />
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-header">
            <div className="settings-section-title">笔记分类</div>
            <div className="settings-section-copy">按核心大分类归档笔记（保留原 tags），不按细分标签建目录。</div>
          </div>
          <div className="settings-grid">
            <div className="settings-field">
              <div className="settings-field-label">分类配置文件</div>
              <div className="settings-dir-display has-value">
                {form.obsidian_dir ? `${form.obsidian_dir}\\podcast_categories.json` : '未设置 Obsidian 目录'}
              </div>
            </div>
            <div className="settings-field">
              <div className="settings-field-label">整理存量笔记</div>
              <div className="settings-dir-row">
                <button
                  onClick={handleMigrate}
                  disabled={migrating}
                  className="settings-save-button"
                  style={{ flex: 1, opacity: migrating ? 0.6 : 1 }}
                >
                  {migrating ? '整理中…' : '整理存量笔记'}
                </button>
              </div>
              {migrateResult && (
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <div>扫描 {migrateResult.scanned} 篇，移动 {migrateResult.moved} 篇{migrateResult.renamed > 0 ? `（${migrateResult.renamed} 篇因重名自动改名）` : ''}，跳过 {migrateResult.skipped} 篇</div>
                  {migrateResult.errors.length > 0 && (
                    <div style={{ marginTop: 4, padding: '6px 8px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {migrateResult.errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="settings-actions">
          <button onClick={onClose} className="tailbar-button">取消</button>
          <button onClick={handleSave} className="settings-save-button">
            保存
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes modalSlide { from { opacity:0; transform: translateY(20px) scale(0.96); } to { opacity:1; transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  )
}

function DirField({ label, value, placeholder, onBrowse }: {
  label: string; value: string; placeholder?: string; onBrowse: () => void
}) {
  return (
    <div className="settings-field">
      <div className="settings-field-label">
        {label}
      </div>
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

function Field({ label, value, onChange, secret }: {
  label: string; value: string; onChange: (v: string) => void; secret?: boolean
}) {
  return (
    <div className="settings-field">
      <div className="settings-field-label">
        {label}
      </div>
      <input
        type={secret ? 'password' : 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="settings-input"
        style={{
          outline: 'none',
          fontFamily: 'Consolas, monospace',
        }}
      />
    </div>
  )
}
