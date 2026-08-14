import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Coffee } from 'lucide-react'
import { useI18n } from '../i18n'

interface Props {
  onClose: () => void
}

/** 打赏弹窗：委婉文案 + 微信/支付宝收款码 */
export default function DonateDialog({ onClose }: Props) {
  const { t } = useI18n()

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  return createPortal(
    <div className="donate-mask" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="donate-dialog">
        <div className="donate-dialog__head">
          <div className="donate-dialog__title">
            <Coffee size={16} />
            {t('请我喝杯咖啡')}
          </div>
          <button className="donate-dialog__close" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="donate-dialog__text">{t('如果 PodMuse 帮你省下了时间，一杯咖啡就是最好的鼓励 ☕')}</div>
        <div className="donate-dialog__codes">
          <div className="donate-dialog__code">
            <img src="donate/wechat.png" alt="WeChat Pay" />
            <div className="donate-dialog__label">{t('微信支付')}</div>
          </div>
          <div className="donate-dialog__code">
            <img src="donate/alipay.jpg" alt="Alipay" />
            <div className="donate-dialog__label">{t('支付宝')}</div>
          </div>
        </div>
        <div className="donate-dialog__hint">{t('谢谢你的支持，我会继续把 PodMuse 做得更好')}</div>
      </div>
    </div>,
    document.body,
  )
}
