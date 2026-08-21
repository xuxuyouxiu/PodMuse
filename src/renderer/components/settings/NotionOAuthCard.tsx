import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { NOTION_OAUTH_REDIRECT_URI } from '@shared/constants'

const POLL_INTERVAL_MS = 1500
/** renderer 侧轮询上限（主进程授权等待窗口为 5 分钟） */
const POLL_TIMEOUT_MS = 3 * 60 * 1000

/**
 * Notion 连接状态卡（OAuth「连接服务」模式）—— 三态：
 *   未配置（按钮置灰「连接功能准备中（可先用下方高级模式）」）/ 未连接（[连接 Notion]）/
 *   已连接（数据库下拉 + [断开]）。
 * 主进程闭环：token 永不进入渲染层，本组件只与 notion:oauthStatus / oauthStart /
 * oauthDatabases / oauthSelectDb / oauthDisconnect 交互；手动 token/database id
 * 高级模式保留在 TabExport 折叠区。
 */
export default function NotionOAuthCard() {
  const { t } = useI18n()
  const [statusInfo, setStatusInfo] = useState<NotionOAuthStatusInfo | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [databases, setDatabases] = useState<NotionDatabaseInfo[]>([])
  const [dbLoading, setDbLoading] = useState(false)
  const [dbError, setDbError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPoll() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }

  async function loadDatabases() {
    setDbLoading(true)
    setDbError(null)
    try {
      const result = await window.electronAPI.notionOAuthDatabases()
      if (result.success && result.databases) {
        setDatabases(result.databases)
      } else if (result.code === 'token_expired') {
        setDbError(result.error || t('授权已失效，请重新连接'))
      } else {
        setDbError(result.error || t('数据库列表加载失败'))
      }
    } catch {
      setDbError(t('数据库列表加载失败'))
    } finally {
      setDbLoading(false)
    }
  }

  /** 连接后轮询状态直到 connected / 超时（notion:oauthStatus 事件也会即时更新） */
  function startPoll() {
    stopPoll()
    const startedAt = Date.now()
    pollTimer.current = setInterval(() => {
      void (async () => {
        const info = await window.electronAPI.notionOAuthStatus().catch(() => null)
        if (!info) return
        setStatusInfo(info)
        if (info.connected) {
          stopPoll()
          setConnecting(false)
          await loadDatabases()
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
      .notionOAuthStatus()
      .then(info => {
        if (cancelled) return
        setStatusInfo(info)
        if (info.connected) void loadDatabases()
      })
      .catch(() => {})
    const off = window.electronAPI.onNotionOAuthStatus(info => {
      if (cancelled) return
      setStatusInfo(info)
      if (info.connected) void loadDatabases()
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
    setDbError(null)
    try {
      // 本地固定端口回调（localhost:47840），须在 Public integration 的 Redirect URI 登记
      const result = await window.electronAPI.notionOAuthStart({ useLocalCallback: true })
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
    setDbError(null)
    try {
      const info = await window.electronAPI.notionOAuthDisconnect()
      setStatusInfo(info)
      setDatabases([])
      stopPoll()
    } catch {
      setActionError(t('断开失败'))
    } finally {
      setDisconnecting(false)
    }
  }

  async function handleSelectDatabase(databaseId: string) {
    if (!databaseId) return
    setDbError(null)
    try {
      const result = await window.electronAPI.notionOAuthSelectDb(databaseId)
      if (!result.success) {
        setDbError(result.error || t('选择数据库失败'))
        return
      }
      const info = await window.electronAPI.notionOAuthStatus().catch(() => null)
      if (info) setStatusInfo(info)
    } catch {
      setDbError(t('选择数据库失败'))
    }
  }

  const configured = statusInfo?.configured ?? false
  const connected = statusInfo?.connected ?? false

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
        ) : connected ? (
          <span className="settings-test-result--success">✓ {t('已连接 Notion')}</span>
        ) : (
          <span className="settings-test-result--muted">{t('尚未连接')}</span>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="settings-browse-button"
            disabled={!configured || connecting || connected}
            style={{ opacity: !configured || connecting || connected ? 0.6 : 1 }}
            onClick={handleConnect}
          >
            {!configured
              ? t('连接 Notion（未配置）')
              : connecting
                ? t('等待授权…')
                : connected
                  ? t('重新连接')
                  : t('连接 Notion')}
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

      {/* 目标数据库下拉：连接后显示（notion:oauthDatabases） */}
      {connected && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="settings-field-label" style={{ marginBottom: 0 }}>
            {t('目标数据库')}
          </div>
          <select
            className="settings-input"
            style={{ flex: 1, minWidth: 200 }}
            value={statusInfo?.databaseId || ''}
            onChange={e => handleSelectDatabase(e.target.value)}
            disabled={dbLoading}
          >
            <option value="">{dbLoading ? t('加载数据库…') : t('选择数据库…')}</option>
            {databases.map(d => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
          <button
            className="settings-link-button"
            onClick={() => loadDatabases()}
            disabled={dbLoading}
          >
            {t('刷新列表')}
          </button>
        </div>
      )}

      {dbError && (
        <span className="settings-test-result--error" style={{ display: 'block', marginTop: 8 }}>
          ✗ {dbError}
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
            '先在下方「高级模式」粘贴 Notion Token 并保存，或在「OAuth 连接服务配置」填写 Public integration 的 Client ID/Secret 后保存，本按钮即变为「连接 Notion」。',
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
              {NOTION_OAUTH_REDIRECT_URI}
            </code>
            <button
              className="settings-link-button"
              onClick={() => {
                navigator.clipboard.writeText(NOTION_OAUTH_REDIRECT_URI)
                alert(t('已复制回调地址'))
              }}
            >
              {t('复制')}
            </button>
          </div>
          <p className="settings-hint" style={{ marginTop: 4 }}>
            {t(
              '首次使用需把上方地址添加到 Notion Public integration 的 OAuth 配置 → Redirect URI（只需一次），否则授权页会提示重定向地址不合法。',
            )}
          </p>
        </>
      )}
      <p className="settings-hint" style={{ marginTop: 8 }}>
        {t(
          '点击「连接 Notion」后浏览器将打开授权页，登录并勾选可访问页面后自动回到本页，再选择导出目标数据库，无需手动复制 Token。',
        )}
      </p>
    </div>
  )
}
