interface Props {
  processing: boolean
  cancelling: boolean
  paused: boolean
  onCancel: () => void
  onResume: () => void
}

const SPINNER_HTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:ctrlspin 0.8s linear infinite;vertical-align:middle;margin-right:6px"></span>'

export default function ControlBar({ processing, cancelling, paused, onCancel, onResume }: Props) {
  const visible = processing || cancelling || paused
  const primaryLabel = cancelling ? undefined : paused ? '继续处理' : '停止处理'

  if (!visible) return null

  return (
    <div className="control-bar">
      <div className="control-bar-group">
        <button
          className="control-bar-primary"
          onClick={!visible ? undefined : cancelling ? undefined : paused ? onResume : onCancel}
          disabled={cancelling || !visible}
          style={{
            visibility: visible ? 'visible' : 'hidden',
            pointerEvents: visible ? 'auto' : 'none',
          }}
          dangerouslySetInnerHTML={cancelling ? { __html: SPINNER_HTML + '停止中…' } : undefined}
        >
          {primaryLabel}
        </button>
      </div>
      <style>{`@keyframes ctrlspin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
