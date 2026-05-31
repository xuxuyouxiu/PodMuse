import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { X, ExternalLink, Github } from 'lucide-react'

interface Props {
  onClose: () => void
}

export default function AboutDialog({ onClose }: Props) {
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    window.electronAPI.getAppVersion().then(setVersion)
  }, [])

  return (
    <div
      onClick={onClose}
      className="settings-dialog-overlay"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        animation: 'fadeIn 0.2s',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="settings-dialog"
        style={{
          width: 420,
          maxWidth: 'calc(100vw - 32px)',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          padding: 32,
          boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
          animation: 'modalSlide 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Logo */}
        <img
          src="./icon.png"
          alt="播客笔记助手"
          style={{ width: 72, height: 72, borderRadius: 16, objectFit: 'cover' }}
        />

        {/* 名称与版本 */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
            播客笔记助手
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            v{version || '...'}
          </div>
        </div>

        {/* 描述 */}
        <div style={{
          fontSize: 13, color: 'var(--text-secondary)',
          textAlign: 'center', lineHeight: 1.7,
        }}>
          小宇宙播客 → 下载音频 → Whisper 语音转写
          <br />
          → DeepSeek 修正专有名词 → AI 提炼笔记 → Obsidian
        </div>

        {/* 技术栈 */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 6,
        }}>
          {['Electron', 'React', 'TypeScript', 'DeepSeek AI', 'Whisper', '飞书', 'Obsidian'].map(tag => (
            <span key={tag} style={{
              fontSize: 11, padding: '3px 10px', borderRadius: 999,
              background: 'var(--bg-card)', color: 'var(--text-muted)',
              border: '1px solid var(--border-light)',
            }}>
              {tag}
            </span>
          ))}
        </div>

        {/* 分隔线 */}
        <div style={{
          width: '100%', height: 1,
          background: 'var(--border-light)', margin: '4px 0',
        }} />

        {/* 链接 */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10, width: '100%',
        }}>
          <InfoRow label="项目地址" value={
            <a
              href="https://github.com/anthropics/claude-code"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent)', textDecoration: 'none' }}
            >
              GitHub 仓库 <ExternalLink size={12} />
            </a>
          } />
          <InfoRow label="问题反馈" value={
            <a
              href="https://github.com/anthropics/claude-code/issues"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              提交 Issue <ExternalLink size={12} />
            </a>
          } />
          <InfoRow label="许可证" value="MIT License" />
        </div>

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="settings-save-button"
          style={{ marginTop: 8, minWidth: 100 }}
        >
          关闭
        </button>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes modalSlide { from { opacity:0; transform: translateY(20px) scale(0.96); } to { opacity:1; transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      fontSize: 13, padding: '0 4px',
    }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--text-secondary)' }}>{value}</span>
    </div>
  )
}