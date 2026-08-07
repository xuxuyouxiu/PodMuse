import { useState, useEffect } from 'react'
import { ExternalLink } from 'lucide-react'

interface Props {
  onClose: () => void
}

export default function AboutDialog({ onClose }: Props) {
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    window.electronAPI.getAppVersion().then(setVersion)
  }, [])

  return (
    <div onClick={onClose} className="settings-dialog-overlay">
      <div onClick={e => e.stopPropagation()} className="settings-dialog about-dialog-card">
        {/* Logo */}
        <img src="./icon.png" alt="PodMuse" className="about-dialog-logo" />

        {/* 名称与版本 */}
        <div className="about-dialog-name-block">
          <div className="about-dialog-name">PodMuse</div>
          <div className="about-dialog-version">v{version || '...'}</div>
        </div>

        {/* 描述 */}
        <div className="about-dialog-desc">
          小宇宙播客 → 下载音频 → Whisper 语音转写
          <br />→ DeepSeek 修正专有名词 → AI 提炼笔记 → Obsidian
        </div>

        {/* 技术栈 */}
        <div className="about-dialog-tags">
          {['Electron', 'React', 'TypeScript', 'DeepSeek AI', 'Whisper', '飞书', 'Obsidian'].map(
            tag => (
              <span key={tag} className="about-dialog-tag">
                {tag}
              </span>
            ),
          )}
        </div>

        {/* 分隔线 */}
        <div className="about-dialog-divider" />

        {/* 链接 */}
        <div className="about-dialog-links">
          <InfoRow
            label="项目地址"
            value={
              <a
                href="#"
                onClick={e => {
                  e.preventDefault()
                  window.electronAPI.openExternal('https://github.com/xuxuyouxiu/PodMuse')
                }}
                className="about-dialog-link"
              >
                GitHub 仓库 <ExternalLink size={12} />
              </a>
            }
          />
          <InfoRow
            label="问题反馈"
            value={
              <a
                href="#"
                onClick={e => {
                  e.preventDefault()
                  window.electronAPI.openExternal(
                    'https://github.com/xuxuyouxiu/PodMuse/issues',
                  )
                }}
                className="about-dialog-link about-dialog-link--inline"
              >
                提交 Issue <ExternalLink size={12} />
              </a>
            }
          />
          <InfoRow label="许可证" value="MIT License" />
        </div>

        {/* 关闭按钮 */}
        <button onClick={onClose} className="settings-save-button about-dialog-close-btn">
          关闭
        </button>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="about-dialog-info-row">
      <span className="about-dialog-info-label">{label}</span>
      <span className="about-dialog-info-value">{value}</span>
    </div>
  )
}
