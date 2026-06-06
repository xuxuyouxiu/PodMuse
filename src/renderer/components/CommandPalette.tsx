import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Sun, Moon, Settings, Info, Zap, Play, Trash2,
  FileText, Headphones, Keyboard,
} from 'lucide-react'

export interface Command {
  id: string
  label: string
  hint?: string
  icon: React.ReactNode
  action: () => void
  keywords?: string
}

interface Props {
  commands: Command[]
  open: boolean
  onClose: () => void
}

function PalettePanel({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = query.trim()
    ? commands.filter(cmd => {
        const q = query.toLowerCase()
        return (
          cmd.label.toLowerCase().includes(q) ||
          (cmd.hint || '').toLowerCase().includes(q) ||
          (cmd.keywords || '').toLowerCase().includes(q)
        )
      })
    : commands

  // Autofocus on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Keep selected item in view
  useEffect(() => {
    if (!listRef.current) return
    const items = listRef.current.querySelectorAll('.cmd-item')
    const el = items[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action()
        onClose()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }, [filtered, selectedIndex, onClose])

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-modal" onClick={e => e.stopPropagation()}>
        <div className="cmd-input-wrap">
          <Keyboard size={14} className="cmd-input-icon" />
          <input
            ref={inputRef}
            className="cmd-input"
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={handleKeyDown}
            placeholder="输入命令..."
          />
          <kbd className="cmd-esc-hint">ESC</kbd>
        </div>
        <div className="cmd-list" ref={listRef}>
          {filtered.length === 0 && (
            <div className="cmd-empty">没有匹配的命令</div>
          )}
          {filtered.map((cmd, i) => (
            <div
              key={cmd.id}
              className={`cmd-item ${i === selectedIndex ? 'is-selected' : ''}`}
              onClick={() => { cmd.action(); onClose() }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="cmd-item-icon">{cmd.icon}</span>
              <span className="cmd-item-label">{cmd.label}</span>
              {cmd.hint && <span className="cmd-item-hint">{cmd.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function CommandPalette({ commands, open, onClose }: Props) {
  if (!open) return null
  return <PalettePanel key="palette" commands={commands} onClose={onClose} />
}

/* ---- Reusable command definitions factory ---- */
export function useAppCommands(opts: {
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onOpenSettings: () => void
  onOpenAbout: () => void
  processing: boolean
  onResumeLast: () => void
  onCancel: () => void
}): Command[] {
  return [
    {
      id: 'toggle-theme',
      label: opts.theme === 'dark' ? '切换到浅色模式' : '切换到深色模式',
      hint: '外观',
      icon: opts.theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />,
      action: opts.onToggleTheme,
      keywords: 'theme light dark 主题 浅色 深色',
    },
    {
      id: 'open-settings',
      label: '打开设置',
      hint: '配置',
      icon: <Settings size={15} />,
      action: opts.onOpenSettings,
      keywords: 'settings config 设置 配置',
    },
    {
      id: 'open-about',
      label: '关于',
      hint: '版本信息',
      icon: <Info size={15} />,
      action: opts.onOpenAbout,
      keywords: 'about version 关于 版本',
    },
    {
      id: 'new-task',
      label: '开始新任务',
      hint: '粘贴链接',
      icon: <Zap size={15} />,
      action: () => {
        const input = document.querySelector<HTMLInputElement>('.url-input-field')
        input?.focus()
      },
      keywords: 'new task url 新任务 链接',
    },
    {
      id: 'resume-last',
      label: '恢复上次任务',
      hint: opts.processing ? '处理中' : '待命',
      icon: <Play size={15} />,
      action: opts.onResumeLast,
      keywords: 'resume continue 恢复 继续',
    },
    {
      id: 'cancel-current',
      label: '取消当前任务',
      hint: opts.processing ? '处理中' : '无任务',
      icon: <Trash2 size={15} />,
      action: opts.onCancel,
      keywords: 'cancel stop abort 取消 停止',
    },
    {
      id: 'open-docs',
      label: '查看使用文档',
      hint: '在线',
      icon: <FileText size={15} />,
      action: () => window.electronAPI?.openPath('https://github.com/xuxuyouxiu/Podcast_notes'),
      keywords: 'docs help 文档 帮助',
    },
    {
      id: 'focus-search',
      label: '搜索笔记',
      hint: 'Ctrl+K',
      icon: <Headphones size={15} />,
      action: () => {
        const input = document.querySelector<HTMLInputElement>('.topbar-search-input')
        input?.focus()
      },
      keywords: 'search notes 搜索 笔记',
    },
  ]
}
