import { useState, useEffect, useRef } from 'react'
import { PodcastConfig, AIProviderId, AIProviderConfig, AITestCode, AITestResult } from '@shared/types'
import { AI_PROVIDER_PRESETS } from '@shared/ai-provider-presets'
import { TabHeader, Field } from './FieldComponents'
import { useI18n } from '../../i18n'
import GuideCarousel from '../GuideCarousel'
import DouyinConnectionCard from './DouyinConnectionCard'
import FeishuOAuthCard from './FeishuOAuthCard'
import { useClipboardFill } from '../../hooks/useClipboardFill'
import { loadAIModels } from '../../data/ai-model-loader'
import {
  extractFieldValue,
  FEISHU_APP_ID_PATTERN,
  FEISHU_CHAT_ID_PATTERN,
} from '../../data/clipboard-field-patterns'

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

// AI 测试连接错误码 → 中文人话文案（detail 由主进程返回，只含状态码与脱敏摘要）
function formatAITestCode(code: AITestCode, t: (key: string) => string): string {
  switch (code) {
    case 'ok':
      return t('连接成功')
    case 'invalid_key':
      return t('API Key 无效或已过期')
    case 'no_permission_or_balance':
      return t('无权限或余额不足')
    case 'bad_url':
      return t('API 地址错误（检查地址是否需 /v1）')
    case 'rate_limited':
      return t('请求被限流，请稍后重试')
    case 'network':
      return t('网络连接失败或超时')
    default:
      return t('连接失败，原因未知')
  }
}

import {
  Fish,
  Bot,
  BookOpen,
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
  const [aiTesting, setAiTesting] = useState(false)
  const [aiTestResult, setAiTestResult] = useState<AITestResult | null>(null)
  const [feishuTesting, setFeishuTesting] = useState(false)
  const [feishuTestResult, setFeishuTestResult] = useState<{
    success: boolean
    code?: string
    message?: string
    chatName?: string
    detail?: string
  } | null>(null)
  const [guideKey, setGuideKey] = useState<string | null>(null)
  const [feishuAdvancedOpen, setFeishuAdvancedOpen] = useState(false)

  // 模型加载期间的供应商切换守卫：加载完成时若已切换供应商，丢弃过期结果
  const activeProviderRef = useRef<AIProviderId>(activeProvider)
  useEffect(() => {
    activeProviderRef.current = activeProvider
  }, [activeProvider])

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
    setAiTestResult(null)
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
    // key / 地址变化后旧测试结果失效
    if (key === 'apiKey' || key === 'baseUrl') setAiTestResult(null)
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
    setAiTestResult(null)
  }

  // 测试连接：发 1 token 最小请求验证 Key 与地址
  async function handleTestConnection() {
    const apiKey = currentProvider.apiKey
    const baseUrl = currentProvider.baseUrl || currentPreset?.baseUrl || ''
    if (!apiKey) {
      setAiTestResult({ success: false, code: 'unknown', detail: '' })
      return
    }

    setAiTesting(true)
    setAiTestResult(null)

    try {
      const result = await window.electronAPI.testAIConnection({
        baseUrl,
        apiKey,
        model: currentProvider.model || '',
        providerId: activeProvider,
      })
      setAiTestResult(result)
      // 测试连接成功后自动加载模型列表（评审遗留：成功即加载，无需再点「加载模型」）
      if (result.success) void runLoadModels()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setAiTestResult({ success: false, code: 'unknown', detail: msg })
    } finally {
      setAiTesting(false)
    }
  }

  // 拉取模型列表（手动「加载模型」按钮与「测试连接成功自动加载」共用）
  async function runLoadModels() {
    const pid = activeProvider
    const apiKey = currentProvider.apiKey
    const baseUrl = currentProvider.baseUrl || currentPreset?.baseUrl || ''

    if (!apiKey) {
      setFetchModelsStatus('请先填写 API Key')
      return
    }

    setFetchingModels(true)
    setFetchModelsStatus('加载中...')
    setFetchedModels([])

    try {
      const out = await loadAIModels({
        fetchModels: (u, k) => window.electronAPI.fetchAIModels(u, k),
        baseUrl,
        apiKey,
        currentModel: currentProvider.model,
      })
      if (pid !== activeProviderRef.current) return // 期间切换了供应商，丢弃过期结果
      if (out.ok) {
        setFetchedModels(out.models)
        setFetchModelsStatus(t('已加载') + ' ' + out.models.length + ' ' + t('个模型'))
        // 如果当前没有选择模型，自动选择第一个
        if (out.autoSelectId) updateProviderConfig('model', out.autoSelectId)
      } else if (out.thrownError) {
        setFetchModelsStatus(t('加载失败') + ': ' + out.thrownError)
      } else {
        setFetchModelsStatus(out.error || t('未找到可用模型'))
      }
    } finally {
      setFetchingModels(false)
    }
  }

  // 飞书高级模式：剪贴板无感填充（cli_ → App ID，oc_ → Chat ID；Secret 无特征化，走「粘贴」按钮）。
  // 只填仍为空的字段，已填内容不覆盖（替换请用「粘贴」按钮）；未展开高级模式不轮询。
  useClipboardFill({
    active: feishuAdvancedOpen && !form.feishu_app_id.trim(),
    patterns: [FEISHU_APP_ID_PATTERN],
    onFill: value => update('feishu_app_id', value),
  })

  useClipboardFill({
    active: feishuAdvancedOpen && !form.feishu_chat_id.trim(),
    patterns: [FEISHU_CHAT_ID_PATTERN],
    onFill: value => update('feishu_chat_id', value),
  })

  // 「粘贴」兜底：读剪贴板填入指定字段（可识别值优先提取，否则原样填入）
  async function pasteFeishuField(field: 'appId' | 'appSecret' | 'chatId') {
    try {
      const text = await window.electronAPI.readClipboardText()
      const trimmed = text.trim()
      if (!trimmed) return
      let value = trimmed
      if (field === 'appId') value = extractFieldValue(trimmed, 'feishu-app-id') ?? trimmed
      if (field === 'chatId') value = extractFieldValue(trimmed, 'feishu-chat-id') ?? trimmed
      if (field === 'appId') update('feishu_app_id', value)
      else if (field === 'appSecret') update('feishu_app_secret', value)
      else update('feishu_chat_id', value)
    } catch (e) {
      console.warn('[clipfill] paste failed:', (e as Error)?.message) // 绝不记录剪贴板内容
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
              <button className="settings-link-button" onClick={() => setGuideKey('ai-key')}>
                <BookOpen size={11} />
                {t('看图文')}
              </button>
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
                  onClick={handleTestConnection}
                  disabled={aiTesting || !currentProvider.apiKey}
                  className="settings-browse-button"
                  style={{
                    whiteSpace: 'nowrap',
                    opacity: !currentProvider.apiKey ? 0.5 : 1,
                  }}
                  title={
                    !currentProvider.apiKey
                      ? t('请先填写 API Key')
                      : t('测试连接（发送 1 token 最小请求）')
                  }
                >
                  {aiTesting ? t('测试中…') : t('测试连接')}
                </button>
                <button
                  onClick={() => void runLoadModels()}
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
              {aiTestResult && (
                <div
                  className={
                    aiTestResult.success
                      ? 'settings-test-result--success'
                      : 'settings-test-result--error'
                  }
                >
                  {aiTestResult.success
                    ? '✓ ' + t('连接成功') + '（' + t('模型') + ' ' + (currentProvider.model || '—') + '）'
                    : '✗ ' + formatAITestCode(aiTestResult.code, t) + (aiTestResult.detail ? '：' + aiTestResult.detail : '')}
                </div>
              )}
              <div className="settings-hint">
                {t('填写 API Key 后点击「加载模型」可获取该供应商的可用模型列表')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 飞书连接服务（OAuth）：未配置时按钮置灰，高级三字段模式折叠保留 */}
      <div style={{ marginTop: 24 }}>
        <div
          className="settings-dir-row"
          style={{ justifyContent: 'space-between', marginBottom: 12 }}
        >
          <div className="settings-section-title">{t('飞书集成')}</div>
          <button className="settings-link-button" onClick={() => setGuideKey('feishu')}>
            <BookOpen size={11} />
            {t('连接飞书 · 看图文')}
          </button>
        </div>

        <FeishuOAuthCard />

        <details
          open={feishuAdvancedOpen}
          onToggle={e => setFeishuAdvancedOpen(e.currentTarget.open)}
          style={{ marginTop: 8 }}
        >
          <summary
            className="settings-link-button"
            style={{ display: 'inline-block', cursor: 'pointer' }}
          >
            {t('高级模式（自建应用）')}
          </summary>
          <div className="settings-grid" style={{ marginTop: 10 }}>
            <Field
              label={t('飞书 App ID')}
              value={form.feishu_app_id}
              onChange={v => update('feishu_app_id', v)}
              placeholder="cli_xxxxxxxxxx"
              onPaste={() => void pasteFeishuField('appId')}
              pasteTitle="在飞书复制对应值后点粘贴"
            />
            <Field
              label={t('飞书 App Secret')}
              value={form.feishu_app_secret}
              onChange={v => update('feishu_app_secret', v)}
              secret
              placeholder={t('输入飞书应用 App Secret')}
              onPaste={() => void pasteFeishuField('appSecret')}
              pasteTitle="在飞书复制对应值后点粘贴"
            />
            <Field
              label={t('飞书群聊 Chat ID')}
              value={form.feishu_chat_id}
              onChange={v => update('feishu_chat_id', v)}
              placeholder="oc_xxxxxxxxxxxxxxxxxx"
              onPaste={() => void pasteFeishuField('chatId')}
              pasteTitle="在飞书复制对应值后点粘贴"
            />
          </div>
          <div className="settings-hint" style={{ marginTop: 8 }}>
            {t('在飞书复制对应值后点粘贴')}；
            {t('复制 App ID（cli_）或 Chat ID（oc_）后会自动识别填入')}
            {t('；Chat ID 可留空——用上方「连接飞书」扫码授权后会自动列出群聊选择，无需手动复制')}
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
              disabled={
                feishuTesting || !form.feishu_app_id.trim() || !form.feishu_app_secret.trim()
              }
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
        </details>
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

      {/* 抖音：无 Cookie 展示 —— 主进程闭环登录，渲染层只见状态与昵称 */}
      <DouyinConnectionCard />

      {guideKey && <GuideCarousel guideKey={guideKey} onClose={() => setGuideKey(null)} />}
    </div>
  )
}
