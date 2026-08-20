import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight, ExternalLink, CheckCircle2 } from 'lucide-react'
import { resolveGuide, toAssetSrc } from '../data/onboarding-manifest'
import { useI18n } from '../i18n'

interface Props {
  /** manifest 中的指南 key（如 'ai-key' / 'feishu' / 'notion' / 'whisper' / 'douyin' / 'dirs'） */
  guideKey: string
  onClose: () => void
}

/**
 * 图文指南轮播弹层 —— 设置页各区块「看图文」入口的通用组件。
 * createPortal 挂到 document.body，绕开 motion.div transform 祖先导致 fixed 失效的问题。
 * 截图缺失或加载失败时优雅降级为占位卡（大号步骤序号 + 文案），离线仍可读。
 */
export default function GuideCarousel({ guideKey, onClose }: Props) {
  const { t } = useI18n()
  const guide = resolveGuide(guideKey)

  const [stepIndex, setStepIndex] = useState(0)
  const [imgFailed, setImgFailed] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 阻止滚轮穿透：弹窗内滚动到边界（或非滚动区域）时拦截 wheel，下层不再跟着滚
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const target = e.target as Element | null
      if (!target || !target.closest('.guide-carousel')) return
      const scroller = target.closest('.guide-carousel__body') as HTMLElement | null
      if (scroller) {
        const atTop = scroller.scrollTop <= 0
        const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
        if ((e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom)) e.preventDefault()
        return
      }
      e.preventDefault()
    }
    document.addEventListener('wheel', onWheel, { passive: false })
    return () => document.removeEventListener('wheel', onWheel)
  }, [])

  function goTo(i: number) {
    setStepIndex(i)
    setImgFailed(false)
    setOpenError(null)
  }

  async function handleOpenExternal() {
    if (!guide?.actionUrl) return
    setOpenError(null)
    try {
      const ok = await window.electronAPI.openExternal(guide.actionUrl)
      if (!ok) setOpenError(t('无法打开浏览器，请检查网络后重试'))
    } catch {
      setOpenError(t('无法打开浏览器，请检查网络后重试'))
    }
  }

  // 数据缺失兜底：guide 不存在或步骤为空时显示空态，避免白屏
  if (!guide || guide.steps.length === 0) {
    return createPortal(
      <div
        className="guide-carousel-overlay"
        onClick={e => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div className="guide-carousel">
          <div className="guide-carousel__header">
            <span className="guide-carousel__title">{t('图文指南')}</span>
            <div className="guide-carousel__header-side">
              <button className="guide-carousel__close" onClick={onClose} aria-label={t('关闭')}>
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="guide-carousel__body guide-carousel__body--empty">
            {t('未找到该指南内容')}
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  const steps = guide.steps
  const total = steps.length
  const step = steps[stepIndex]
  const stepNo = stepIndex + 1
  const showImage = Boolean(step.image) && !imgFailed

  return createPortal(
    <div
      className="guide-carousel-overlay"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="guide-carousel">
        <div className="guide-carousel__header">
          <span className="guide-carousel__title">{t(guide.title)}</span>
          <div className="guide-carousel__header-side">
            <span className="guide-carousel__indicator">
              {t('步骤')} {stepNo}/{total}
            </span>
            <button className="guide-carousel__close" onClick={onClose} aria-label={t('关闭')}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="guide-carousel__body">
          {/* 步骤指示圆点 */}
          <div className="guide-carousel__dots">
            {steps.map((s, i) => (
              <button
                key={i}
                className={`guide-carousel__dot${i === stepIndex ? ' is-active' : ''}`}
                onClick={() => goTo(i)}
                aria-label={t('步骤') + ' ' + (i + 1)}
              />
            ))}
          </div>

          {/* 内容区：截图存在且加载成功显示图片，否则显示占位卡（大号步骤序号 + 文案） */}
          {showImage ? (
            <img
              className="guide-carousel__image"
              src={toAssetSrc(step.image!)}
              alt={step.caption}
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="guide-carousel__placeholder">
              <span className="guide-carousel__placeholder-number">{stepNo}</span>
              <span className="guide-carousel__placeholder-caption">{t(step.caption)}</span>
            </div>
          )}
          {showImage && (
            <div className="guide-carousel__caption">
              <span className="guide-carousel__caption-number">{stepNo}.</span>
              {t(step.caption)}
            </div>
          )}
        </div>

        <div className="guide-carousel__footer">
          <div className="guide-carousel__nav">
            <button
              className="guide-carousel__nav-btn"
              onClick={() => goTo(Math.max(0, stepIndex - 1))}
              disabled={stepIndex === 0}
            >
              <ChevronLeft size={13} />
              {t('上一步')}
            </button>
            <button
              className="guide-carousel__nav-btn"
              onClick={() => goTo(Math.min(total - 1, stepIndex + 1))}
              disabled={stepIndex >= total - 1}
            >
              {t('下一步')}
              <ChevronRight size={13} />
            </button>
          </div>
          <div className="guide-carousel__actions">
            {openError && <span className="guide-carousel__error">{openError}</span>}
            {guide.actionUrl && (
              <button className="guide-carousel__action-btn" onClick={handleOpenExternal}>
                {t('去操作')}
                <ExternalLink size={13} />
              </button>
            )}
            <button className="guide-carousel__done-btn" onClick={onClose}>
              <CheckCircle2 size={13} />
              {t('我已按步骤操作')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
