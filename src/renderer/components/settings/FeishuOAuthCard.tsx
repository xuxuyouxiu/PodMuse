import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { FEISHU_OAUTH_REDIRECT_URI } from '@shared/constants'

const POLL_INTERVAL_MS = 1500
/** renderer 侧轮询上限（主进程 callback-server 等待窗口为 5 分钟） */
const POLL_TIMEOUT_MS = 3 * 60 * 1000

/**
 * 飞书连接状态卡（OAuth「连接服务」模式）—— 三态：
 *   未配置（按钮置灰「连接服务准备中（可先用下方高级模式）」）/ 未连接（[连接飞书]）/
 *   已连接·群名（群聊下拉 + [断开]）/ 授权过期（[重新连接]）。
 * 主进程闭环：token 永不进入渲染层，本组件只与 feishu:oauthStatus / oauthStart /
 * oauthChats / oauthSelectChat / oauthDisconnect 交互；高级三字段模式保留在 TabApi 折叠区。
 */
export default function FeishuOAuthCard() {
  const { t } = useI18n()
  const [statusInfo, setStatusInfo] = useState<FeishuOAuthStatusInfo | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [chats, setChats] = useState<FeishuChatInfo[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPoll() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }

  async function loadChats() {
    setChatLoading(true)
    setChatError(null)
    try {
      const result = await window.electronAPI.feishuOAuthChats()
      if (result.success && result.chats) {
        setChats(result.chats)
      } else {
        setChatError(result.error || t('群聊列表加载失败'))
      }
    } catch {
      setChatError(t('群聊列表加载失败'))
    } finally {
      setChatLoading(false)
    }
  }

  /** 连接后轮询状态直到 connected / 超时（feishu:oauthStatus 事件也会即时更新） */
  function startPoll() {
    stopPoll()
    const startedAt = Date.now()
    pollTimer.current = setInterval(() => {
      void (async () => {
        const info = await window.electronAPI.feishuOAuthStatus().catch(() => null)
        if (!info) return
        setStatusInfo(info)
        if (info.connected) {
          stopPoll()
          setConnecting(false)
          await loadChats()
        } else if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          stopPoll()
          setConnecting(false)
          setActionError(t('连接超时，请重新尝试'))
        }
      })()
    }, POLL_INTERVAL_MS)
  }

  useEffect(() => {
    // 挂载时读取一次状态；setState 放在异步回调里，避免 effect 内同步 setState
    let cancelled = false
    window.electronAPI
      .feishuOAuthStatus()
      .then(info => {
        if (cancelled) return
        setStatusInfo(info)
        if (info.connected) void loadChats()
      })
      .catch(() => {})
    const off = window.electronAPI.onFeishuOAuthStatus(info => {
      if (cancelled) return
      setStatusInfo(info)
      if (info.connected) void loadChats()
    })
    return () => {
      cancelled = true
      off()
      stopPoll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleConnect() {
    setConnecting(true)
    setActionError(null)
    setChatError(null)
    try {
      const result = await window.electronAPI.feishuOAuthStart()
      if (!result.success) {
        setConnecting(false)
        setActionError(result.error || t('连接失败'))
        return
      }
      // 浏览器授权页已打开：自动轮询状态直到 connected / 超时
      startPoll()
    } catch {
      setConnecting(false)
      setActionError(t('连接失败'))
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    setActionError(null)
    setChatError(null)
    try {
      const info = await window.electronAPI.feishuOAuthDisconnect()
      setStatusInfo(info)
      setChats([])
      stopPoll()
    } catch {
      setActionError(t('断开失败'))
    } finally {
      setDisconnecting(false)
    }
  }

  async function handleSelectChat(chatId: string) {
    if (!chatId) return
    setChatError(null)
    const chat = chats.find(c => c.id === chatId)
    try {
      const result = await window.electronAPI.feishuOAuthSelectChat(chatId, chat?.name)
      if (!result.success) {
        setChatError(result.error || t('选择群聊失败'))
        return
      }
      const info = await window.electronAPI.feishuOAuthStatus().catch(() => null)
      if (info) setStatusInfo(info)
    } catch {
      setChatError(t('选择群聊失败'))
    }
  }

  const configured = statusInfo?.configured ?? false
  const connected = statusInfo?.connected ?? false
  const expired = statusInfo?.tokenExpired ?? false

  return (
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
          <span className="settings-test-result--muted">{t('正在读取连接状态…')}</span>
        ) : expired ? (
          <span className="settings-test-result--error">⚠ {t('授权已过期，请重新连接')}</span>
        ) : connected ? (
          <span className="settings-test-result--success">
            ✓ {t('已连接飞书')}
            {statusInfo.chatName ? '（' + statusInfo.chatName + '）' : ''}
          </span>
        ) : (
          <span className="settings-test-result--muted">{t('尚未连接')}</span>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="settings-browse-button"
            disabled={!configured || connecting || (connected && !expired)}
            style={{ opacity: !configured || connecting || (connected && !expired) ? 0.6 : 1 }}
            onClick={handleConnect}
          >
            {!configured
              ? t('连接飞书（未配置）')
              : connecting
                ? t('等待授权…')
                : connected && !expired
                  ? t('重新连接')
                  : expired
                    ? t('重新连接')
                    : t('连接飞书')}
          </button>
          {connected && (
            <button
              className="settings-browse-button"
              disabled={disconnecting}
              style={{ opacity: disconnecting ? 0.6 : 1 }}
              onClick={handleDisconnect}
            >
              {disconnecting ? t('断开中…') : t('断开')}
            </button>
          )}
        </div>
      </div>

      {/* 目标群聊下拉：连接后显示（feishu:oauthChats） */}
      {connected && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="settings-field-label" style={{ marginBottom: 0 }}>
            {t('目标群聊')}
          </div>
          <select
            className="settings-input"
            style={{ flex: 1, minWidth: 200 }}
            value={statusInfo?.chatId || ''}
            onChange={e => handleSelectChat(e.target.value)}
            disabled={chatLoading}
          >
            <option value="">
              {chatLoading
                ? t('加载群聊中…')
                : statusInfo?.chatName
                  ? statusInfo.chatName
                  : t('选择群聊…')}
            </option>
            {chats.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            className="settings-link-button"
            onClick={() => loadChats()}
            disabled={chatLoading}
          >
            {t('刷新列表')}
          </button>
        </div>
      )}

      {chatError && (
        <span className="settings-test-result--error" style={{ display: 'block', marginTop: 8 }}>
          ✗ {chatError}
        </span>
      )}
      {actionError && (
        <span className="settings-test-result--error" style={{ display: 'block', marginTop: 8 }}>
          ✗ {actionError}
        </span>
      )}
      {!configured && (
        <p className="settings-hint" style={{ marginTop: 8 }}>
          {t(
            '先在下方「高级模式（自建应用）」填入 App ID 和 App Secret（Chat ID 可留空）并保存，本按钮即变为「连接飞书」；扫码授权后自动列出群聊选择，无需手动复制 Chat ID。',
          )}
        </p>
      )}
      {!connected && (
        <>
          <div
            className="settings-hint"
            style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
          >
            <span>{t('回调地址')}:</span>
            <code
              style={{
                fontSize: 12,
                background: 'var(--bg-elevated)',
                padding: '2px 6px',
                borderRadius: 4,
                border: '1px solid var(--border)',
              }}
            >
              {FEISHU_OAUTH_REDIRECT_URI}
            </code>
            <button
              className="settings-link-button"
              onClick={() => {
                navigator.clipboard.writeText(FEISHU_OAUTH_REDIRECT_URI)
                alert(t('已复制回调地址'))
              }}
            >
              {t('复制')}
            </button>
          </div>
          <p className="settings-hint" style={{ marginTop: 4 }}>
            {t(
              '首次使用需把上方地址添加到飞书开发者后台 → 应用 → 开发配置 → 安全设置 → 重定向 URL（只需一次），否则授权页会提示 20029「重定向 URL 有误」。',
            )}
          </p>
        </>
      )}
      <p className="settings-hint" style={{ marginTop: 8 }}>
        {t(
          '点击「连接飞书」后浏览器将打开飞书授权页，扫码/登录并授权后自动回到本页，无需手动复制任何参数。',
        )}
      </p>
    </div>
  )
}
