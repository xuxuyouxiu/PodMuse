import { PodcastConfig } from '@shared/types'
import { TabHeader, DirField } from './FieldComponents'

export default function TabTranscribe({
  form,
  update,
  onBrowse,
}: {
  form: PodcastConfig
  update: (key: keyof PodcastConfig, value: string | boolean) => void
  onBrowse: (key: 'obsidian_dir' | 'audio_dir' | 'whisper_exe_path') => void
}) {
  return (
    <div>
      <TabHeader title="转写偏好" subtitle="设置语音识别语言和文件存储位置" />
      <div className="settings-grid">
        <div className="settings-field">
          <div className="settings-field-label">语音识别语言</div>
          <div className="settings-radio-grid">
            {(
              [
                { val: 'zh', label: '中文' },
                { val: 'en', label: '英文' },
                { val: 'auto', label: '自动检测 (中英混合)' },
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
          label="Obsidian 笔记目录"
          value={form.obsidian_dir}
          onBrowse={() => onBrowse('obsidian_dir')}
        />
        <DirField
          label="音频缓存目录"
          value={form.audio_dir}
          placeholder="默认（用户数据目录）"
          onBrowse={() => onBrowse('audio_dir')}
        />
      </div>
    </div>
  )
}
