import { Wifi, WifiOff, Radio, RadioOff } from 'lucide-react'
import { FeishuStatus } from '@shared/types'
import { useI18n } from '../i18n'

interface Props {
  status: FeishuStatus
}

export default function StatusBar({ status }: Props) {
  const { t } = useI18n()
  return (
    <div className="status-bar">
      <div
        className={`statusbar-pill ${status.connected ? 'statusbar-pill--active' : 'statusbar-pill--error'}`}
      >
        {status.connected ? <Wifi size={12} /> : <WifiOff size={12} />}
        {status.connected ? t('飞书已连接') : t('飞书未连接')}
      </div>
      <div
        className={`statusbar-pill ${status.monitoring ? 'statusbar-pill--active' : 'statusbar-pill--muted'}`}
      >
        {status.monitoring ? <Radio size={12} /> : <RadioOff size={12} />}
        {status.monitoring ? t('监听运行中') : t('监听未启动')}
      </div>
    </div>
  )
}
