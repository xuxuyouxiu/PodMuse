import { useState, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Link, Play, HelpCircle, X, Radio, MonitorPlay, PlayCircle, Headphones, Podcast, Music } from 'lucide-react'

interface Props {
  onProcess: (url: string) => Promise<{ success: boolean; error?: string }>
  disabled: boolean
}

const PLATFORMS = [
  { label: '小宇宙', desc: 'xiaoyuzhoufm.com 单集链接' },
  { label: 'B 站', desc: 'bilibili.com 视频或 b23.tv 短链' },
  { label: 'YouTube', desc: 'youtube.com 视频或 youtu.be 短链' },
  { label: '喜马拉雅', desc: 'ximalaya.com 单集音频' },
  { label: 'Apple Podcasts', desc: 'podcasts.apple.com 单集链接' },
  { label: '直链', desc: '任意 .mp3 / .mp4 / .m4a 等公开音频视频 URL' },
]

/** 客户端平台检测（与 main process 的 registry 模式保持一致） */
interface DetectedPlatform {
  id: string
  name: string
  icon: typeof Link
}

const PLATFORM_DETECTORS: Array<{ id: string; name: string; pattern: RegExp; icon: typeof Link }> = [
  { id: 'xiaoyuzhou', name: '小宇宙', pattern: /^https?:\/\/[^\s]*xiaoyuzhoufm\.com\//i, icon: Radio },
  { id: 'bilibili', name: 'B 站', pattern: /^https?:\/\/(www\.|m\.)?(bilibili\.com\/video\/|b23\.tv\/)/i, icon: MonitorPlay },
  { id: 'youtube', name: 'YouTube', pattern: /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch|embed|shorts)|youtu\.be\/)/i, icon: PlayCircle },
  { id: 'ximalaya', name: '喜马拉雅', pattern: /^https?:\/\/(www\.|m\.)?ximalaya\.com\/sound\//i, icon: Headphones },
  { id: 'apple-podcasts', name: 'Apple Podcasts', pattern: /^https?:\/\/podcasts\.apple\.com\/[a-z]{2}\/podcast\//i, icon: Podcast },
  { id: 'direct-url', name: '直链', pattern: /^https?:\/\/[^\s]+\.(mp3|mp4|m4a|wav|aac|ogg)(\?[^\s]*)?/i, icon: Music },
]

function detectPlatform(url: string): DetectedPlatform | null {
  const trimmed = url.trim()
  if (!trimmed || trimmed.length < 8) return null
  for (const p of PLATFORM_DETECTORS) {
    if (p.pattern.test(trimmed)) return { id: p.id, name: p.name, icon: p.icon }
  }
  return null
}

export default function UrlInput({ onProcess, disabled }: Props) {
  const [url, setUrl] = useState('')
  const [focused, setFocused] = useState(false)
  const [showTip, setShowTip] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // 实时检测平台（派生状态，无需 useEffect）
  const { detected, unsupported } = useMemo(() => {
    const trimmed = url.trim()
    if (!trimmed || trimmed.length < 8 || !/^https?:\/\//i.test(trimmed)) {
      return { detected: null, unsupported: false }
    }
    const result = detectPlatform(trimmed)
    return { detected: result, unsupported: !result }
  }, [url])

  const handleSubmit = () => {
    const trimmed = url.trim()
    if (!trimmed) return
    onProcess(trimmed)
  }

  const PlatformIcon = detected?.icon

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
          支持小宇宙、B 站、YouTube、喜马拉雅、Apple Podcasts 及直接音频链接，按 Enter 发起。
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
          {PlatformIcon ? (
            <PlatformIcon size={14} className="url-input-icon url-input-platform-icon" />
          ) : (
            <Link size={14} className="url-input-icon" />
          )}
          <input
            ref={inputRef}
            className="url-input-field"
            type="text"
            placeholder="支持小宇宙、B 站、YouTube、喜马拉雅、Apple Podcasts 及直接音频链接"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={e => e.key === 'Enter' && !disabled && handleSubmit()}
            disabled={disabled}
          />
          {detected && (
            <span className="url-input-badge" title={detected.name}>{detected.name}</span>
          )}
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

      {unsupported && focused && (
        <motion.p
          className="url-input-unsupported"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
        >
          暂不支持该平台，请使用本地文件方式
        </motion.p>
      )}
    </motion.div>
  )
}
