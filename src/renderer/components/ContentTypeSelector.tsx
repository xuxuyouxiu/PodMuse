import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { useI18n } from '../i18n'

interface Props {
  contentType: string
  onContentTypeChange: (type: string) => void
  disabled?: boolean
}

const CONTENT_TYPES = [
  { value: 'default', label: '默认', desc: '通用模式' },
  { value: 'news', label: '新闻资讯', desc: '简洁高效' },
  { value: 'article', label: '长文章/演讲', desc: '保留细节' },
  { value: 'tutorial', label: '教程/课程', desc: '保留细节' },
]

export default function ContentTypeSelector({
  contentType,
  onContentTypeChange,
  disabled = false,
}: Props) {
  const { t } = useI18n()
  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const currentType = CONTENT_TYPES.find(t => t.value === contentType) || CONTENT_TYPES[0]

  const updateMenuPosition = useCallback(() => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setMenuPos({
        top: rect.bottom + 8,
        left: rect.left,
      })
    }
  }, [])

  const handleToggle = useCallback(() => {
    if (!showMenu) {
      updateMenuPosition()
    }
    setShowMenu(!showMenu)
  }, [showMenu, updateMenuPosition])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setShowMenu(false)
      }
    }
    const handleScroll = () => {
      if (showMenu) {
        updateMenuPosition()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [showMenu, updateMenuPosition])

  const menuContent = (
    <AnimatePresence>
      {showMenu && (
        <motion.div
          ref={menuRef}
          className="content-type-menu"
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
          }}
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={{ duration: 0.15 }}
        >
          {CONTENT_TYPES.map(type => (
            <button
              key={type.value}
              className={`content-type-option ${contentType === type.value ? 'active' : ''}`}
              onClick={() => {
                onContentTypeChange(type.value)
                setShowMenu(false)
              }}
            >
              <span className="type-option-label">{t(type.label)}</span>
              <span className="type-option-desc">{t(type.desc)}</span>
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <div className="content-type-selector">
      <motion.button
        ref={btnRef}
        className="content-type-btn"
        onClick={handleToggle}
        disabled={disabled}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <span className="content-type-label">{t(currentType.label)}</span>
        <ChevronDown size={14} className={`content-type-arrow ${showMenu ? 'open' : ''}`} />
      </motion.button>
      {createPortal(menuContent, document.body)}
    </div>
  )
}
