import { useState } from 'react'
import { PodcastConfig } from '@shared/types'
import { TabHeader, DirField } from './FieldComponents'
import { useI18n } from '../../i18n'
import { ExternalLink, AlertTriangle, AlertCircle, ArrowDown, Search, CheckCircle2 } from 'lucide-react'

export default function TabWhisper({
  form,
  update,
  models,
  scanningModels,
  modelScanStatus,
  hardwareWarn,
  showAdvanced,
  setShowAdvanced,
  onScanModels,
  onModelChange,
  onBrowse,
}: {
  form: PodcastConfig
  update: (key: keyof PodcastConfig, value: string | boolean) => void
  models: Array<{
    id: string
    label: string
    size: string
    downloaded: boolean
    ramMinGB: number
  }> | null
  scanningModels: boolean
  modelScanStatus: string | null
  hardwareWarn: { pass: boolean; warning: string | null } | null
  showAdvanced: boolean
  setShowAdvanced: (v: boolean) => void
  onScanModels: () => void
  onModelChange: (id: string) => void
  onBrowse: (key: 'obsidian_dir' | 'audio_dir' | 'whisper_exe_path') => void
}) {
  const [detecting, setDetecting] = useState(false)
  const [detectResult, setDetectResult] = useState<string | null>(null)
  const handleAutoDetect = async () => {
    setDetecting(true)
    setDetectResult(null)
    try {
      const res = await window.electronAPI.autoDetectWhisper()
      if (res.path) {
        update('whisper_exe_path', res.path)
        setDetectResult('found')
      } else {
        setDetectResult('notfound')
      }
    } catch {
      setDetectResult('notfound')
    } finally {
      setDetecting(false)
    }
  }

  const { t } = useI18n()
  return (
    <div>
      <TabHeader title={t('语音识别模型')} subtitle={t('选择 Whisper 模型版本，首次使用时会自动下载')} />
      <div className="settings-grid">
        <div className="settings-field">
          <div className="settings-field-label">{t('模型选择')}</div>
          <div className="settings-dir-row">
            <select
              value={form.whisper_model}
              onChange={e => onModelChange(e.target.value)}
              className="settings-input"
              style={{ flex: 1, outline: 'none', cursor: 'pointer', colorScheme: 'dark' }}
            >
              {(models ?? []).map(m => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.size}){m.downloaded ? ' ✓' : ' · ' + t('未下载')}
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
              {scanningModels ? '…' : t('刷新')}
            </button>
          </div>
          {models && models.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'var(--bg-card)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-light)',
                }}
              >
                {t('已下载')} {models.filter(m => m.downloaded).length}/{models.length}
              </span>
              {(() => {
                const selected = models.find(m => m.id === form.whisper_model)
                if (!selected) return null
                return selected.downloaded ? (
                  <span style={{ fontSize: 11, color: 'var(--success)' }}>✓ {t('当前模型已就绪')}</span>
                ) : (
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                  >
                    <ArrowDown size={11} />
                    {t('首次使用将自动下载')} ~{selected.ramMinGB}GB
                  </span>
                )
              })()}
            </div>
          )}
          {modelScanStatus && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
              {t(modelScanStatus)}
            </div>
          )}
        </div>

        <div className="settings-field">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="settings-link-button"
          >
            {showAdvanced ? '▼' : '▶'} {t('高级设置')}
          </button>
        </div>

        {showAdvanced && (
          <>
          <DirField
            label={t('Whisper 可执行文件路径')}
            value={form.whisper_exe_path}
            placeholder={t('选择 whisper 可执行文件（可选）')}
            onBrowse={() => onBrowse('whisper_exe_path')}
          />
          <div className="settings-test-row">
            <button
              onClick={handleAutoDetect}
              disabled={detecting}
              className="settings-browse-button"
            >
              <Search size={12} />
              {detecting ? t('自动检测中…') : t('自动检测引擎')}
            </button>
            {detectResult === 'found' && (
              <span className="settings-test-result--success">
                <CheckCircle2 size={12} />
                {t('已自动检测并填入路径')}
              </span>
            )}
            {detectResult === 'notfound' && (
              <span className="settings-test-result--error">
                {t('未找到 Whisper 引擎，请手动选择或安装 faster-whisper-xxl')}
              </span>
            )}
          </div>
          </>
        )}

        <div className="settings-field">
          <div className="settings-field-label">{t('下载模型')}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {t('Faster-Whisper-XXL 首次运行时会自动下载所选模型到本地缓存目录。')}
            <br />
            <span
              onClick={() =>
                window.electronAPI.openExternal(
                  'https://github.com/Purfview/whisper-standalone-win/releases',
                )
              }
              style={{ color: 'var(--accent)', textDecoration: 'none', cursor: 'pointer' }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <ExternalLink size={12} />
                {t('GitHub 下载 faster-whisper-xxl 模型')}
              </span>
            </span>
          </div>
        </div>
      </div>

      {hardwareWarn && hardwareWarn.warning && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            lineHeight: 1.5,
            background: hardwareWarn.pass ? 'rgba(255,193,7,0.1)' : 'rgba(244,67,54,0.1)',
            border: `1px solid ${hardwareWarn.pass ? 'rgba(255,193,7,0.3)' : 'rgba(244,67,54,0.3)'}`,
            color: hardwareWarn.pass ? 'var(--text-secondary)' : 'var(--error)',
          }}
        >
          {hardwareWarn.pass ? (
            <AlertTriangle
              size={13}
              style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }}
            />
          ) : (
            <AlertCircle
              size={13}
              style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }}
            />
          )}
          {t(hardwareWarn.warning)}
        </div>
      )}
    </div>
  )
}
