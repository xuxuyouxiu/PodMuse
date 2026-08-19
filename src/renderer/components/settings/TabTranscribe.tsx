import { useState } from 'react'
import { PodcastConfig } from '@shared/types'
import { TabHeader, DirField } from './FieldComponents'
import { useI18n } from '../../i18n'
import GuideCarousel from '../GuideCarousel'

export default function TabTranscribe({
  form,
  update,
  onBrowse,
}: {
  form: PodcastConfig
  update: (key: keyof PodcastConfig, value: string | boolean) => void
  onBrowse: (key: 'obsidian_dir' | 'audio_dir' | 'whisper_exe_path') => void
}) {
  const { t } = useI18n()
  const [guide, setGuide] = useState<string | null>(null)
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
      {guide && <GuideCarousel guideKey={guide} onClose={() => setGuide(null)} />}
    </div>
  )
}
