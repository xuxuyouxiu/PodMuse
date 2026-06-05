import { PodcastConfig } from '@shared/types'
import { TabHeader, DirField } from './FieldComponents'

export default function TabWhisper({ form, update: _update, models, scanningModels, modelScanStatus, hardwareWarn, showAdvanced, setShowAdvanced, onScanModels, onModelChange, onBrowse }: {
  form: PodcastConfig
  update: (key: keyof PodcastConfig, value: string | boolean) => void
  models: Array<{ id: string; label: string; size: string; downloaded: boolean; ramMinGB: number }> | null
  scanningModels: boolean
  modelScanStatus: string | null
  hardwareWarn: { pass: boolean; warning: string | null } | null
  showAdvanced: boolean
  setShowAdvanced: (v: boolean) => void
  onScanModels: () => void
  onModelChange: (id: string) => void
  onBrowse: (key: 'obsidian_dir' | 'audio_dir' | 'whisper_exe_path') => void
}) {
  return (
    <div>
      <TabHeader title="语音识别模型" subtitle="选择 Whisper 模型版本，首次使用时会自动下载" />
      <div className="settings-grid">
        <div className="settings-field">
          <div className="settings-field-label">模型选择</div>
          <div className="settings-dir-row">
            <select
              value={form.whisper_model}
              onChange={e => onModelChange(e.target.value)}
              className="settings-input"
              style={{ flex: 1, outline: 'none', cursor: 'pointer', colorScheme: 'dark' }}
            >
              {(models ?? []).map(m => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.size}){m.downloaded ? ' ✓' : ' · 未下载'}
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
              onClick={onScanModels}
              disabled={scanningModels}
              className="settings-browse-button"
              style={{ whiteSpace: 'nowrap' }}
            >
              {scanningModels ? '…' : '刷新'}
            </button>
          </div>
          {models && models.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 999,
                background: 'var(--bg-card)', color: 'var(--text-secondary)',
                border: '1px solid var(--border-light)',
              }}>
                已下载 {models.filter(m => m.downloaded).length}/{models.length}
              </span>
              {(() => {
                const selected = models.find(m => m.id === form.whisper_model)
                if (!selected) return null
                return selected.downloaded
                  ? <span style={{ fontSize: 11, color: '#4caf50' }}>✓ 当前模型已就绪</span>
                  : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>⬇ 首次使用将自动下载 ~{selected.ramMinGB}GB</span>
              })()}
            </div>
          )}
          {modelScanStatus && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>{modelScanStatus}</div>
          )}
        </div>

        <div className="settings-field">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="settings-link-button"
            style={{
              background: 'none', border: 'none',
              color: 'var(--accent)', cursor: 'pointer',
              fontSize: 12, padding: 0,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            {showAdvanced ? '▼' : '▶'} 高级设置
          </button>
        </div>

        {showAdvanced && (
          <DirField label="Whisper 可执行文件路径" value={form.whisper_exe_path} placeholder="选择 whisper 可执行文件（可选）" onBrowse={() => onBrowse('whisper_exe_path')} />
        )}

        <div className="settings-field">
          <div className="settings-field-label">下载模型</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Faster-Whisper-XXL 首次运行时会自动下载所选模型到本地缓存目录。
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
        <div style={{
          marginTop: 8, padding: '8px 12px', borderRadius: 'var(--radius-sm)',
          fontSize: 12, lineHeight: 1.5,
          background: hardwareWarn.pass ? 'rgba(255,193,7,0.1)' : 'rgba(244,67,54,0.1)',
          border: `1px solid ${hardwareWarn.pass ? 'rgba(255,193,7,0.3)' : 'rgba(244,67,54,0.3)'}`,
          color: hardwareWarn.pass ? 'var(--text-secondary)' : 'var(--error)',
        }}>
          {hardwareWarn.pass ? '⚠ ' : '✖ '}
          {hardwareWarn.warning}
        </div>
      )}
    </div>
  )
}
