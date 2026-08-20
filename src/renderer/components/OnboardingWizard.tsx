/**
 * 首次启动向导（OnboardingWizard）—— docs/无感配置方案.md 推荐路径的 P0 实现。
 *
 * 状态机：1 AI Key → 2 笔记目录 → 3 Whisper → 4 完成页（待办卡片）。
 * - 每步进展写 config.onboarding.lastStep（config:save IPC），稍后配置/崩溃后
 *   下次启动由 computeStep(config) 续接；跳过全部 / 开始使用写 completed=true。
 * - 第 1 步剪贴板无感填充（useClipboardFill，sk- 与智谱 xxx.yyy 格式），命中即填入并触发
 *   ai:testConnection；验证成功自动前进（验证即前进，§3.4）。
 * - 第 3 步 whisper:autoDetect 命中显示 ✓ 并自动跳过；未装可 whisper:download（进度条）或跳过。
 * - 完成页核心就绪汇总 + 飞书/抖音/Notion 待办卡片（去设置直达对应 tab，可稍后再说）。
 *
 * 安全约束：剪贴板内容只进输入框与 ai:testConnection，绝不写日志/上报（§6）。
 */
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FolderOpen,
  Key,
  RotateCcw,
  Search,
  X,
} from 'lucide-react'
import type {
  AIProviderConfig,
  AIProviderId,
  AITestCode,
  AITestResult,
  OnboardingState,
  PodcastConfig,
  WhisperDownloadState,
} from '@shared/types'
import { AI_PROVIDER_PRESETS } from '@shared/ai-provider-presets'
import { useI18n } from '../i18n'
import GuideCarousel from './GuideCarousel'
import { useClipboardFill, type ClipPattern } from '../hooks/useClipboardFill'
import {
  computeStep,
  DONE_STEP,
  getActiveProviderKey,
  stepSatisfied,
} from '../data/onboarding-logic'

interface Props {
  config: PodcastConfig
  /** 向导写回配置后通知父组件刷新（config:save 已由主进程持久化） */
  onConfigSaved: (config: PodcastConfig) => void
  onClose: () => void
  /** 完成页待办卡片「去设置」：打开设置并定位到对应 tab */
  onOpenSettingsTab: (tab: 'api' | 'export') => void
}

const STEP_TITLES = ['AI Key', '笔记目录', '语音识别引擎'] as const

/** 每步右上角「不会？看图文」对应的 GuideCarousel 指南 key（onboarding-manifest.ts） */
const GUIDE_BY_STEP: Record<number, string> = { 1: 'ai-key', 2: 'dirs', 3: 'whisper' }

/** 剪贴板识别：sk- 系密钥与智谱 xxx.yyy 格式（命中即填入并触发测试） */
const KEY_PATTERNS: ClipPattern[] = [
  {
    id: 'sk-key',
    regex: /sk-[A-Za-z0-9_-]{8,}/,
    extract: text => {
      const m = text.match(/sk-[A-Za-z0-9_-]{8,}/)
      return m ? m[0] : null
    },
  },
  { id: 'zhipu-key', regex: /^[A-Za-z0-9]{8,}\.[A-Za-z0-9]{8,}$/ },
]

/** ai:testConnection 错误码 → 人话文案 key（i18n 字典已有对应翻译） */
function aiCodeLabel(code: AITestCode): string {
  switch (code) {
    case 'ok':
      return '连接成功'
    case 'invalid_key':
      return 'API Key 无效或已过期'
    case 'no_permission_or_balance':
      return '无权限或余额不足'
    case 'bad_url':
      return 'API 地址错误（检查地址是否需 /v1）'
    case 'rate_limited':
      return '请求被限流，请稍后重试'
    case 'network':
      return '网络连接失败或超时'
    default:
      return '连接失败，原因未知'
  }
}

/** 依据预设补全供应商配置（保留用户已有值；无预设时留空壳） */
function buildProviderConfig(
  providerId: AIProviderId,
  apiKey: string,
  prev?: AIProviderConfig,
): AIProviderConfig {
  const preset = AI_PROVIDER_PRESETS.find(p => p.id === providerId)
  return {
    id: providerId,
    name: prev?.name || preset?.name || providerId,
    apiKey,
    baseUrl: prev?.baseUrl || preset?.baseUrl || '',
    model: prev?.model || preset?.defaultModel || '',
    availableModels: prev?.availableModels || preset?.availableModels || [],
  }
}

/** 脱敏显示 Key（仅后 4 位，与主进程 maskSecret 一致） */
function maskKey(key: string): string {
  if (!key) return ''
  return key.length <= 4 ? '****' : '****' + key.slice(-4)
}

/** 完成页汇总行（图标 + 标签 + 值） */
function DoneItem({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <div className="obw-done-item">
      {ok ? (
        <CheckCircle2 size={14} className="obw-done-item__icon obw-done-item__icon--ok" />
      ) : (
        <AlertCircle size={14} className="obw-done-item__icon obw-done-item__icon--warn" />
      )}
      <span className="obw-done-item__label">{label}</span>
      <span className="obw-done-item__value" title={value}>
        {value}
      </span>
    </div>
  )
}

export default function OnboardingWizard({
  config,
  onConfigSaved,
  onClose,
  onOpenSettingsTab,
}: Props) {
  const { t } = useI18n()

  const [step, setStep] = useState<number>(() => computeStep(config))
  const [draft, setDraft] = useState<PodcastConfig>(() => ({
    ...config,
    ai_providers: { ...config.ai_providers },
  }))
  const [providerId, setProviderId] = useState<AIProviderId>(config.ai_provider || 'deepseek')
  const [keyInput, setKeyInput] = useState<string>(
    () => config.ai_providers?.[config.ai_provider || 'deepseek']?.apiKey || '',
  )
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<AITestResult | null>(null)
  const [autoFilled, setAutoFilled] = useState(false)
  const [dirsBusy, setDirsBusy] = useState(false)
  const [dirsError, setDirsError] = useState<string | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [detectError, setDetectError] = useState<string | null>(null)
  const [dlState, setDlState] = useState<WhisperDownloadState | null>(null)
  const [guideKey, setGuideKey] = useState<string | null>(null)
  const [neverAgain, setNeverAgain] = useState(false)
  const [dismissedTodos, setDismissedTodos] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)

  const draftRef = useRef(draft)
  const stepRef = useRef(step)
  const providerRef = useRef(providerId)
  const testingRef = useRef(testing)
  const persistRef = useRef<typeof persist>(null as unknown as typeof persist)
  const advanceTimerRef = useRef<number | null>(null)
  const detectRanRef = useRef<number | null>(null)
  const installedAdvanceRef = useRef<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])
  useEffect(() => {
    stepRef.current = step
  }, [step])
  useEffect(() => {
    providerRef.current = providerId
  }, [providerId])
  useEffect(() => {
    testingRef.current = testing
  }, [testing])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (advanceTimerRef.current !== null) {
        window.clearTimeout(advanceTimerRef.current)
        advanceTimerRef.current = null
      }
    }
  }, [])

  /** 合并 patch 与 onboarding 进度后 saveConfig，并同步 draft 与父组件 */
  const persist = useCallback(
    async (
      patch: Partial<PodcastConfig>,
      onboardingPatch: Partial<OnboardingState>,
    ): Promise<void> => {
      const current = draftRef.current
      const prev: OnboardingState = current.onboarding || {
        version: 1,
        completed: false,
        lastStep: stepRef.current,
      }
      const next: PodcastConfig = {
        ...current,
        ...patch,
        onboarding: {
          version: 1,
          completed: prev.completed ?? false,
          lastStep: stepRef.current,
          neverShowAgain: prev.neverShowAgain ?? false,
          ...onboardingPatch,
        },
      }
      await window.electronAPI.saveConfig(next).catch(() => false)
      setDraft(next)
      onConfigSaved(next)
    },
    [onConfigSaved],
  )

  useEffect(() => {
    persistRef.current = persist
  }, [persist])

  /** 步进：更新本地步并持久化 lastStep（崩溃/稍后配置后续接） */
  const goTo = useCallback(
    (target: number) => {
      setStep(target)
      void persist({}, { lastStep: target })
    },
    [persist],
  )

  /** 写 AI Key：更新 ai_providers 与活跃供应商，并同步 legacy api_key（与设置页保存行为一致） */
  const persistKey = useCallback(
    async (pid: AIProviderId, apiKey: string, lastStep?: number): Promise<void> => {
      const current = draftRef.current
      const providers = {
        ...(current.ai_providers || ({} as Record<AIProviderId, AIProviderConfig>)),
      }
      providers[pid] = buildProviderConfig(pid, apiKey, providers[pid])
      await persist(
        { ai_provider: pid, ai_providers: providers, api_key: apiKey },
        lastStep !== undefined ? { lastStep } : {},
      )
    },
    [persist],
  )

  /** 测试连接：成功即写回 Key 并自动进入下一步（验证即前进） */
  const runTest = useCallback(
    async (key: string, pid: AIProviderId) => {
      const trimmed = key.trim()
      if (!trimmed) {
        setTestResult({ success: false, code: 'unknown', detail: '' })
        return
      }
      const current = draftRef.current
      const preset = AI_PROVIDER_PRESETS.find(p => p.id === pid)
      const prev = current.ai_providers?.[pid]
      const baseUrl = prev?.baseUrl || preset?.baseUrl || ''
      const model = prev?.model || preset?.defaultModel || ''
      setTesting(true)
      setTestResult(null)
      try {
        const result = await window.electronAPI.testAIConnection({
          baseUrl,
          apiKey: trimmed,
          model,
          providerId: pid,
        })
        if (!mountedRef.current) return
        setTestResult(result)
        if (result.success) {
          await persistKey(pid, trimmed, 2)
          if (mountedRef.current) setStep(2)
        }
      } catch (err) {
        if (!mountedRef.current) return
        const msg = err instanceof Error ? err.message : String(err)
        setTestResult({ success: false, code: 'unknown', detail: msg })
      } finally {
        if (mountedRef.current) setTesting(false)
      }
    },
    [persistKey],
  )

  // 第 1 步剪贴板无感填充：命中即填入并触发测试（同一内容只触发一次，由 hook 去重）
  useClipboardFill({
    active: step === 1,
    patterns: KEY_PATTERNS,
    onFill: value => {
      if (testingRef.current) return
      setKeyInput(value)
      setAutoFilled(true)
      void runTest(value, providerRef.current)
    },
  })

  /** Whisper 自动检测：命中即显示 ✓ 并短暂停留后自动进入完成页 */
  const runDetect = useCallback(async () => {
    setDetecting(true)
    setDetectError(null)
    try {
      const res = await window.electronAPI.autoDetectWhisper()
      if (!mountedRef.current) return
      if (res.path) {
        const current = draftRef.current
        const next = { ...current, whisper_exe_path: res.path }
        setDraft(next)
        onConfigSaved(next)
        advanceTimerRef.current = window.setTimeout(() => {
          if (!mountedRef.current || stepRef.current !== 3) return
          setStep(DONE_STEP)
          void persistRef.current({}, { lastStep: DONE_STEP })
        }, 1200)
      }
    } catch (err) {
      if (!mountedRef.current) return
      const msg = err instanceof Error ? err.message : String(err)
      setDetectError(msg)
    } finally {
      if (mountedRef.current) setDetecting(false)
    }
  }, [onConfigSaved])

  // 进入第 3 步自动检测一次（回到本步不重复检测，可点「重新检测」）
  useEffect(() => {
    if (step !== 3) return
    if (detectRanRef.current === 3) return
    detectRanRef.current = 3
    void runDetect()
  }, [step, runDetect])

  // 挂载时拉取 Whisper 下载状态并订阅进度（下载在后台持续，与 TabWhisper 共用主进程状态）
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

  // 下载完成：回填路径，停留第 3 步时自动进入完成页
  useEffect(() => {
    if (!dlState || dlState.status !== 'installed' || !dlState.exePath) return
    const current = draftRef.current
    if (current.whisper_exe_path !== dlState.exePath) {
      const next = { ...current, whisper_exe_path: dlState.exePath }
      setDraft(next)
      onConfigSaved(next)
    }
    if (stepRef.current === 3 && installedAdvanceRef.current !== dlState.exePath) {
      installedAdvanceRef.current = dlState.exePath
      advanceTimerRef.current = window.setTimeout(() => {
        if (!mountedRef.current || stepRef.current !== 3) return
        setStep(DONE_STEP)
        void persistRef.current({}, { lastStep: DONE_STEP })
      }, 900)
    }
  }, [dlState, onConfigSaved])

  /** 稍后配置：保存当前步进度（勾选「下次不再提醒」则写 neverShowAgain）后关闭 */
  const handleLater = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      await persist(
        {},
        neverAgain
          ? { lastStep: stepRef.current, neverShowAgain: true }
          : { lastStep: stepRef.current },
      )
    } finally {
      onClose()
    }
  }, [persist, onClose, saving, neverAgain])

  // Esc 关闭（等同稍后配置）；图文弹层打开时先关弹层
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (guideKey) {
        setGuideKey(null)
        return
      }
      void handleLater()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [guideKey, handleLater])

  /** 跳过全部：写 completed=true 关闭（可随时在设置中完成配置） */
  const handleSkipAll = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      await persist({}, { completed: true, lastStep: DONE_STEP })
    } finally {
      onClose()
    }
  }, [persist, onClose, saving])

  /** 开始使用：写 completed=true 关闭 */
  const handleStart = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      await persist({}, { completed: true, lastStep: DONE_STEP })
    } finally {
      onClose()
    }
  }, [persist, onClose, saving])

  /** 待办卡片「去设置」：标记完成并直达对应设置 tab */
  const handleOpenSettings = useCallback(
    async (tab: 'api' | 'export') => {
      if (saving) return
      setSaving(true)
      try {
        await persist({}, { completed: true, lastStep: DONE_STEP })
      } finally {
        onOpenSettingsTab(tab)
      }
    },
    [persist, onOpenSettingsTab, saving],
  )

  const preset = AI_PROVIDER_PRESETS.find(p => p.id === providerId)

  function handleProviderChange(pid: AIProviderId) {
    setProviderId(pid)
    setKeyInput(draftRef.current.ai_providers?.[pid]?.apiKey || '')
    setTestResult(null)
    setAutoFilled(false)
  }

  function handleOpenApply() {
    if (preset?.apiKeyUrl) void window.electronAPI.openExternal(preset.apiKeyUrl)
  }

  /** 手动下一步（兜底，§3.4）：第 1 步保存 Key 后前进，其余步直接前进 */
  async function handleManualNext() {
    if (step === 1) {
      const trimmed = keyInput.trim()
      if (!trimmed) return
      await persistKey(providerId, trimmed, 2)
      setStep(2)
      return
    }
    goTo(Math.min(step + 1, DONE_STEP))
  }

  async function handleUseDefaultDirs() {
    setDirsBusy(true)
    setDirsError(null)
    try {
      const result = await window.electronAPI.createDefaultDirs()
      if (result.error) {
        setDirsError(t('创建默认目录失败') + '：' + result.error)
      } else {
        await persist(
          { obsidian_dir: result.obsidian_dir, audio_dir: result.audio_dir },
          { lastStep: 3 },
        )
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setDirsError(t('创建默认目录失败') + '：' + msg)
    } finally {
      setDirsBusy(false)
    }
  }

  async function handleSelectDir() {
    const dir = await window.electronAPI.selectDir()
    if (dir) await persist({ obsidian_dir: dir }, { lastStep: 3 })
  }

  async function handleInstallWhisper() {
    try {
      const s = await window.electronAPI.downloadWhisper()
      setDlState(s)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setDlState({ status: 'error', progress: 0, message: msg })
    }
  }

  function handleReDetect() {
    detectRanRef.current = null
    void runDetect()
  }

  const downloadActive =
    dlState?.status === 'checking' ||
    dlState?.status === 'downloading' ||
    dlState?.status === 'extracting'

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

  const hasKey = Boolean(getActiveProviderKey(draft))
  const hasDir = Boolean(draft.obsidian_dir?.trim())
  const hasWhisper = Boolean(draft.whisper_exe_path?.trim())

  const TODOS = [
    {
      id: 'feishu',
      title: t('飞书'),
      desc: t('连接飞书，自动推送笔记到群聊'),
      tab: 'api' as const,
    },
    {
      id: 'douyin',
      title: t('抖音'),
      desc: t('连接抖音，下载抖音视频转笔记'),
      tab: 'api' as const,
    },
    {
      id: 'notion',
      title: 'Notion',
      desc: t('连接 Notion，导出笔记到数据库'),
      tab: 'export' as const,
    },
  ]

  return createPortal(
    <div
      className="obw-overlay"
      onClick={e => {
        if (e.target === e.currentTarget) void handleLater()
      }}
    >
      <div className="obw-card" role="dialog" aria-modal="true" aria-label={t('欢迎使用 PodMuse')}>
        {/* 头部 */}
        <div className="obw-header">
          <div>
            <div className="obw-title">{t('欢迎使用 PodMuse')}</div>
            <div className="obw-subtitle">{t('3 步完成基础配置，马上开始使用')}</div>
          </div>
          <button
            className="obw-close"
            onClick={() => void handleLater()}
            aria-label={t('稍后配置')}
          >
            <X size={16} />
          </button>
        </div>

        {/* 步骤条（1-3 核心步 + 完成页） */}
        <div className="obw-stepper">
          {STEP_TITLES.map((title, i) => {
            const n = i + 1
            const isActive = step === n
            const isDone = step > n || stepSatisfied(draft, n)
            return (
              <Fragment key={title}>
                {i > 0 && <span className="obw-step-connector" />}
                <button
                  className={`obw-step${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}`}
                  onClick={() => {
                    if (step > n) goTo(n)
                  }}
                  disabled={step <= n}
                >
                  {isDone ? <CheckCircle2 size={12} /> : <span className="obw-step__num">{n}</span>}
                  {t(title)}
                </button>
              </Fragment>
            )
          })}
          <span className="obw-step-connector" />
          <button
            className={`obw-step${step === DONE_STEP ? ' is-active' : ''}${step > DONE_STEP ? ' is-done' : ''}`}
            disabled={step !== DONE_STEP}
          >
            {step > DONE_STEP ? (
              <CheckCircle2 size={12} />
            ) : (
              <span className="obw-step__num">{DONE_STEP}</span>
            )}
            {t('完成')}
          </button>
        </div>

        {/* 内容区 */}
        <div className="obw-body">
          {step !== DONE_STEP && GUIDE_BY_STEP[step] && (
            <div className="obw-guide-row">
              <button className="obw-link" onClick={() => setGuideKey(GUIDE_BY_STEP[step])}>
                <BookOpen size={12} />
                {t('不会？看图文')}
              </button>
            </div>
          )}

          {step === 1 && (
            <>
              <div className="obw-field">
                <div className="obw-field-label">{t('选择供应商')}</div>
                <select
                  className="obw-select"
                  value={providerId}
                  onChange={e => handleProviderChange(e.target.value as AIProviderId)}
                >
                  {AI_PROVIDER_PRESETS.map(p => (
                    <option key={p.id} value={p.id}>
                      {t(p.name)}
                    </option>
                  ))}
                </select>
                <div className="obw-hint" style={{ marginTop: 4 }}>
                  {preset ? t(preset.description) : ''}
                </div>
              </div>

              <div className="obw-field">
                <div className="obw-field-label">{t('输入 API Key')}</div>
                <input
                  type="password"
                  className="obw-input"
                  value={keyInput}
                  onChange={e => {
                    setKeyInput(e.target.value)
                    setTestResult(null)
                    setAutoFilled(false)
                  }}
                  placeholder={t(preset?.apiKeyPlaceholder || 'sk-...')}
                  autoFocus
                />
                <div className="obw-hint" style={{ marginTop: 6 }}>
                  {t('复制密钥后自动填入并测试，无需手动粘贴')}
                </div>
              </div>

              {autoFilled && testing && (
                <div className="obw-success">
                  <CheckCircle2 size={12} />
                  {t('剪贴板已自动填入，正在测试…')}
                </div>
              )}
              {!autoFilled && testing && <div className="obw-hint">{t('测试中…')}</div>}
              {testResult && (
                <div className={testResult.success ? 'obw-success' : 'obw-error'}>
                  {testResult.success ? (
                    <>
                      <CheckCircle2 size={12} />
                      {t('连接成功，正在进入下一步…')}
                    </>
                  ) : (
                    <>
                      <AlertCircle
                        size={12}
                        style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }}
                      />
                      {t(aiCodeLabel(testResult.code))}
                      {testResult.detail ? '：' + testResult.detail : ''}
                    </>
                  )}
                </div>
              )}

              <div className="obw-row">
                <button
                  className="obw-btn obw-btn--primary"
                  onClick={() => void runTest(keyInput, providerId)}
                  disabled={testing || !keyInput.trim()}
                >
                  <Key size={13} />
                  {testing ? t('测试中…') : t('测试连接')}
                </button>
                <button className="obw-btn" onClick={handleOpenApply} disabled={!preset?.apiKeyUrl}>
                  <ExternalLink size={13} />
                  {t('去申请')}
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="obw-field">
                <div className="obw-field-label">{t('笔记目录')}</div>
                {draft.obsidian_dir ? (
                  <div className="obw-path">
                    <FolderOpen
                      size={12}
                      style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
                    />
                    {draft.obsidian_dir}
                  </div>
                ) : (
                  <div className="obw-hint">{t('尚未配置')}</div>
                )}
              </div>
              <div className="obw-row">
                <button
                  className="obw-btn obw-btn--primary"
                  onClick={() => void handleUseDefaultDirs()}
                  disabled={dirsBusy}
                >
                  <FolderOpen size={13} />
                  {dirsBusy ? t('创建中…') : t('一键使用默认目录')}
                </button>
                <button
                  className="obw-btn"
                  onClick={() => void handleSelectDir()}
                  disabled={dirsBusy}
                >
                  <Search size={13} />
                  {t('选择文件夹')}
                </button>
              </div>
              {dirsError && (
                <div className="obw-error">
                  <AlertCircle
                    size={12}
                    style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }}
                  />
                  {dirsError}
                </div>
              )}
              <div className="obw-hint">
                {t('使用默认目录将创建：文档/PodMuse笔记、下载/PodMuse音频')}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              {detecting && <div className="obw-hint">{t('正在检测已安装的引擎…')}</div>}
              {detectError && (
                <div className="obw-error">
                  <AlertCircle
                    size={12}
                    style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }}
                  />
                  {detectError}
                </div>
              )}
              {!detecting && draft.whisper_exe_path && (
                <div className="obw-success">
                  <CheckCircle2 size={13} />
                  {t('已检测到路径')}：{draft.whisper_exe_path}
                </div>
              )}
              {!detecting && !draft.whisper_exe_path && (
                <>
                  <div className="obw-hint">
                    {t('未检测到引擎，可一键下载安装，或稍后在设置中安装')}
                  </div>
                  {downloadActive ? (
                    <div className="obw-field">
                      <div className="obw-row" style={{ justifyContent: 'space-between' }}>
                        <span className="obw-hint">{statusLabel}</span>
                        <button
                          className="obw-link"
                          onClick={() => void window.electronAPI.cancelWhisperDownload()}
                        >
                          {t('取消下载')}
                        </button>
                      </div>
                      <div className="obw-progress">
                        <div
                          className="obw-progress-bar"
                          style={{ width: (dlState ? dlState.progress : 0) + '%' }}
                        />
                      </div>
                      {dlState?.message && (
                        <div className="obw-hint" style={{ marginTop: 6 }}>
                          {dlState.message}
                        </div>
                      )}
                    </div>
                  ) : dlState?.status === 'error' ? (
                    <>
                      <div className="obw-error">
                        <AlertCircle
                          size={12}
                          style={{ display: 'inline', verticalAlign: 'middle', marginRight: 3 }}
                        />
                        {dlState.message}
                      </div>
                      <div className="obw-row">
                        <button className="obw-btn" onClick={() => void handleInstallWhisper()}>
                          <RotateCcw size={13} />
                          {t('重试')}
                        </button>
                        <button className="obw-btn" onClick={() => goTo(DONE_STEP)}>
                          {t('跳过，稍后装')}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="obw-row">
                      <button
                        className="obw-btn obw-btn--primary"
                        onClick={() => void handleInstallWhisper()}
                      >
                        <Download size={14} />
                        {t('一键下载')}
                      </button>
                      <button className="obw-btn" onClick={() => goTo(DONE_STEP)}>
                        {t('跳过，稍后装')}
                      </button>
                    </div>
                  )}
                  <div className="obw-row">
                    <button className="obw-link" onClick={handleReDetect}>
                      <Search size={11} />
                      {t('自动检测引擎')}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {step === DONE_STEP && (
            <>
              <div className="obw-section-title">{t('核心配置已就绪')}</div>
              <div className="obw-done-list">
                <DoneItem
                  ok={hasKey}
                  label={t('AI Key')}
                  value={hasKey ? maskKey(getActiveProviderKey(draft)) : t('尚未配置')}
                />
                <DoneItem
                  ok={hasDir}
                  label={t('笔记目录')}
                  value={hasDir ? draft.obsidian_dir : t('尚未配置')}
                />
                <DoneItem
                  ok={hasWhisper}
                  label={t('语音识别引擎')}
                  value={hasWhisper ? draft.whisper_exe_path : t('尚未配置')}
                />
              </div>

              <div className="obw-section-title">{t('可选连接（推荐，可稍后在设置中完成）')}</div>
              <div className="obw-todo-grid">
                {TODOS.filter(td => !dismissedTodos[td.id]).map(td => (
                  <div key={td.id} className="obw-todo-card">
                    <div>
                      <div className="obw-todo-card__title">{td.title}</div>
                      <div className="obw-todo-card__desc">{td.desc}</div>
                    </div>
                    <div className="obw-todo-card__actions">
                      <button
                        className="obw-btn obw-btn--primary"
                        onClick={() => void handleOpenSettings(td.tab)}
                      >
                        {t('去设置')}
                      </button>
                      <button
                        className="obw-btn obw-btn--ghost"
                        onClick={() => setDismissedTodos(prev => ({ ...prev, [td.id]: true }))}
                      >
                        {t('稍后再说')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="obw-footer">
          <div className="obw-footer__left">
            <label className="obw-checkbox">
              <input
                type="checkbox"
                checked={neverAgain}
                onChange={e => setNeverAgain(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              <span>{t('下次不再提醒')}</span>
            </label>
          </div>
          <div className="obw-footer__right">
            {step > 1 && step < DONE_STEP && (
              <button className="obw-btn" onClick={() => goTo(step - 1)} disabled={saving}>
                <ChevronLeft size={13} />
                {t('上一步')}
              </button>
            )}
            {step < DONE_STEP && (
              <button
                className="obw-btn obw-btn--primary"
                onClick={() => void handleManualNext()}
                disabled={saving || (step === 1 && !keyInput.trim())}
              >
                {t('下一步')}
                <ChevronRight size={13} />
              </button>
            )}
            <button
              className="obw-btn obw-btn--ghost"
              onClick={() => void handleLater()}
              disabled={saving}
              title={t('稍后配置将保存当前进度，下次启动继续')}
            >
              {t('稍后配置')}
            </button>
            <button
              className="obw-btn obw-btn--ghost"
              onClick={() => void handleSkipAll()}
              disabled={saving}
              title={t('跳过全部后，可随时在设置中完成配置')}
            >
              {t('跳过全部')}
            </button>
            {step === DONE_STEP && (
              <button
                className="obw-btn obw-btn--primary"
                onClick={() => void handleStart()}
                disabled={saving}
              >
                {t('开始使用')}
              </button>
            )}
          </div>
        </div>
      </div>

      {guideKey && <GuideCarousel guideKey={guideKey} onClose={() => setGuideKey(null)} />}
    </div>,
    document.body,
  )
}
