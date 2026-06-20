import { useCallback } from 'react'
import { motion } from 'motion/react'
import { X, Play, FileAudio, Link, GripVertical, AlertTriangle } from 'lucide-react'
import type { BatchInput } from '@shared/types'

interface Props {
  items: BatchInput[]
  onConfirm: () => void
  onCancel: () => void
  onRemoveItem: (index: number) => void
  onReorder: (from: number, to: number) => void
}

const PLATFORM_DETECTORS = [
  { name: '小宇宙', pattern: /xiaoyuzhoufm\.com/i },
  { name: 'B 站', pattern: /bilibili\.com|b23\.tv/i },
  { name: 'YouTube', pattern: /youtube\.com|youtu\.be/i },
  { name: '喜马拉雅', pattern: /ximalaya\.com/i },
  { name: 'Apple Podcasts', pattern: /podcasts\.apple\.com/i },
]

function detectPlatformLabel(item: BatchInput): string {
  if (item.type === 'file') {
    const ext = item.source.split('.').pop()?.toUpperCase() || ''
    return ext
  }
  for (const p of PLATFORM_DETECTORS) {
    if (p.pattern.test(item.source)) return p.name
  }
  return '直链'
}

function getDisplayName(item: BatchInput): string {
  if (item.type === 'file') {
    const parts = item.source.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] || item.source
  }
  if (item.source.length > 60) {
    return item.source.substring(0, 57) + '...'
  }
  return item.source
}

export default function BatchConfirmPanel({ items, onConfirm, onCancel, onRemoveItem, onReorder }: Props) {
  const fileCount = items.filter(i => i.type === 'file').length
  const urlCount = items.filter(i => i.type === 'url').length

  const moveUp = useCallback((index: number) => {
    if (index > 0) onReorder(index, index - 1)
  }, [onReorder])

  const moveDown = useCallback((index: number) => {
    if (index < items.length - 1) onReorder(index, index + 1)
  }, [onReorder, items.length])

  return (
    <motion.div
      className="batch-confirm-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3 }}
    >
      <div className="batch-confirm-header">
        <div>
          <div className="batch-confirm-eyebrow">批量处理</div>
          <h3 className="batch-confirm-title">
            确认处理 {items.length} 项
            {fileCount > 0 && <span className="batch-confirm-count">{fileCount} 个文件</span>}
            {urlCount > 0 && <span className="batch-confirm-count">{urlCount} 个链接</span>}
          </h3>
        </div>
        <button className="batch-confirm-cancel" onClick={onCancel} title="取消">
          <X size={16} />
        </button>
      </div>

      <div className="batch-confirm-list">
        {items.map((item, i) => {
          const platform = detectPlatformLabel(item)
          return (
            <div key={`${item.source}-${i}`} className="batch-confirm-item">
              <div className="batch-confirm-item-order">
                <button
                  className="batch-confirm-order-btn"
                  onClick={() => moveUp(i)}
                  disabled={i === 0}
                  title="上移"
                >
                  ▲
                </button>
                <span className="batch-confirm-index">{i + 1}</span>
                <button
                  className="batch-confirm-order-btn"
                  onClick={() => moveDown(i)}
                  disabled={i === items.length - 1}
                  title="下移"
                >
                  ▼
                </button>
              </div>
              <div className="batch-confirm-item-icon">
                {item.type === 'file' ? <FileAudio size={14} /> : <Link size={14} />}
              </div>
              <div className="batch-confirm-item-info">
                <span className="batch-confirm-item-name">{getDisplayName(item)}</span>
                <span className="batch-confirm-item-platform">{platform}</span>
              </div>
              <button
                className="batch-confirm-remove"
                onClick={() => onRemoveItem(i)}
                title="移除"
              >
                <X size={13} />
              </button>
            </div>
          )
        })}
      </div>

      <div className="batch-confirm-footer">
        <div className="batch-confirm-hint">
          <AlertTriangle size={13} />
          任务将按顺序逐个处理，单个失败不影响后续任务
        </div>
        <motion.button
          className="batch-confirm-start"
          onClick={onConfirm}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Play size={14} />
          开始批量处理
        </motion.button>
      </div>

      <style>{`
        .batch-confirm-panel {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          backdrop-filter: blur(20px);
        }

        .batch-confirm-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .batch-confirm-eyebrow {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--accent);
          margin-bottom: 4px;
        }

        .batch-confirm-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
        }

        .batch-confirm-count {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-muted);
          background: var(--bg-surface);
          padding: 2px 8px;
          border-radius: var(--radius-sm);
        }

        .batch-confirm-cancel {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          border-radius: var(--radius-sm);
        }
        .batch-confirm-cancel:hover {
          color: var(--text-secondary);
          background: var(--bg-surface);
        }

        .batch-confirm-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-height: 300px;
          overflow-y: auto;
        }

        .batch-confirm-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: var(--radius-sm);
          background: var(--bg-surface);
          transition: background 0.15s;
        }
        .batch-confirm-item:hover {
          background: var(--bg-elevated);
        }

        .batch-confirm-item-order {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1px;
          min-width: 24px;
        }

        .batch-confirm-order-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          font-size: 8px;
          padding: 0;
          line-height: 1;
        }
        .batch-confirm-order-btn:disabled {
          opacity: 0.3;
          cursor: default;
        }
        .batch-confirm-order-btn:not(:disabled):hover {
          color: var(--accent);
        }

        .batch-confirm-index {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
        }

        .batch-confirm-item-icon {
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .batch-confirm-item-info {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .batch-confirm-item-name {
          font-size: 13px;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .batch-confirm-item-platform {
          font-size: 10px;
          font-weight: 600;
          color: var(--accent);
          background: var(--accent-glow);
          padding: 1px 6px;
          border-radius: 4px;
          flex-shrink: 0;
        }

        .batch-confirm-remove {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .batch-confirm-item:hover .batch-confirm-remove {
          opacity: 1;
        }
        .batch-confirm-remove:hover {
          color: var(--error);
          background: rgba(239, 68, 68, 0.1);
        }

        .batch-confirm-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 8px;
          border-top: 1px solid var(--border);
        }

        .batch-confirm-hint {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-muted);
        }

        .batch-confirm-start {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 20px;
          background: var(--accent);
          color: white;
          border: none;
          border-radius: var(--radius-sm);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .batch-confirm-start:hover {
          opacity: 0.9;
        }
      `}</style>
    </motion.div>
  )
}
