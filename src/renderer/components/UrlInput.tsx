import { useState } from 'react'
import { motion } from 'motion/react'
import { Link, Play } from 'lucide-react'

interface Props {
  onProcess: (url: string, contentType: string) => Promise<{ success: boolean; error?: string }>
  disabled: boolean
  contentType: string
}

export default function UrlInput({ onProcess, disabled, contentType }: Props) {
  const [url, setUrl] = useState('')
  const [focused, setFocused] = useState(false)

  const handleSubmit = () => {
    const trimmed = url.trim()
    if (!trimmed) return
    onProcess(trimmed, contentType)
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
        <p className="url-input-hint">支持小宇宙单集链接，按 Enter 也可以直接发起处理。</p>
      </div>
      <div className="url-input-actions">
        <motion.div
          className="url-input-field-wrap"
          animate={{
            boxShadow: focused ? '0 0 0 2px var(--accent-glow)' : '0 0 0 0px transparent',
          }}
          transition={{ duration: 0.2 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: 1,
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            padding: '0 12px',
            background: 'var(--bg-card)',
            transition: 'border-color 0.2s',
            borderColor: focused ? 'var(--accent)' : 'var(--border)',
          }}
        >
          <Link size={14} style={{ opacity: 0.4, flexShrink: 0 }} />
          <input
            className="url-input-field"
            type="text"
            placeholder="粘贴小宇宙播客链接..."
            value={url}
            onChange={e => setUrl(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={e => e.key === 'Enter' && !disabled && handleSubmit()}
            disabled={disabled}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 13,
              fontFamily: 'inherit',
              padding: '10px 0',
            }}
          />
        </motion.div>
        <motion.button
          className="url-input-submit"
          onClick={handleSubmit}
          disabled={disabled}
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
