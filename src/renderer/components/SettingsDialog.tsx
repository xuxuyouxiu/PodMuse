import { useState } from 'react'
import { PodcastConfig } from '@shared/types'

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
  const [models, setModels] = useState<Array<{ id: string; label: string; size: string; downloaded: boolean; ramMinGB: number }> | null>(null)
  const [scanningModels, setScanningModels] = useState(false)
  const [modelScanStatus, setModelScanStatus] = useState<string | null>(null)
  const [hardwareWarn, setHardwareWarn] = useState<{ pass: boolean; warning: string | null } | null>(null)

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

  async function handleScanModels() {
    setScanningModels(true)
    setModelScanStatus('扫描中…')
    try {
      const result = await window.electronAPI.scanWhisperModels()
      setModels(result)
      const downloadedCount = result.filter(m => m.downloaded).length
      setModelScanStatus(`找到 ${result.length} 个标准模型，本地已下载 ${downloadedCount} 个`)
    } catch (e: any) {
      setModelScanStatus(`扫描失败: ${e.message}`)
    } finally {
      setScanningModels(false)
    }
  }

  async function handleModelChange(modelId: string) {
    update('whisper_model', modelId)
    try {
      const result = await window.electronAPI.checkWhisperHardware(modelId)
      setHardwareWarn(result)
    } catch {
      setHardwareWarn(null)
    }
  }

  function update(key: keyof PodcastConfig, value: string) {
    setForm((prev: PodcastConfig) => ({ ...prev, [key]: value }))
  }

  async function handleBrowse(key: 'obsidian_dir' | 'audio_dir' | 'whisper_exe_path') {
    if (key === 'whisper_exe_path') {
      const result = await window.electronAPI.selectFile?.()
      if (result) update(key, result)
      return
    }
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

        <section className="settings-section">
          <div className="settings-section-header">
            <div className="settings-section-title">音频识别模型设置</div>
            <div className="settings-section-copy">选择 Whisper 模型版本。首次使用需从下方链接下载模型文件到本地。</div>
          </div>
          <div className="settings-grid">
            <div className="settings-field">
              <div className="settings-field-label">模型选择</div>
              <div className="settings-dir-row">
                <select
                  value={form.whisper_model}
                  onChange={e => handleModelChange(e.target.value)}
                  className="settings-input"
                  style={{ flex: 1, outline: 'none', cursor: 'pointer' }}
                >
                  {(models ?? []).map(m => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.size}){m.downloaded ? ' ✓ 已下载' : ''}
                    </option>
                  ))}
                  {(!models || models.length === 0) && (
                    <>
                      <option value="tiny">Tiny (~1 GB)</option>
                      <option value="base">Base (~1 GB)</option>
                      <option value="small">Small (~2 GB)</option>
                      <option value="medium">Medium (~5 GB)</option>
                      <option value="large-v3">Large v3 (~10 GB)</option>
                      <option value="large-v3-turbo">Large v3 Turbo (~6 GB)</option>
                    </>
                  )}
                </select>
                <button
                  onClick={handleScanModels}
                  disabled={scanningModels}
                  className="settings-browse-button"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {scanningModels ? '…' : '刷新'}
                </button>
              </div>
              {modelScanStatus && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>{modelScanStatus}</div>
              )}
            </div>

            <DirField label="Whisper 可执行文件路径" value={form.whisper_exe_path} placeholder="选择 whisper 可执行文件" onBrowse={() => handleBrowse('whisper_exe_path')} />

            <div className="settings-field">
              <div className="settings-field-label">下载模型</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                模型文件需放置在上述 Whisper 可执行文件同目录下的 models 文件夹中。
                <br />
                <a
                  href="https://github.com/Purfview/whisper-standalone-win/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--accent)', textDecoration: 'none' }}
                >
                  🔗 GitHub 下载 faster-whisper-xxl 模型
                </a>
              </div>
            </div>
          </div>

          {hardwareWarn && hardwareWarn.warning && (
            <div
              style={{
                marginTop: 8, padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                fontSize: 12, lineHeight: 1.5,
                background: hardwareWarn.pass ? 'rgba(255,193,7,0.1)' : 'rgba(244,67,54,0.1)',
                border: `1px solid ${hardwareWarn.pass ? 'rgba(255,193,7,0.3)' : 'rgba(244,67,54,0.3)'}`,
                color: hardwareWarn.pass ? 'var(--text-secondary)' : 'var(--error)',
              }}
            >
              {hardwareWarn.pass ? '⚠ ' : '✖ '}
              {hardwareWarn.warning}
            </div>
          )}
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
