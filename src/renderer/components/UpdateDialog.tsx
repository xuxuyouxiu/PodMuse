import { createPortal } from 'react-dom'
import { Download, RefreshCw, RotateCw, ExternalLink, Loader2, Check, X } from 'lucide-react'
import { useI18n } from '../i18n'

interface Props {
  state: UpdaterState
  currentVersion: string
  onClose: () => void
  onDownload: () => void
  onInstall: () => void
  onManualCheck: () => void
}

/**
 * 更新面板（模态）— 版本号点击打开
 */
export default function UpdateDialog({
  state,
  currentVersion,
  onClose,
  onDownload,
  onInstall,
  onManualCheck,
}: Props) {
  const { t } = useI18n()
  const releasesUrl = 'https://github.com/xuxuyouxiu/PodMuse/releases'

  const renderBody = () => {
    switch (state.phase) {
      case 'idle':
        return (
          <>
            <div className="update-dialog__status">
              <Check size={14} />
              <span>
                {t('当前已是最新版本')}（v{currentVersion}）
              </span>
            </div>
            <button className="update-dialog__btn" onClick={onManualCheck}>
              <RefreshCw size={13} />
              {t('立即检查更新')}
            </button>
          </>
        )
      case 'checking':
        return (
          <div className="update-dialog__status">
            <Loader2 size={14} className="note-preview__spin" />
            <span>{t('检查更新中...')}</span>
          </div>
        )
      case 'available':
        return (
          <>
            <div className="update-dialog__status">
              <Download size={14} />
              <span>
                {t('发现新版本')} v{state.version}（{t('当前版本')} v{currentVersion}）
              </span>
            </div>
            <div className="update-dialog__actions">
              <button className="update-dialog__btn" onClick={onDownload}>
                <Download size={13} />
                {t('下载更新')}
              </button>
              <button
                className="update-dialog__link"
                onClick={() => window.electronAPI.openExternal(releasesUrl)}
              >
                {t('更新日志')}
                <ExternalLink size={11} />
              </button>
            </div>
          </>
        )
      case 'downloading':
        return (
          <>
            <div className="update-dialog__status">
              <Loader2 size={14} className="note-preview__spin" />
              <span>
                {t('下载中...')}（{state.percent ?? 0}%）
              </span>
            </div>
            <div className="update-dialog__progress">
              <div className="update-dialog__progress-bar" style={{ width: `${state.percent ?? 0}%` }} />
            </div>
          </>
        )
      case 'downloaded':
        return (
          <>
            <div className="update-dialog__status">
              <Check size={14} />
              <span>
                {t('更新已就绪')} v{state.version}
              </span>
            </div>
            <div className="update-dialog__actions">
              <button className="update-dialog__btn" onClick={onInstall}>
                <RotateCw size={13} />
                {t('重启并安装')}
              </button>
            </div>
          </>
        )
      case 'error':
        return (
          <>
            <div className="update-dialog__status update-dialog__status--error">
              <X size={14} />
              <span>{t('更新失败')}</span>
            </div>
            {state.error && <div className="update-dialog__error">{state.error}</div>}
            <div className="update-dialog__actions">
              <button
                className="update-dialog__btn"
                onClick={() => window.electronAPI.openExternal(releasesUrl)}
              >
                <ExternalLink size={13} />
                {t('手动下载')}
              </button>
              <button className="update-dialog__btn update-dialog__btn--ghost" onClick={onManualCheck}>
                <RefreshCw size={13} />
                {t('重试')}
              </button>
            </div>
          </>
        )
      default:
        return null
    }
  }

  return createPortal(
    <div className="update-dialog-mask" onClick={onClose}>
      <div className="update-dialog" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="update-dialog__head">
          <div className="update-dialog__title">{t('软件更新')}</div>
          <button className="update-dialog__close" onClick={onClose} title={t('关闭')}>
            <X size={14} />
          </button>
        </div>
        <div className="update-dialog__body">{renderBody()}</div>
      </div>
    </div>,
    document.body,
  )
}
