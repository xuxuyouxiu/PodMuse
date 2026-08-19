import { useEffect, useState } from 'react'
import { BookOpen } from 'lucide-react'
import GuideCarousel from '../GuideCarousel'
import { useI18n } from '../../i18n'

/**
 * 抖音连接状态卡（「无 Cookie 展示」）—— 三态：
 *   未连接（[连接抖音]）/ 已连接·昵称（[重新登录][退出登录]）/ 已过期（[重新登录]）。
 * 主进程闭环：cookie 永不进入渲染层，本组件只与 douyin:connect / douyin:status / douyin:disconnect 交互。
 * 附「怎么登录？看图文」入口（GuideCarousel('douyin')）与下载器环境检查行。
 */
export default function DouyinConnectionCard() {
  const { t } = useI18n()
  const [statusInfo, setStatusInfo] = useState<DouyinStatusInfo | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionWarning, setActionWarning] = useState<string | null>(null)
  const [setupChecking, setSetupChecking] = useState(false)
  const [setupResult, setSetupResult] = useState<{ success: boolean; message: string } | null>(null)
  const [showGuide, setShowGuide] = useState(false)

  async function refreshStatus() {
    try {
      const info = await window.electronAPI.douyinGetStatus()
      setStatusInfo(info)
    } catch {
      setStatusInfo(null)
    }
  }

  useEffect(() => {
    // 挂载时读取一次登录状态；setState 放在异步回调里，避免 effect 内同步 setState
    let cancelled = false
    window.electronAPI
      .douyinGetStatus()
      .then(info => {
        if (!cancelled) setStatusInfo(info)
      })
      .catch(() => {
        if (!cancelled) setStatusInfo(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleConnect() {
    setConnecting(true)
    setActionError(null)
    setActionWarning(null)
    try {
      const result = await window.electronAPI.douyinConnect()
      if (result.success) {
        if (result.warning) setActionWarning(result.warning)
        await refreshStatus()
      } else if (result.cancelled) {
        setActionWarning(t('已取消登录，未改动配置'))
      } else {
        setActionError(result.error || t('连接失败'))
      }
    } catch {
      setActionError(t('连接失败'))
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    setActionError(null)
    setActionWarning(null)
    try {
      const info = await window.electronAPI.douyinDisconnect()
      setStatusInfo(info)
    } catch {
      setActionError(t('退出登录失败'))
    } finally {
      setDisconnecting(false)
    }
  }

  async function handleSetupCheck() {
    setSetupChecking(true)
    setSetupResult(null)
    try {
      const result = await window.electronAPI.douyinSetup()
      setSetupResult({
        success: result.success,
        message: result.success ? '环境检查通过！' : result.error || '检查失败',
      })
    } catch (e: unknown) {
      setSetupResult({ success: false, message: e instanceof Error ? e.message : '检查失败' })
    } finally {
      setSetupChecking(false)
    }
  }

  const status = statusInfo?.status ?? 'disconnected'
  const connected = status === 'connected' || status === 'unverified'
  const expired = status === 'expired'

  return (
    <div className="settings-section" style={{ marginTop: 24 }}>
      <div className="settings-section-title">{t('抖音配置')}</div>
      <div className="settings-field">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          {statusInfo === null ? (
            <span className="settings-test-result--muted">{t('正在读取登录状态…')}</span>
          ) : connected ? (
            <span className="settings-test-result--success">
              ✓ {t('已连接抖音')}
              {statusInfo.nickname ? ' · ' + statusInfo.nickname : ''}
              {status === 'unverified' ? '（' + t('待验证，将自动重试') + '）' : ''}
            </span>
          ) : expired ? (
            <span className="settings-test-result--error">⚠ {t('登录态已失效，请重新登录')}</span>
          ) : (
            <span className="settings-test-result--muted">{t('尚未连接')}</span>
          )}
          <button className="settings-link-button" onClick={() => setShowGuide(true)}>
            <BookOpen size={11} />
            {t('怎么登录？看图文')}
          </button>
        </div>

        <div
          style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}
        >
          <button
            className="settings-browse-button"
            disabled={connecting}
            style={{ opacity: connecting ? 0.6 : 1 }}
            onClick={handleConnect}
          >
            {connecting ? t('连接中…') : connected || expired ? t('重新登录') : t('连接抖音')}
          </button>
          {connected && (
            <button
              className="settings-browse-button"
              disabled={disconnecting}
              style={{ opacity: disconnecting ? 0.6 : 1 }}
              onClick={handleDisconnect}
            >
              {disconnecting ? t('退出中…') : t('退出登录')}
            </button>
          )}
        </div>

        {actionWarning && (
          <span className="settings-test-result--muted" style={{ display: 'block', marginTop: 8 }}>
            {actionWarning}
          </span>
        )}
        {actionError && (
          <span className="settings-test-result--error" style={{ display: 'block', marginTop: 8 }}>
            ✗ {actionError}
          </span>
        )}

        {/* 下载器环境组件状态行（Python / douyin-downloader 一键检查） */}
        <div
          style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}
        >
          <button
            className="settings-browse-button"
            disabled={setupChecking}
            style={{ opacity: setupChecking ? 0.6 : 1 }}
            onClick={handleSetupCheck}
          >
            {setupChecking ? t('检查中…') : t('检查环境')}
          </button>
          {setupResult && (
            <span
              className={
                setupResult.success
                  ? 'settings-test-result--success'
                  : 'settings-test-result--error'
              }
            >
              {setupResult.success ? '✓ ' : '✗ '}
              {t(setupResult.message)}
            </span>
          )}
        </div>

        <p className="settings-hint" style={{ marginTop: 8 }}>
          {t(
            '首次使用：① 安装 Python 3.8+ ② 下载 douyin-downloader ③ 点击「检查环境」 ④ 点击「连接抖音」扫码登录。',
          )}
          <br />
          {t('下载地址：')}
          <a
            href="#"
            onClick={e => {
              e.preventDefault()
              window.electronAPI.openExternal('https://github.com/jiji262/douyin-downloader')
            }}
          >
            github.com/jiji262/douyin-downloader
          </a>
        </p>
      </div>

      {showGuide && <GuideCarousel guideKey="douyin" onClose={() => setShowGuide(false)} />}
    </div>
  )
}
