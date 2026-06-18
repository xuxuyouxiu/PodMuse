import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Link, Play, HelpCircle, X } from 'lucide-react'

interface Props {
  onProcess: (url: string) => Promise<{ success: boolean; error?: string }>
  disabled: boolean
}

const PLATFORMS = [
  { label: '小宇宙', desc: 'xiaoyuzhoufm.com 单集链接' },
  { label: 'B 站', desc: 'bilibili.com 视频或 b23.tv 短链' },
  { label: 'YouTube', desc: 'youtube.com 视频或 youtu.be 短链' },
  { label: '直链', desc: '任意 .mp3 / .mp4 / .m4a 等公开音频视频 URL' },
]

export default function UrlInput({ onProcess, disabled }: Props) {
  const [url, setUrl] = useState('')
  const [focused, setFocused] = useState(false)
  const [showTip, setShowTip] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = () => {
    const trimmed = url.trim()
    if (!trimmed) return
    onProcess(trimmed)
  }

  return (
    <motion.div
      className="url-input-card"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="url-input-copy">
        <div className="url-input-eyebrow">开始新任务</div>
        <h2 className="url-input-title">粘贴链接开始处理</h2>
        <p className="url-input-hint">
          支持小宇宙、B 站、YouTube 和音视频直链，按 Enter 发起。
          <button
            className="url-input-tip-btn"
            onClick={() => setShowTip(v => !v)}
            title="查看支持的链接格式"
          >
            <HelpCircle size={13} />
          </button>
        </p>
      </div>

      <AnimatePresence>
        {showTip && (
          <motion.div
            className="url-input-tip-panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="url-input-tip-header">
              <span>支持的链接格式</span>
              <button className="url-input-tip-close" onClick={() => setShowTip(false)}>
                <X size={14} />
              </button>
            </div>
            <div className="url-input-tip-list">
              {PLATFORMS.map(p => (
                <div key={p.label} className="url-input-tip-item">
                  <span className="url-input-tip-label">{p.label}</span>
                  <span className="url-input-tip-desc">{p.desc}</span>
                </div>
              ))}
              <div className="url-input-tip-note">
                直链指任何能直接下载到音频/视频文件的公开 URL，如播客 RSS 音频链接、云盘公开下载链接等。
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="url-input-actions">
        <div
          className={`url-input-field-wrap ${focused ? 'is-focused' : ''}`}
          onClick={() => inputRef.current?.focus()}
        >
          <Link size={14} className="url-input-icon" />
          <input
            ref={inputRef}
            className="url-input-field"
            type="text"
            placeholder="粘贴播客、视频或音频链接..."
            value={url}
            onChange={e => setUrl(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={e => e.key === 'Enter' && !disabled && handleSubmit()}
            disabled={disabled}
          />
          {url && !disabled && (
            <button className="url-input-clear" onClick={() => setUrl('')} title="清空">
              <X size={13} />
            </button>
          )}
        </div>
        <motion.button
          className="url-input-submit"
          onClick={handleSubmit}
          disabled={disabled || !url.trim()}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Play size={14} />
          开始处理
        </motion.button>
      </div>
    </motion.div>
  )
}
