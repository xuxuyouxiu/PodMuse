import { useState } from 'react'

interface Props {
  onProcess: (url: string) => Promise<{ success: boolean; error?: string }>
  disabled: boolean
}

export default function UrlInput({ onProcess, disabled }: Props) {
  const [url, setUrl] = useState('')

  const handleSubmit = () => {
    const trimmed = url.trim()
    if (!trimmed) return
    onProcess(trimmed)
  }

  return (
    <div className="url-input-card">
      <div className="url-input-copy">
        <div className="url-input-eyebrow">开始新任务</div>
        <h2 className="url-input-title">粘贴链接开始处理</h2>
        <p className="url-input-hint">支持小宇宙单集链接，按 Enter 也可以直接发起处理。</p>
      </div>
      <div className="url-input-actions">
        <input
          className="url-input-field"
          type="text"
          placeholder="粘贴小宇宙播客链接..."
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !disabled && handleSubmit()}
          disabled={disabled}
        />
        <button
          className="url-input-submit"
          onClick={handleSubmit}
          disabled={disabled}
        >
          ▶ 开始处理
        </button>
      </div>
    </div>
  )
}
