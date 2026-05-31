import { useState, useEffect, useRef } from 'react'
import { PodcastConfig, AIProviderId, AIProviderConfig, AIProviderPreset } from '@shared/types'

// 预设供应商列表（与主进程同步）
const AI_PROVIDER_PRESETS: AIProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-v4-flash',
    availableModels: [
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', maxTokens: 8192 },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', maxTokens: 8192 },
      { id: 'deepseek-chat', name: 'DeepSeek Chat (旧版，即将弃用)', maxTokens: 8192 },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (旧版，即将弃用)', maxTokens: 8192 },
    ],
    website: 'https://platform.deepseek.com',
    description: '国产高性价比大模型，V4系列性能更强',
    apiKeyPlaceholder: 'sk-...',
    apiKeyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    availableModels: [
      { id: 'gpt-4o', name: 'GPT-4o', maxTokens: 4096 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', maxTokens: 4096 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', maxTokens: 4096 },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', maxTokens: 4096 },
    ],
    website: 'https://platform.openai.com',
    description: '业界领先的AI模型，英文能力优秀',
    apiKeyPlaceholder: 'sk-...',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    availableModels: [
      { id: 'moonshot-v1-8k', name: 'Moonshot V1 8K', maxTokens: 4096 },
      { id: 'moonshot-v1-32k', name: 'Moonshot V1 32K', maxTokens: 4096 },
      { id: 'moonshot-v1-128k', name: 'Moonshot V1 128K', maxTokens: 4096 },
    ],
    website: 'https://platform.moonshot.cn',
    description: '支持超长上下文，适合长播客转录',
    apiKeyPlaceholder: 'sk-...',
    apiKeyUrl: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    id: 'zhipu',
    name: '智谱AI (GLM)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    availableModels: [
      { id: 'glm-4', name: 'GLM-4', maxTokens: 4096 },
      { id: 'glm-4-flash', name: 'GLM-4 Flash (免费)', maxTokens: 4096 },
      { id: 'glm-4-long', name: 'GLM-4 Long', maxTokens: 4096 },
      { id: 'glm-4-air', name: 'GLM-4 Air', maxTokens: 4096 },
    ],
    website: 'https://open.bigmodel.cn',
    description: '清华系大模型，GLM-4 Flash 免费使用',
    apiKeyPlaceholder: 'xxx.yyy',
    apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    id: 'qwen',
    name: '通义千问 (Qwen)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-turbo',
    availableModels: [
      { id: 'qwen-turbo', name: 'Qwen Turbo', maxTokens: 4096 },
      { id: 'qwen-plus', name: 'Qwen Plus', maxTokens: 4096 },
      { id: 'qwen-max', name: 'Qwen Max', maxTokens: 4096 },
      { id: 'qwen-long', name: 'Qwen Long', maxTokens: 4096 },
    ],
    website: 'https://dashscope.aliyun.com',
    description: '阿里云大模型，与OpenAI兼容接口',
    apiKeyPlaceholder: 'sk-...',
    apiKeyUrl: 'https://dashscope.console.aliyun.com/apiKey',
  },
  {
    id: 'yi',
    name: '零一万物 (Yi)',
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    defaultModel: 'yi-lightning',
    availableModels: [
      { id: 'yi-lightning', name: 'Yi Lightning', maxTokens: 4096 },
      { id: 'yi-medium', name: 'Yi Medium', maxTokens: 4096 },
      { id: 'yi-large', name: 'Yi Large', maxTokens: 4096 },
    ],
    website: 'https://platform.lingyiwanwu.com',
    description: '李开复创办的AI公司，性价比高',
    apiKeyPlaceholder: '...',
    apiKeyUrl: 'https://platform.lingyiwanwu.com/apikeys',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    defaultModel: 'abab6.5s-chat',
    availableModels: [
      { id: 'abab6.5s-chat', name: 'ABAB 6.5s', maxTokens: 4096 },
      { id: 'abab6.5-chat', name: 'ABAB 6.5', maxTokens: 4096 },
      { id: 'abab5.5-chat', name: 'ABAB 5.5', maxTokens: 4096 },
    ],
    website: 'https://platform.minimaxi.com',
    description: '海螺AI背后的大模型，中文对话能力强',
    apiKeyPlaceholder: 'eyJ...',
    apiKeyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
  },
]

type TabKey = 'api' | 'transcribe' | 'whisper' | 'tools'

const TABS: { key: TabKey; icon: string; label: string }[] = [
  { key: 'api', icon: '🔗', label: '接口与通知' },
  { key: 'transcribe', icon: '📝', label: '转写偏好' },
  { key: 'whisper', icon: '🎙', label: '语音模型' },
  { key: 'tools', icon: '🛠', label: '工具维护' },
]

interface Props {
  config: PodcastConfig
  onSave: (config: PodcastConfig) => void
  onClose: () => void
}

export default function SettingsDialog({ config, onSave, onClose }: Props) {
  // 确保 ai_providers 存在，如果不存在则初始化
  const initialConfig = {
    ...config,
    ai_provider: config.ai_provider || 'deepseek',
    ai_providers: config.ai_providers || {} as any,
  }
  
  const [form, setForm] = useState<PodcastConfig>(initialConfig)
  const [activeTab, setActiveTab] = useState<TabKey>('api')
  const [models, setModels] = useState<Array<{ id: string; label: string; size: string; downloaded: boolean; ramMinGB: number }> | null>(null)
  const [scanningModels, setScanningModels] = useState(false)
  const [modelScanStatus, setModelScanStatus] = useState<string | null>(null)
  const [hardwareWarn, setHardwareWarn] = useState<{ pass: boolean; warning: string | null } | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [isDirty, setIsDirty] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [cleaningTemp, setCleaningTemp] = useState(false)
  const [tempCleanResult, setTempCleanResult] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const initialFormRef = useRef<PodcastConfig>(initialConfig)

  // 检测脏状态
  useEffect(() => {
    const hasChanges = Object.keys(form).some(key => {
      const formValue = form[key as keyof PodcastConfig]
      const initialValue = initialFormRef.current[key as keyof PodcastConfig]
      
      // 对于对象类型（如 ai_providers），需要深度比较
      if (typeof formValue === 'object' && formValue !== null && typeof initialValue === 'object' && initialValue !== null) {
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

  function update(key: keyof PodcastConfig, value: string | boolean) {
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
    setTimeout(() => {
      setSaveSuccess(false)
      onClose()
    }, 1000)
  }

  function handleClose() {
    if (isDirty) {
      const confirmed = window.confirm('您有未保存的更改，确定要关闭吗？')
      if (!confirmed) return
    }
    onClose()
  }

  async function handleCleanTemp() {
    setCleaningTemp(true)
    setTempCleanResult(null)
    try {
      const success = await window.electronAPI.cleanTemp()
      setTempCleanResult(success ? '临时文件已清理' : '清理失败')
    } catch (e: any) {
      setTempCleanResult(`清理失败: ${e.message}`)
    } finally {
      setCleaningTemp(false)
    }
  }

  return (
    <div
      onClick={handleClose}
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
        <div style={{
          width: 180,
          minWidth: 180,
          background: 'var(--bg-card)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          padding: '16px 0',
        }}>
          <div style={{
            padding: '0 16px 16px',
            borderBottom: '1px solid var(--border)',
            marginBottom: 8,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>⚙ 设置</div>
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px' }}>
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
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
                <span style={{ fontSize: 15 }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* 右侧内容 */}
        <div style={{
          flex: 1,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* 内容区域 */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
          }}>
            {activeTab === 'api' && (
              <TabApi
                form={form}
                update={update}
                validationErrors={validationErrors}
              />
            )}
            {activeTab === 'transcribe' && (
              <TabTranscribe
                form={form}
                update={update}
                onBrowse={handleBrowse}
              />
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
            {activeTab === 'tools' && (
              <TabTools
                cleaningTemp={cleaningTemp}
                tempCleanResult={tempCleanResult}
                onCleanTemp={handleCleanTemp}
              />
            )}
          </div>

          {/* 底部操作栏 */}
          <div style={{
            padding: '12px 24px',
            borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'var(--bg-card)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {isDirty && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>• 未保存的更改</span>
              )}
              {saveSuccess && (
                <span style={{ fontSize: 11, color: '#4caf50' }}>✓ 保存成功</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleClose} className="tailbar-button">取消</button>
              <button
                onClick={handleSave}
                className="settings-save-button"
                disabled={!isDirty}
                style={{ opacity: isDirty ? 1 : 0.6 }}
              >
                保存
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
        .settings-link-button:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  )
}

/* ===== 标签页：接口与通知 ===== */
function TabApi({ form, update, validationErrors }: {
  form: PodcastConfig
  update: (key: keyof PodcastConfig, value: string | boolean) => void
  validationErrors: Record<string, string>
}) {
  const [activeProvider, setActiveProvider] = useState<AIProviderId>(form.ai_provider || 'deepseek')
  const [providers, setProviders] = useState<Record<AIProviderId, AIProviderConfig>>(form.ai_providers || {} as any)
  const [showProviderDetail, setShowProviderDetail] = useState(false)
  const [fetchedModels, setFetchedModels] = useState<Array<{ id: string; name: string }>>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [fetchModelsStatus, setFetchModelsStatus] = useState<string | null>(null)

  // 获取当前供应商配置
  const currentProvider = providers[activeProvider] || {} as AIProviderConfig
  const currentPreset = AI_PROVIDER_PRESETS.find(p => p.id === activeProvider)

  // 切换供应商
  function handleProviderChange(providerId: AIProviderId) {
    setActiveProvider(providerId)
    update('ai_provider', providerId)
    setShowProviderDetail(true)
    setFetchedModels([])
    setFetchModelsStatus(null)
  }

  // 更新供应商配置
  function updateProviderConfig(key: keyof AIProviderConfig, value: any) {
    const newProviders = { ...providers }
    newProviders[activeProvider] = { ...newProviders[activeProvider], [key]: value }
    setProviders(newProviders)
    update('ai_providers', newProviders)
  }

  // 选择模型
  function handleModelSelect(modelId: string) {
    updateProviderConfig('model', modelId)
  }

  // 重置为默认配置
  function handleResetToDefault() {
    if (!currentPreset) return
    updateProviderConfig('baseUrl', currentPreset.baseUrl)
    updateProviderConfig('model', currentPreset.defaultModel)
    setFetchedModels([])
    setFetchModelsStatus(null)
  }

  // 从API加载模型列表
  async function handleFetchModels() {
    const apiKey = currentProvider.apiKey
    const baseUrl = currentProvider.baseUrl || currentPreset?.baseUrl

    if (!apiKey) {
      setFetchModelsStatus('请先填写 API Key')
      return
    }

    setFetchingModels(true)
    setFetchModelsStatus('加载中...')
    setFetchedModels([])

    try {
      const result = await window.electronAPI.fetchAIModels(baseUrl || '', apiKey)
      if (result.success && result.models.length > 0) {
        setFetchedModels(result.models)
        setFetchModelsStatus(`已加载 ${result.models.length} 个模型`)
        // 如果当前没有选择模型，自动选择第一个
        if (!currentProvider.model && result.models.length > 0) {
          updateProviderConfig('model', result.models[0].id)
        }
      } else {
        setFetchModelsStatus(result.error || '未找到可用模型')
      }
    } catch (err: any) {
      setFetchModelsStatus(`加载失败: ${err.message}`)
    } finally {
      setFetchingModels(false)
    }
  }

  return (
    <div>
      <TabHeader title="AI 供应商配置" subtitle="选择和配置 AI API 供应商" />
      
      {/* 供应商选择网格 */}
      <div style={{ marginBottom: 20 }}>
        <div className="settings-field-label" style={{ marginBottom: 8 }}>选择供应商</div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 8,
        }}>
          {AI_PROVIDER_PRESETS.map(preset => {
            const isActive = activeProvider === preset.id
            const hasKey = providers[preset.id]?.apiKey
            return (
              <button
                key={preset.id}
                onClick={() => handleProviderChange(preset.id)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                  background: isActive ? 'var(--accent-bg)' : 'var(--bg-card)',
                  color: isActive ? 'var(--accent)' : 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: isActive ? 600 : 400,
                  transition: 'all 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 4,
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
                  <span style={{ fontSize: 14 }}>{getProviderIcon(preset.id)}</span>
                  <span>{preset.name}</span>
                </div>
                {hasKey && (
                  <div style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#4caf50',
                  }} />
                )}
              </button>
            )
          })}
          
          {/* 自定义供应商 */}
          <button
            onClick={() => handleProviderChange('custom')}
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              border: `1px dashed ${activeProvider === 'custom' ? 'var(--accent)' : 'var(--border)'}`,
              background: activeProvider === 'custom' ? 'var(--accent-bg)' : 'transparent',
              color: activeProvider === 'custom' ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: activeProvider === 'custom' ? 600 : 400,
              transition: 'all 0.15s',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span style={{ fontSize: 14 }}>➕</span>
            <span>自定义</span>
          </button>
        </div>
      </div>

      {/* 供应商详情配置 */}
      {showProviderDetail && activeProvider && (
        <div style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          padding: 16,
          marginBottom: 20,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {currentPreset?.name || '自定义供应商'}
              </div>
              {currentPreset?.description && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {currentPreset.description}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {currentPreset?.website && (
                <a
                  href={currentPreset.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="settings-link-button"
                  style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}
                >
                  🔗 官网
                </a>
              )}
              {currentPreset?.apiKeyUrl && (
                <a
                  href={currentPreset.apiKeyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="settings-link-button"
                  style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}
                >
                  🔑 获取密钥
                </a>
              )}
              {currentPreset && (
                <button
                  onClick={handleResetToDefault}
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  ↺ 重置默认
                </button>
              )}
            </div>
          </div>

          <div className="settings-grid">
            {/* API Key */}
            <Field
              label="API Key"
              value={currentProvider.apiKey || ''}
              onChange={v => updateProviderConfig('apiKey', v)}
              secret
              error={validationErrors[`ai_providers.${activeProvider}.apiKey`]}
              required
              placeholder={currentPreset?.apiKeyPlaceholder || '输入 API Key'}
            />

            {/* Base URL */}
            <Field
              label="API 地址"
              value={currentProvider.baseUrl || ''}
              onChange={v => updateProviderConfig('baseUrl', v)}
              placeholder={currentPreset?.baseUrl || 'https://api.example.com/v1'}
            />

            {/* 模型选择 */}
            <div className="settings-field">
              <div className="settings-field-label">模型</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  {fetchedModels.length > 0 ? (
                    <select
                      value={currentProvider.model || ''}
                      onChange={e => handleModelSelect(e.target.value)}
                      className="settings-input"
                      style={{ outline: 'none', cursor: 'pointer' }}
                    >
                      <option value="">选择模型...</option>
                      {fetchedModels.map(model => (
                        <option key={model.id} value={model.id}>
                          {model.id}
                        </option>
                      ))}
                    </select>
                  ) : currentPreset?.availableModels && currentPreset.availableModels.length > 0 ? (
                    <select
                      value={currentProvider.model || ''}
                      onChange={e => handleModelSelect(e.target.value)}
                      className="settings-input"
                      style={{ outline: 'none', cursor: 'pointer' }}
                    >
                      <option value="">选择模型...</option>
                      {currentPreset.availableModels.map(model => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={currentProvider.model || ''}
                      onChange={e => updateProviderConfig('model', e.target.value)}
                      className="settings-input"
                      placeholder="输入模型名称，如 gpt-4o"
                      style={{ outline: 'none' }}
                    />
                  )}
                </div>
                <button
                  onClick={handleFetchModels}
                  disabled={fetchingModels || !currentProvider.apiKey}
                  className="settings-browse-button"
                  style={{ 
                    whiteSpace: 'nowrap',
                    opacity: (!currentProvider.apiKey) ? 0.5 : 1,
                  }}
                  title={!currentProvider.apiKey ? '请先填写 API Key' : '从 API 加载模型列表'}
                >
                  {fetchingModels ? '加载中...' : '加载模型'}
                </button>
              </div>
              {fetchModelsStatus && (
                <div style={{ 
                  marginTop: 6, 
                  fontSize: 11, 
                  color: fetchModelsStatus.includes('已加载') ? '#4caf50' : 
                         fetchModelsStatus.includes('失败') || fetchModelsStatus.includes('请先') ? 'var(--error)' : 
                         'var(--text-muted)' 
                }}>
                  {fetchModelsStatus}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                填写 API Key 后点击"加载模型"可获取该供应商的可用模型列表
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 飞书配置 */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
          飞书集成
        </div>
        <div className="settings-grid">
          <Field label="飞书 App ID" value={form.feishu_app_id} onChange={v => update('feishu_app_id', v)} />
          <Field label="飞书 App Secret" value={form.feishu_app_secret} onChange={v => update('feishu_app_secret', v)} secret />
          <Field label="飞书群聊 Chat ID" value={form.feishu_chat_id} onChange={v => update('feishu_chat_id', v)} />
        </div>
      </div>

      {/* 通知设置 */}
      <div className="settings-field" style={{ marginTop: 16 }}>
        <div className="settings-field-label">通知设置</div>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={form.notification_enabled}
            onChange={e => update('notification_enabled', e.target.checked)}
            style={{ accentColor: 'var(--accent)' }}
          />
          <span>启用系统通知（任务完成、错误等）</span>
        </label>
      </div>
    </div>
  )
}

// 获取供应商图标
function getProviderIcon(providerId: AIProviderId): string {
  const icons: Record<AIProviderId, string> = {
    deepseek: '🐋',
    openai: '🤖',
    moonshot: '🌙',
    zhipu: '🧠',
    qwen: '☁️',
    yi: '💡',
    minimax: '🐚',
    custom: '⚙️',
  }
  return icons[providerId] || '🔗'
}

/* ===== 标签页：转写偏好 ===== */
function TabTranscribe({ form, update, onBrowse }: {
  form: PodcastConfig
  update: (key: keyof PodcastConfig, value: string | boolean) => void
  onBrowse: (key: 'obsidian_dir' | 'audio_dir' | 'whisper_exe_path') => void
}) {
  return (
    <div>
      <TabHeader title="转写偏好" subtitle="设置语音识别语言和文件存储位置" />
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
        <DirField label="Obsidian 笔记目录" value={form.obsidian_dir} onBrowse={() => onBrowse('obsidian_dir')} />
        <DirField label="音频缓存目录" value={form.audio_dir} placeholder="默认（用户数据目录）" onBrowse={() => onBrowse('audio_dir')} />
      </div>
    </div>
  )
}

/* ===== 标签页：语音模型 ===== */
function TabWhisper({ form, update, models, scanningModels, modelScanStatus, hardwareWarn, showAdvanced, setShowAdvanced, onScanModels, onModelChange, onBrowse }: {
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
              style={{ flex: 1, outline: 'none', cursor: 'pointer' }}
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

/* ===== 标签页：工具维护 ===== */
function TabTools({ cleaningTemp, tempCleanResult, onCleanTemp }: {
  cleaningTemp: boolean
  tempCleanResult: string | null
  onCleanTemp: () => void
}) {
  return (
    <div>
      <TabHeader title="工具与维护" subtitle="清理临时文件释放磁盘空间" />
      <div className="settings-grid">
        <div className="settings-field">
          <div className="settings-field-label">清理临时文件</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={onCleanTemp}
              disabled={cleaningTemp}
              className="settings-browse-button"
              style={{ whiteSpace: 'nowrap' }}
            >
              {cleaningTemp ? '清理中…' : '立即清理'}
            </button>
            {tempCleanResult && (
              <span style={{
                fontSize: 12,
                color: tempCleanResult.includes('已清理') ? '#4caf50' : 'var(--error)'
              }}>
                {tempCleanResult}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            清理下载的音频缓存和临时文件，释放磁盘空间
          </div>
        </div>
      </div>
    </div>
  )
}

/* ===== 通用组件 ===== */
function TabHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</div>
    </div>
  )
}

function DirField({ label, value, placeholder, onBrowse }: {
  label: string; value: string; placeholder?: string; onBrowse: () => void
}) {
  return (
    <div className="settings-field">
      <div className="settings-field-label">{label}</div>
      <div className="settings-dir-row">
        <div className={`settings-dir-display ${value ? 'has-value' : ''}`}>
          {value || placeholder || '未设置'}
        </div>
        <button onClick={onBrowse} className="settings-browse-button">浏览</button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, secret, error, required }: {
  label: string; value: string; onChange: (v: string) => void; secret?: boolean; error?: string; required?: boolean
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
        style={{ outline: 'none', fontFamily: 'Consolas, monospace', borderColor: error ? 'var(--error)' : undefined }}
      />
      {error && (
        <div style={{ fontSize: 11, color: 'var(--error)', marginTop: 4 }}>{error}</div>
      )}
    </div>
  )
}