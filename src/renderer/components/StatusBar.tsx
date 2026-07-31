import { Wifi, WifiOff, Radio, RadioOff } from 'lucide-react'
import { FeishuStatus } from '@shared/types'

interface Props {
  status: FeishuStatus
}

export default function StatusBar({ status }: Props) {
  return (
    <div className="status-bar">
      <div
        className={`statusbar-pill ${status.connected ? 'statusbar-pill--active' : 'statusbar-pill--error'}`}
      >
        {status.connected ? <Wifi size={12} /> : <WifiOff size={12} />}
        {status.connected ? '飞书已连接' : '飞书未连接'}
      </div>
      <div
        className={`statusbar-pill ${status.monitoring ? 'statusbar-pill--active' : 'statusbar-pill--muted'}`}
      >
        {status.monitoring ? <Radio size={12} /> : <RadioOff size={12} />}
        {status.monitoring ? '监听运行中' : '监听未启动'}
      </div>
      <span className="status-bar__meta statusbar-meta">30s 轮询 · Obsidian: 小宇宙播客</span>
    </div>
  )
}
