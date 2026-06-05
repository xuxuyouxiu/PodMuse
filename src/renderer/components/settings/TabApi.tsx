import { useState } from 'react'
import { PodcastConfig, AIProviderId, AIProviderConfig } from '@shared/types'
import { AI_PROVIDER_PRESETS } from '@shared/ai-provider-presets'
import { TabHeader, Field } from './FieldComponents'

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

export default function TabApi({ form, update, validationErrors }: {
  form: PodcastConfig
  update: (key: keyof PodcastConfig, value: PodcastConfig[keyof PodcastConfig]) => void
  validationErrors: Record<string, string>
}) {
  const [activeProvider, setActiveProvider] = useState<AIProviderId>(form.ai_provider || 'deepseek')
  const [providers, setProviders] = useState<Record<AIProviderId, AIProviderConfig>>(form.ai_providers || ({} as Record<AIProviderId, AIProviderConfig>))
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
  function updateProviderConfig(key: keyof AIProviderConfig, value: AIProviderConfig[keyof AIProviderConfig]) {
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setFetchModelsStatus(`加载失败: ${msg}`)
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
                      style={{ outline: 'none', cursor: 'pointer', colorScheme: 'dark' }}
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
                      style={{ outline: 'none', cursor: 'pointer', colorScheme: 'dark' }}
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
