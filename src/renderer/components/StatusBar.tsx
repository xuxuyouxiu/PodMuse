import { FeishuStatus } from '../../../shared/types'

interface Props {
  status: FeishuStatus
}

export default function StatusBar({ status }: Props) {
  return (
    <div className="status-bar" style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      flexWrap: 'wrap',
      minWidth: 0,
    }}>
      <div style={getPillStyle(status.connected, true)}>
        <span style={getDotStyle(status.connected, true)} />
        {status.connected ? '飞书已连接' : '飞书未连接'}
      </div>
      <div style={getPillStyle(status.monitoring, false)}>
        <span style={getDotStyle(status.monitoring, false)} />
        {status.monitoring ? '监听运行中' : '监听未启动'}
      </div>
      <span className="status-bar__meta" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        30s 轮询 · Obsidian: 小宇宙播客
      </span>
      <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
    </div>
  )
}

function getPillStyle(active: boolean, useErrorWhenInactive: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 500,
    background: active
      ? 'rgba(0,210,160,0.1)'
      : useErrorWhenInactive
        ? 'rgba(248,64,96,0.08)'
        : 'rgba(108,112,134,0.08)',
    color: active
      ? 'var(--success)'
      : useErrorWhenInactive
        ? 'var(--error)'
        : 'var(--text-muted)',
    boxShadow: active ? '0 0 16px var(--success-glow)' : 'none',
    transition: 'all 0.4s',
    whiteSpace: 'nowrap',
  }
}

function getDotStyle(active: boolean, useErrorWhenInactive: boolean): React.CSSProperties {
  return {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: active
      ? 'var(--success)'
      : useErrorWhenInactive
        ? 'var(--error)'
        : 'var(--text-muted)',
    boxShadow: active ? '0 0 8px var(--success-glow)' : 'none',
    animation: active ? 'pulse 2s ease-in-out infinite' : 'none',
    flexShrink: 0,
  }
}
