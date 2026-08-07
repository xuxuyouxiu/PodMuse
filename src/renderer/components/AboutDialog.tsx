import { useState, useEffect } from 'react'
import { ExternalLink, Star, MessageSquare, FileText } from 'lucide-react'
import { useI18n } from '../i18n'

interface Props {
  onClose: () => void
}

export default function AboutDialog({ onClose }: Props) {
  const { t } = useI18n()
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    window.electronAPI.getAppVersion().then(setVersion)
  }, [])

  const features = [
    { icon: <MessageSquare size={13} />, text: t('多平台支持：小宇宙、B站、YouTube、喜马拉雅、Apple Podcasts、抖音') },
    { icon: <FileText size={13} />, text: t('AI 自动转写：Whisper 本地语音识别，无需上传云端') },
    { icon: <Star size={13} />, text: t('AI 笔记生成：核心观点、关键对话、术语词典、金句摘录') },
    { icon: <ExternalLink size={13} />, text: t('自动实体卡片与双向链接，构建 Obsidian 知识网络') },
  ]

  return (
    <div onClick={onClose} className="settings-dialog-overlay">
      <div onClick={e => e.stopPropagation()} className="settings-dialog about-dialog-card">
        {/* Logo */}
        <img src="./icon.png" alt="PodMuse" className="about-dialog-logo" />

        {/* 名称与版本 */}
        <div className="about-dialog-name-block">
          <div className="about-dialog-name">PodMuse 播客笔记助手</div>
          <div className="about-dialog-version">
            v{version || '...'} · {t('把播客变成知识库')}
          </div>
        </div>

        {/* 流程描述 */}
        <div className="about-dialog-desc">
          {t('粘贴任意播客/视频链接，自动完成提取、下载、转写、校对和笔记整理，并写入 Obsidian 知识库。')}
        </div>

        {/* 功能特性 */}
        <div className="about-dialog-features">
          {features.map((f, i) => (
            <div key={i} className="about-dialog-feature">
              <span className="about-dialog-feature-icon">{f.icon}</span>
              <span>{f.text}</span>
            </div>
          ))}
        </div>

        {/* 技术栈 */}
        <div className="about-dialog-tags">
          {['Electron', 'React', 'TypeScript', 'Whisper', 'DeepSeek', 'Obsidian', t('飞书'), t('抖音')].map(
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
            label={t('项目地址')}
            value={
              <a
                href="#"
                onClick={e => {
                  e.preventDefault()
                  window.electronAPI.openExternal('https://github.com/xuxuyouxiu/PodMuse')
                }}
                className="about-dialog-link"
              >
                {t('GitHub 仓库')} <ExternalLink size={12} />
              </a>
            }
          />
          <InfoRow
            label={t('问题反馈')}
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
                {t('提交 Issue')} <ExternalLink size={12} />
              </a>
            }
          />
          <InfoRow label={t('许可证')} value="MIT License" />
        </div>

        {/* 关闭按钮 */}
        <button onClick={onClose} className="settings-save-button about-dialog-close-btn">
          {t('关闭')}
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
