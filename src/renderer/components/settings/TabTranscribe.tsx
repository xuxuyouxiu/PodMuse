import { useState } from 'react'
import { PodcastConfig } from '@shared/types'
import { TabHeader, DirField } from './FieldComponents'
import { useI18n } from '../../i18n'
import GuideCarousel from '../GuideCarousel'

export default function TabTranscribe({
  form,
  update,
  onBrowse,
  onToast,
}: {
  form: PodcastConfig
  update: (key: keyof PodcastConfig, value: string | boolean) => void
  onBrowse: (key: 'obsidian_dir' | 'audio_dir' | 'whisper_exe_path') => void
  onToast: (message: string, type?: 'success' | 'error') => void
}) {
  const { t } = useI18n()
  const [guide, setGuide] = useState<string | null>(null)
  const [creatingDirs, setCreatingDirs] = useState(false)

  // 两个目录都空或仅缺其一时可点；都已配置则无需默认目录
  const canCreateDefaultDirs = !form.obsidian_dir.trim() || !form.audio_dir.trim()

  // 一键创建默认目录：文档/PodMuse笔记 + 下载/PodMuse音频（主进程创建并写回空字段）
  async function handleCreateDefaultDirs() {
    if (!canCreateDefaultDirs || creatingDirs) return
    setCreatingDirs(true)
    try {
      const result = await window.electronAPI.createDefaultDirs()
      if (result.error) throw new Error(result.error)
      update('obsidian_dir', result.obsidian_dir)
      update('audio_dir', result.audio_dir)
      onToast(t('已创建默认目录并填入'))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      onToast(t('创建默认目录失败') + (msg ? '：' + msg : ''), 'error')
    } finally {
      setCreatingDirs(false)
    }
  }

  return (
    <div>
      <TabHeader title={t('转写偏好')} subtitle={t('设置语音识别语言和文件存储位置')} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <button type="button" className="settings-link-button" onClick={() => setGuide('dirs')}>
          {t('怎么选笔记目录？看图文')}
        </button>
      </div>
      <div className="settings-grid">
        <div className="settings-field">
          <div className="settings-field-label">{t('语音识别语言')}</div>
          <div className="settings-radio-grid">
            {(
              [
                { val: 'zh', label: t('中文') },
                { val: 'en', label: t('英文') },
                { val: 'auto', label: t('自动检测 (中英混合)') },
              ] as const
            ).map(({ val, label }) => (
              <label key={val} className="settings-radio">
                <input
                  type="radio"
                  name="lang"
                  value={val}
                  checked={form.language === val}
                  onChange={() => update('language', val)}
                  style={{ accentColor: 'var(--accent)' }}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <DirField
          label={t('Obsidian 笔记目录')}
          value={form.obsidian_dir}
          onBrowse={() => onBrowse('obsidian_dir')}
        />
        <DirField
          label={t('音频缓存目录')}
          value={form.audio_dir}
          placeholder={t('默认（用户数据目录）')}
          onBrowse={() => onBrowse('audio_dir')}
        />
      </div>
      {canCreateDefaultDirs && (
        <div className="settings-dir-row" style={{ marginTop: 12, alignItems: 'center' }}>
          <button
            type="button"
            className="settings-browse-button"
            onClick={handleCreateDefaultDirs}
            disabled={creatingDirs}
            style={{ opacity: creatingDirs ? 0.6 : 1 }}
          >
            {creatingDirs ? t('创建中…') : t('一键使用默认目录')}
          </button>
          <span className="settings-hint">{t('默认目录：文档/PodMuse笔记、下载/PodMuse音频')}</span>
        </div>
      )}
      {guide && <GuideCarousel guideKey={guide} onClose={() => setGuide(null)} />}
    </div>
  )
}
