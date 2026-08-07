import { useState } from 'react'
import { PodcastConfig, AIProviderId, AIProviderConfig } from '@shared/types'
import { AI_PROVIDER_PRESETS } from '@shared/ai-provider-presets'
import { TabHeader, Field } from './FieldComponents'
import { useI18n } from '../../i18n'

// 飞书测试连接结果 → 多语言显示
function formatFeishuResult(
  result: { success: boolean; code?: string; message?: string; chatName?: string; detail?: string },
  t: (key: string) => string,
): string {
  switch (result.code) {
    case 'auth_failed':
      return t('飞书鉴权失败，请检查 App ID 和 App Secret')
    case 'chat_ok':
      return t('凭据有效，群聊') + '「' + (result.chatName || '') + '」' + t('可访问')
    case 'chat_invalid':
      return t('凭据有效，但 Chat ID 无效或应用未加入该群聊（需在飞书开放平台给应用添加 im:chat 权限）')
    case 'no_chat_skipped':
      return t('飞书凭据验证成功（未填写 Chat ID，跳过群聊验证）')
    case 'test_error':
      return t('测试失败') + ': ' + (result.detail || '')
    default:
      return result.message || ''
  }
}

import {
  Fish,
  Bot,
  Moon,
  Cpu,
  Cloud,
  Lightbulb,
  Waves,
  Settings,
  Plus,
  ExternalLink,
  Key,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react'

// 获取供应商图标
function getProviderIcon(providerId: AIProviderId): React.ReactNode {
  const icons: Record<AIProviderId, LucideIcon> = {
    deepseek: Fish,
    openai: Bot,
    moonshot: Moon,
    zhipu: Cpu,
    qwen: Cloud,
    yi: Lightbulb,
    minimax: Waves,
    custom: Settings,
  }
  const Icon = icons[providerId] || ExternalLink
  return <Icon size={14} />
}

export default function TabApi({
  form,
  update,
  validationErrors,
}: {
  form: PodcastConfig
  update: (key: keyof PodcastConfig, value: PodcastConfig[keyof PodcastConfig]) => void
  validationErrors: Record<string, string>
}) {
  const { t } = useI18n()
  const [activeProvider, setActiveProvider] = useState<AIProviderId>(form.ai_provider || 'deepseek')
  const [providers, setProviders] = useState<Record<AIProviderId, AIProviderConfig>>(
    form.ai_providers || ({} as Record<AIProviderId, AIProviderConfig>),
  )
  const [showProviderDetail, setShowProviderDetail] = useState(false)
  const [fetchedModels, setFetchedModels] = useState<Array<{ id: string; name: string }>>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [fetchModelsStatus, setFetchModelsStatus] = useState<string | null>(null)
  const [feishuTesting, setFeishuTesting] = useState(false)
  const [douyinSetupChecking, setDouyinSetupChecking] = useState(false)
  const [douyinSetupResult, setDouyinSetupResult] = useState<{ success: boolean; message: string } | null>(null)
  const [douyinLoginLoading, setDouyinLoginLoading] = useState(false)
  const [feishuTestResult, setFeishuTestResult] = useState<{
    success: boolean
    code?: string
    message?: string
    chatName?: string
    detail?: string
  } | null>(null)

  // 获取当前供应商配置
  const currentProvider = providers[activeProvider] || ({} as AIProviderConfig)
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
  function updateProviderConfig(
    key: keyof AIProviderConfig,
    value: AIProviderConfig[keyof AIProviderConfig],
  ) {
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
        setFetchModelsStatus(t('已加载') + ' ' + result.models.length + ' ' + t('个模型'))
        // 如果当前没有选择模型，自动选择第一个
        if (!currentProvider.model && result.models.length > 0) {
          updateProviderConfig('model', result.models[0].id)
        }
      } else {
        setFetchModelsStatus(result.error || '未找到可用模型')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setFetchModelsStatus(t('加载失败') + ': ' + msg)
    } finally {
      setFetchingModels(false)
    }
  }

  return (
    <div>
      <TabHeader title={t('AI 供应商配置')} subtitle={t('选择和配置 AI API 供应商')} />

      {/* 供应商选择网格 */}
      <div className="settings-field" style={{ marginBottom: 20 }}>
        <div className="settings-field-label">{t('选择供应商')}</div>
        <div className="settings-provider-grid">
          {AI_PROVIDER_PRESETS.map(preset => {
            const isActive = activeProvider === preset.id
            const hasKey = providers[preset.id]?.apiKey
            return (
              <button
                key={preset.id}
                onClick={() => handleProviderChange(preset.id)}
                className={`settings-provider-button${isActive ? ' is-active' : ''}`}
              >
                <div className="settings-provider-button-row">
                  {getProviderIcon(preset.id)}
                  <span>{t(preset.name)}</span>
                </div>
                {hasKey && <div className="settings-provider-dot" />}
              </button>
            )
          })}

          {/* 自定义供应商 */}
          <button
            onClick={() => handleProviderChange('custom')}
            className={`settings-provider-button settings-provider-button--custom${activeProvider === 'custom' ? ' is-active' : ''}`}
          >
            <div className="settings-provider-button-row">
              <Plus size={14} />
              <span>{t('自定义')}</span>
            </div>
          </button>
        </div>
      </div>

      {/* 供应商详情配置 */}
      {showProviderDetail && activeProvider && (
        <div className="settings-section" style={{ marginBottom: 20 }}>
          <div className="settings-detail-header">
            <div>
              <div className="settings-detail-title">
                {t(currentPreset?.name || '自定义供应商')}
              </div>
              {currentPreset?.description && (
                <div className="settings-detail-description">
                  {t(currentPreset.description)}
                </div>
              )}
            </div>
            <div className="settings-detail-actions">
              {currentPreset?.website && (
                <span
                  onClick={() => window.electronAPI.openExternal(currentPreset.website!)}
                  className="settings-link-button"
                >
                  <ExternalLink size={11} />
                  {t('官网')}
                </span>
              )}
              {currentPreset?.apiKeyUrl && (
                <span
                  onClick={() => window.electronAPI.openExternal(currentPreset.apiKeyUrl!)}
                  className="settings-link-button"
                >
                  <Key size={11} />
                  {t('获取密钥')}
                </span>
              )}
              {currentPreset && (
                <button
                  onClick={handleResetToDefault}
                  className="settings-link-button"
                >
                  <RotateCcw size={11} />
                  {t('重置默认')}
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
              placeholder={t(currentPreset?.apiKeyPlaceholder || '输入 API Key')}
            />

            {/* Base URL */}
            <Field
              label={t('API 地址')}
              value={currentProvider.baseUrl || ''}
              onChange={v => updateProviderConfig('baseUrl', v)}
              placeholder={currentPreset?.baseUrl || 'https://api.example.com/v1'}
            />

            {/* 模型选择 */}
            <div className="settings-field">
              <div className="settings-field-label">{t('模型')}</div>
              <div className="settings-dir-row">
                <div style={{ flex: 1 }}>
                  {fetchedModels.length > 0 ? (
                    <select
                      value={currentProvider.model || ''}
                      onChange={e => handleModelSelect(e.target.value)}
                      className="settings-input"
                    >
                      <option value="">{t('选择模型...')}</option>
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
                    >
                      <option value="">{t('选择模型...')}</option>
                      {currentPreset.availableModels.map(model => (
                        <option key={model.id} value={model.id}>
                          {t(model.name)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={currentProvider.model || ''}
                      onChange={e => updateProviderConfig('model', e.target.value)}
                      className="settings-input"
                      placeholder={t('输入模型名称，如 gpt-4o')}
                    />
                  )}
                </div>
                <button
                  onClick={handleFetchModels}
                  disabled={fetchingModels || !currentProvider.apiKey}
                  className="settings-browse-button"
                  style={{
                    whiteSpace: 'nowrap',
                    opacity: !currentProvider.apiKey ? 0.5 : 1,
                  }}
                  title={!currentProvider.apiKey ? t('请先填写 API Key') : t('从 API 加载模型列表')}
                >
                  {fetchingModels ? t('加载中...') : t('加载模型')}
                </button>
              </div>
              {fetchModelsStatus && (
                <div
                  className={
                    fetchModelsStatus.includes('已加载')
                      ? 'settings-test-result--success'
                      : fetchModelsStatus.includes('失败') || fetchModelsStatus.includes('请先')
                        ? 'settings-test-result--error'
                        : 'settings-test-result--muted'
                  }
                >
                  {t(fetchModelsStatus)}
                </div>
              )}
              <div className="settings-hint">
                {t('填写 API Key 后点击「加载模型」可获取该供应商的可用模型列表')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 飞书配置 */}
      <div style={{ marginTop: 24 }}>
        <div className="settings-section-title" style={{ marginBottom: 12 }}>
          {t('飞书集成')}
        </div>
        <div className="settings-grid">
          <Field
            label={t('飞书 App ID')}
            value={form.feishu_app_id}
            onChange={v => update('feishu_app_id', v)}
            placeholder="cli_xxxxxxxxxx"
          />
          <Field
            label={t('飞书 App Secret')}
            value={form.feishu_app_secret}
            onChange={v => update('feishu_app_secret', v)}
            secret
            placeholder={t('输入飞书应用 App Secret')}
          />
          <Field
            label={t('飞书群聊 Chat ID')}
            value={form.feishu_chat_id}
            onChange={v => update('feishu_chat_id', v)}
            placeholder="oc_xxxxxxxxxxxxxxxxxx"
          />
        </div>
        <div className="settings-test-row">
          <button
            onClick={async () => {
              setFeishuTesting(true)
              setFeishuTestResult(null)
              try {
                const result = await window.electronAPI.testFeishuConnection({
                  appId: form.feishu_app_id,
                  appSecret: form.feishu_app_secret,
                  chatId: form.feishu_chat_id,
                })
                setFeishuTestResult(result)
              } catch (e) {
                setFeishuTestResult({
                  success: false,
                  message: t('测试失败') + ': ' + (e as Error).message,
                })
              } finally {
                setFeishuTesting(false)
              }
            }}
            disabled={feishuTesting || !form.feishu_app_id.trim() || !form.feishu_app_secret.trim()}
            className="settings-browse-button"
            style={{
              opacity:
                feishuTesting || !form.feishu_app_id.trim() || !form.feishu_app_secret.trim()
                  ? 0.6
                  : 1,
            }}
          >
            {feishuTesting ? t('测试中…') : t('测试连接')}
          </button>
          {feishuTestResult && (
            <span
              className={
                feishuTestResult.success
                  ? 'settings-test-result--success'
                  : 'settings-test-result--error'
              }
            >
              {feishuTestResult.success ? '✓ ' : '✗ '}
              {formatFeishuResult(feishuTestResult, t)}
            </span>
          )}
        </div>
        <div className="settings-hint">
          {t('在')}
          <span
            onClick={() => window.electronAPI.openExternal('https://open.feishu.cn')}
            className="settings-link-button"
            style={{ display: 'inline' }}
          >
            {t('飞书开放平台')}
          </span>
          {t('创建自建应用，获取 App ID 和 App Secret，将应用添加到目标群聊并获取 Chat ID。')}
        </div>
      </div>

      {/* 通知设置 */}
      <div className="settings-field" style={{ marginTop: 16 }}>
        <div className="settings-field-label">{t('通知设置')}</div>
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={form.notification_enabled}
            onChange={e => update('notification_enabled', e.target.checked)}
            style={{ accentColor: 'var(--accent)' }}
          />
          <span>{t('启用系统通知（任务完成、错误等）')}</span>
        </label>
      </div>

      {/* 抖音配置 */}
      <div className="settings-section" style={{ marginTop: 24 }}>
        <div className="settings-section-title">{t('抖音配置')}</div>
        <div className="settings-field">
          <div className="settings-field-label">{t('抖音 Cookie')}</div>
          <textarea
            value={form.douyin_cookie || ''}
            onChange={e => update('douyin_cookie', e.target.value)}
            placeholder={t('点击下方按钮自动获取，或手动粘贴 Cookie')}
            rows={3}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-card)',
              color: 'var(--text)',
              fontSize: 12,
              fontFamily: 'monospace',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className="settings-browse-button"
              disabled={douyinSetupChecking}
              style={{ opacity: douyinSetupChecking ? 0.6 : 1 }}
              onClick={async () => {
                setDouyinSetupChecking(true)
                setDouyinSetupResult(null)
                try {
                  const result = await window.electronAPI.douyinSetup()
                  setDouyinSetupResult({
                    success: result.success,
                    message: result.success ? '环境检查通过！' : result.error || '检查失败',
                  })
                } catch (e: unknown) {
                  setDouyinSetupResult({ success: false, message: e instanceof Error ? e.message : '检查失败' })
                } finally {
                  setDouyinSetupChecking(false)
                }
              }}
            >
              {douyinSetupChecking ? t('检查中…') : t('检查环境')}
            </button>
            {douyinSetupResult && (
              <span className={douyinSetupResult.success ? 'settings-test-result--success' : 'settings-test-result--error'}>
                {douyinSetupResult.success ? '✓ ' : '✗ '}{t(douyinSetupResult.message)}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className="settings-browse-button"
              disabled={douyinLoginLoading}
              style={{ opacity: douyinLoginLoading ? 0.6 : 1 }}
              onClick={async () => {
                setDouyinLoginLoading(true)
                try {
                  const cookie = await window.electronAPI.douyinLogin()
                  if (cookie) {
                    update('douyin_cookie', cookie)
                  }
                } catch {
                  // 错误处理在 App.tsx 的 toast 中
                } finally {
                  setDouyinLoginLoading(false)
                }
              }}
            >
              {douyinLoginLoading ? t('获取中…') : t('自动获取 Cookie')}
            </button>
            {form.douyin_cookie && (
              <button
                className="settings-browse-button"
                onClick={() => update('douyin_cookie', '')}
                style={{ opacity: 0.6 }}
              >
                {t('清除')}
              </button>
            )}
          </div>
          <p className="settings-hint" style={{ marginTop: 8 }}>
            {t('首次使用：① 安装 Python 3.8+ ② 下载 douyin-downloader ③ 点击「检查环境」 ④ 点击「自动获取 Cookie」。')}<br/>
            {t('下载地址：')}<a href="#" onClick={e => { e.preventDefault(); window.electronAPI.openExternal('https://github.com/jiji262/douyin-downloader') }}>github.com/jiji262/douyin-downloader</a>
          </p>
        </div>
      </div>
    </div>
  )
}
