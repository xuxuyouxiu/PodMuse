import { useEffect, useState } from 'react'
import { PodcastConfig, WhisperDownloadState } from '@shared/types'
import { TabHeader, DirField } from './FieldComponents'
import { useI18n } from '../../i18n'
import GuideCarousel from '../GuideCarousel'
import {
  ExternalLink,
  AlertTriangle,
  AlertCircle,
  ArrowDown,
  Search,
  CheckCircle2,
  BookOpen,
  Download,
  RotateCcw,
} from 'lucide-react'

const WHISPER_RELEASES_URL = 'https://github.com/Purfview/whisper-standalone-win/releases'

export default function TabWhisper({
  form,
  update,
  models,
  scanningModels,
  modelScanStatus,
  hardwareWarn,
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
  onScanModels: () => void
  onModelChange: (id: string) => void
  onBrowse: (key: 'obsidian_dir' | 'audio_dir' | 'whisper_exe_path') => void
}) {
  const [detecting, setDetecting] = useState(false)
  const [detectResult, setDetectResult] = useState<string | null>(null)
  const [guideKey, setGuideKey] = useState<string | null>(null)
  const [dlState, setDlState] = useState<WhisperDownloadState | null>(null)

  // 挂载时拉取主进程下载状态并订阅进度事件（下载在后台持续，重进设置页/切换 tab 后可续看）
  useEffect(() => {
    let disposed = false
    window.electronAPI
      .getWhisperDownloadStatus()
      .then(s => {
        if (!disposed) setDlState(s)
      })
      .catch(() => {})
    const off = window.electronAPI.onWhisperDownloadProgress(setDlState)
    return () => {
      disposed = true
      off()
    }
  }, [])

  // 安装完成后自动回填路径（主进程已 saveConfig，这里同步设置页表单）
  useEffect(() => {
    if (dlState?.status === 'installed' && dlState.exePath && form.whisper_exe_path !== dlState.exePath) {
      update('whisper_exe_path', dlState.exePath)
    }
  }, [dlState, form.whisper_exe_path, update])

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

  const handleInstall = async () => {
    try {
      const s = await window.electronAPI.downloadWhisper()
      setDlState(s)
    } catch (e) {
      setDlState({
        status: 'error',
        progress: 0,
        message: String(e instanceof Error ? e.message : e),
      })
    }
  }

  const handleCancelDownload = async () => {
    await window.electronAPI.cancelWhisperDownload()
  }

  const handleOpenReleases = () => {
    void window.electronAPI.openExternal(WHISPER_RELEASES_URL)
  }

  const { t } = useI18n()

  const downloadActive =
    dlState?.status === 'checking' || dlState?.status === 'downloading' || dlState?.status === 'extracting'

  const statusLabel = (() => {
    if (!dlState) return ''
    switch (dlState.status) {
      case 'checking':
        return t('正在获取最新版本信息…')
      case 'downloading':
        return t('下载中') + ' ' + dlState.progress + '%'
      case 'extracting':
        return t('正在解压安装…')
      case 'installed':
        return t('已安装并自动配置')
      case 'error':
        return t('安装失败')
      case 'cancelled':
        return t('已取消下载')
      default:
        return ''
    }
  })()

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
              className="settings-input st-model-select"
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
              className="settings-browse-button st-nowrap"
            >
              {scanningModels ? '…' : t('刷新')}
            </button>
          </div>
          {models && models.length > 0 && (
            <div className="st-row st-mt-8">
              <span className="st-badge">
                {t('已下载')} {models.filter(m => m.downloaded).length}/{models.length}
              </span>
              {(() => {
                const selected = models.find(m => m.id === form.whisper_model)
                if (!selected) return null
                return selected.downloaded ? (
                  <span className="st-success">✓ {t('当前模型已就绪')}</span>
                ) : (
                  <span className="st-inline-flex st-muted">
                    <ArrowDown size={11} />
                    {t('首次使用将自动下载')} ~{selected.ramMinGB}GB
                  </span>
                )
              })()}
            </div>
          )}
          {modelScanStatus && (
            <div className="st-mt-6 st-muted">{t(modelScanStatus)}</div>
          )}
        </div>

        <div className="settings-field">
          <div className="settings-field-label">
            {t('Whisper 可执行文件路径')}
            <span className="st-required-mark">*</span>
          </div>
          <DirField
            label=""
            value={form.whisper_exe_path}
            placeholder={t('必填：选择或自动检测 whisper 引擎文件')}
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

          {/* 一键安装 Faster-Whisper-XXL（后台下载，与首次启动向导共用主进程下载状态） */}
          {!form.whisper_exe_path && dlState?.status !== 'installed' && (
            <div className="st-box">
              {downloadActive ? (
                <>
                  <div className="st-between st-mb-6">
                    <span className="st-secondary">{statusLabel}</span>
                    <button
                      onClick={handleCancelDownload}
                      className="settings-link-button st-muted"
                    >
                      {t('取消下载')}
                    </button>
                  </div>
                  <div className="st-progress-track">
                    <div
                      className="st-progress-bar"
                      style={{ width: `${dlState ? dlState.progress : 0}%` }}
                    />
                  </div>
                  <div className="st-mt-6 st-muted">{dlState?.message}</div>
                </>
              ) : dlState?.status === 'error' ? (
                <>
                  <div className="st-error-text">
                    <AlertCircle size={12} className="st-icon-inline" />
                    {dlState.message}
                  </div>
                  <div className="st-actions">
                    <button onClick={handleInstall} className="settings-browse-button">
                      <RotateCcw size={12} />
                      {t('重试')}
                    </button>
                    <button onClick={handleOpenReleases} className="settings-link-button">
                      <ExternalLink size={11} />
                      {t('打开 GitHub 下载页')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    onClick={handleInstall}
                    className="settings-primary-button st-btn-inline"
                  >
                    <Download size={14} />
                    {t('一键安装 Faster-Whisper-XXL')}
                  </button>
                  <div className="st-mt-6 st-muted">
                    {t('自动下载安装并完成配置（约 1.4 GB），可后台进行，不影响其他功能')}
                  </div>
                </>
              )}
            </div>
          )}

          {dlState?.status === 'installed' && dlState.exePath && form.whisper_exe_path === dlState.exePath && (
            <span className="settings-test-result--success st-inline-flex st-mt-8">
              <CheckCircle2 size={12} />
              {t('已安装并自动配置')}
            </span>
          )}

          <div className="st-mt-4 st-muted">
            {t('Whisper 引擎是本地语音转文字的必需组件，可从 GitHub 下载')}
            <span onClick={handleOpenReleases} className="st-link st-ml-4">
              <span className="st-icon-text">
                <ExternalLink size={11} />
                {t('GitHub 下载')}
              </span>
            </span>
            <button
              onClick={() => setGuideKey('whisper')}
              className="settings-link-button st-ml-8"
            >
              <BookOpen size={11} />
              {t('安装说明')}
            </button>
          </div>
        </div>

        <div className="settings-field">
          <div className="settings-field-label">{t('下载模型')}</div>
          <div className="st-desc">
            {t('Faster-Whisper-XXL 首次运行时会自动下载所选模型到本地缓存目录。')}
            <br />
            <span onClick={handleOpenReleases} className="st-link">
              <span className="st-icon-text">
                <ExternalLink size={12} />
                {t('GitHub 下载 faster-whisper-xxl 模型')}
              </span>
            </span>
          </div>
        </div>
      </div>

      {hardwareWarn && hardwareWarn.warning && (
        <div className={`st-hw-box ${hardwareWarn.pass ? 'st-hw-box--warn' : 'st-hw-box--fail'}`}>
          {hardwareWarn.pass ? (
            <AlertTriangle size={13} className="st-icon-inline" />
          ) : (
            <AlertCircle size={13} className="st-icon-inline" />
          )}
          {t(hardwareWarn.warning)}
        </div>
      )}

      {guideKey && <GuideCarousel guideKey={guideKey} onClose={() => setGuideKey(null)} />}
    </div>
  )
}
