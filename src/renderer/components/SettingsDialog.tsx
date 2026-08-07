import { useState, useEffect, useRef } from 'react'
import { PodcastConfig, AIProviderId, AIProviderConfig } from '@shared/types'
import {
  Link,
  FileText,
  Mic,
  Wrench,
  Settings,
  Layers,
  Download,
  type LucideIcon,
} from 'lucide-react'
import ConfirmDialog from './ConfirmDialog'
import { TabApi, TabTranscribe, TabWhisper, TabTools, TabPlatforms, TabExport } from './settings'
import { useI18n, type TranslationKey } from '../i18n'

type TabKey = 'api' | 'transcribe' | 'whisper' | 'platforms' | 'tools' | 'export'

const TABS: { key: TabKey; icon: LucideIcon; label: TranslationKey }[] = [
  { key: 'api', icon: Link, label: '接口与通知' },
  { key: 'transcribe', icon: FileText, label: '转写偏好' },
  { key: 'whisper', icon: Mic, label: '语音模型' },
  { key: 'platforms', icon: Layers, label: '支持平台' },
  { key: 'export', icon: Download, label: '导出' },
  { key: 'tools', icon: Wrench, label: '工具维护' },
]

interface Props {
  config: PodcastConfig
  onSave: (config: PodcastConfig) => void
  onClose: () => void
}

export default function SettingsDialog({ config, onSave, onClose }: Props) {
  const { t } = useI18n()
  // 确保 ai_providers 存在，如果不存在则初始化
  const initialConfig = {
    ...config,
    ai_provider: config.ai_provider || 'deepseek',
    ai_providers: config.ai_providers || ({} as Record<AIProviderId, AIProviderConfig>),
    export: config.export || {
      logseq_dir: '',
      notion: { token: '', database_id: '' },
    },
  }

  const [form, setForm] = useState<PodcastConfig>(initialConfig)
  const [activeTab, setActiveTab] = useState<TabKey>('api')
  const [models, setModels] = useState<Array<{
    id: string
    label: string
    size: string
    downloaded: boolean
    ramMinGB: number
  }> | null>(null)
  const [scanningModels, setScanningModels] = useState(false)
  const [modelScanStatus, setModelScanStatus] = useState<string | null>(null)
  const [hardwareWarn, setHardwareWarn] = useState<{
    pass: boolean
    warning: string | null
  } | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [isDirty, setIsDirty] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [cleaningTemp, setCleaningTemp] = useState(false)
  const [tempCleanResult, setTempCleanResult] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const initialFormRef = useRef<PodcastConfig>(initialConfig)

  // 检测脏状态
  useEffect(() => {
    const hasChanges = Object.keys(form).some(key => {
      const formValue = form[key as keyof PodcastConfig]
      const initialValue = initialFormRef.current[key as keyof PodcastConfig]

      // 对于对象类型（如 ai_providers），需要深度比较
      if (
        typeof formValue === 'object' &&
        formValue !== null &&
        typeof initialValue === 'object' &&
        initialValue !== null
      ) {
        return JSON.stringify(formValue) !== JSON.stringify(initialValue)
      }

      return formValue !== initialValue
    })
    setIsDirty(hasChanges)
  }, [form])

  async function handleScanModels() {
    setScanningModels(true)
    setModelScanStatus('扫描中…')
    try {
      const result = await window.electronAPI.scanWhisperModels()
      setModels(result)
      const downloadedCount = result.filter(m => m.downloaded).length
      setModelScanStatus(t('找到') + ' ' + result.length + ' ' + t('个标准模型，本地已下载') + ' ' + downloadedCount + ' ' + t('个'))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setModelScanStatus(t('扫描失败') + ': ' + msg)
    } finally {
      setScanningModels(false)
    }
  }

  async function handleModelChange(modelId: string) {
    update('whisper_model', modelId)
    try {
      const result = await window.electronAPI.checkWhisperHardware(modelId)
      setHardwareWarn(result)
    } catch (e) {
      console.error('硬件检测失败:', e)
      setHardwareWarn(null)
    }
  }

  function update(key: keyof PodcastConfig, value: PodcastConfig[keyof PodcastConfig]) {
    setForm((prev: PodcastConfig) => ({ ...prev, [key]: value }))
    if (validationErrors[key]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[key]
        return newErrors
      })
    }
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

  function validateForm(): boolean {
    const errors: Record<string, string> = {}

    // 验证当前活跃供应商的 API Key
    const currentProvider = form.ai_providers?.[form.ai_provider]
    if (!currentProvider?.apiKey?.trim()) {
      errors[`ai_providers.${form.ai_provider}.apiKey`] = 'API Key 不能为空'
    }

    // 保留旧字段兼容验证
    if (!form.api_key.trim() && form.ai_provider === 'deepseek') {
      // 如果是 deepseek 且旧字段为空，使用新字段的值
      // 这里不做额外验证，因为已经验证了新字段
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  function handleSave() {
    if (!validateForm()) {
      setActiveTab('api')
      return
    }

    // 同步旧字段 api_key 以保持兼容性
    const currentProvider = form.ai_providers?.[form.ai_provider]
    const apiKey = currentProvider?.apiKey?.trim() || form.api_key.trim()

    onSave({
      ...form,
      api_key: apiKey, // 同步到旧字段
      ai_providers: form.ai_providers,
      feishu_app_id: form.feishu_app_id.trim(),
      feishu_app_secret: form.feishu_app_secret.trim(),
      feishu_chat_id: form.feishu_chat_id.trim(),
      notification_enabled: form.notification_enabled,
    })
    setSaveSuccess(true)
    setIsDirty(false)
    initialFormRef.current = { ...form }
    // 保存成功提示保留 3 秒，不自动关闭设置界面
    setTimeout(() => {
      setSaveSuccess(false)
    }, 3000)
  }

  function handleClose() {
    if (isDirty) {
      setShowCloseConfirm(true)
      return
    }
    onClose()
  }

  function handleConfirmClose() {
    setShowCloseConfirm(false)
    onClose()
  }

  function handleCancelClose() {
    setShowCloseConfirm(false)
  }

  async function handleCleanTemp() {
    setCleaningTemp(true)
    setTempCleanResult(null)
    try {
      const success = await window.electronAPI.cleanTemp()
      setTempCleanResult(success ? t('临时文件已清理') : t('清理失败'))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setTempCleanResult(t('清理失败') + ': ' + msg)
    } finally {
      setCleaningTemp(false)
    }
  }

  return (
    <div
      onClick={handleClose}
      className="settings-dialog-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--overlay-bg)',
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
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t('设置')}
        style={{
          width: 720,
          maxWidth: 'calc(100vw - 32px)',
          height: 520,
          maxHeight: '85vh',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          animation: 'modalSlide 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'hidden',
        }}
      >
        {/* 左侧导航 */}
        <div
          style={{
            width: 180,
            minWidth: 140,
            flexShrink: 0,
            background: 'var(--bg-card)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            padding: '16px 0',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              padding: '0 16px 16px',
              borderBottom: '1px solid var(--border)',
              marginBottom: 8,
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Settings size={16} />
              {t('设置')}
            </div>
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px' }}>
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: activeTab === tab.key ? 'var(--accent)' : 'transparent',
                  color: activeTab === tab.key ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: activeTab === tab.key ? 600 : 400,
                  transition: 'all 0.15s',
                  textAlign: 'left',
                }}
              >
                <tab.icon size={16} />
                {t(tab.label)}
              </button>
            ))}
          </nav>
        </div>

        {/* 右侧内容 */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* 内容区域 */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '20px 24px',
            }}
          >
            {activeTab === 'api' && (
              <TabApi form={form} update={update} validationErrors={validationErrors} />
            )}
            {activeTab === 'transcribe' && (
              <TabTranscribe form={form} update={update} onBrowse={handleBrowse} />
            )}
            {activeTab === 'whisper' && (
              <TabWhisper
                form={form}
                update={update}
                models={models}
                scanningModels={scanningModels}
                modelScanStatus={modelScanStatus}
                hardwareWarn={hardwareWarn}
                showAdvanced={showAdvanced}
                setShowAdvanced={setShowAdvanced}
                onScanModels={handleScanModels}
                onModelChange={handleModelChange}
                onBrowse={handleBrowse}
              />
            )}
            {activeTab === 'platforms' && <TabPlatforms />}
            {activeTab === 'export' && <TabExport form={form} update={update} />}
            {activeTab === 'tools' && (
              <TabTools
                cleaningTemp={cleaningTemp}
                tempCleanResult={tempCleanResult}
                onCleanTemp={handleCleanTemp}
              />
            )}
          </div>

          {/* 底部操作栏 */}
          <div
            style={{
              padding: '12px 24px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--bg-card)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {isDirty && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>• {t('未保存的更改')}</span>
              )}
              {saveSuccess && (
                <span style={{ fontSize: 11, color: 'var(--success)' }}>✓ {t('保存成功')}</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleClose} className="tailbar-button">
                {t('取消')}
              </button>
              <button
                onClick={handleSave}
                className="settings-save-button"
                disabled={!isDirty}
                style={{ opacity: isDirty ? 1 : 0.6 }}
              >
                {t('保存')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes modalSlide { from { opacity:0; transform: translateY(20px) scale(0.96); } to { opacity:1; transform: translateY(0) scale(1); } }
        .settings-checkbox {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--text-secondary);
          cursor: pointer;
        }
        .settings-checkbox input {
          width: 16px;
          height: 16px;
        }
        .settings-link-button {
          background: none;
          border: none;
          color: var(--accent);
          cursor: pointer;
          font-size: 12px;
          padding: 0;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .settings-link-button:hover {
          text-decoration: underline;
        }
      `}</style>

      {/* 关闭确认对话框 */}
      {showCloseConfirm && (
        <ConfirmDialog
          title={t('未保存的更改')}
          message={t('您有未保存的更改，确定要关闭设置吗？')}
          confirmText={t('不保存')}
          cancelText={t('继续编辑')}
          danger={true}
          onConfirm={handleConfirmClose}
          onCancel={handleCancelClose}
        />
      )}
    </div>
  )
}
