import { TabHeader } from './FieldComponents'
import { useI18n } from '../../i18n'
import type { PodcastConfig } from '@shared/types'

export default function TabTools({
  form,
  update,
  cleaningTemp,
  tempCleanResult,
  onCleanTemp,
}: {
  form: PodcastConfig
  update: (key: keyof PodcastConfig, value: PodcastConfig[keyof PodcastConfig]) => void
  cleaningTemp: boolean
  tempCleanResult: string | null
  onCleanTemp: () => void
}) {
  const { t } = useI18n()
  return (
    <div>
      <TabHeader title={t('工具与维护')} subtitle={t('清理临时文件释放磁盘空间')} />
      <div className="settings-grid">
        <div className="settings-field">
          <div className="settings-field-label">{t('清理临时文件')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={onCleanTemp}
              disabled={cleaningTemp}
              className="settings-browse-button"
              style={{ whiteSpace: 'nowrap' }}
            >
              {cleaningTemp ? t('清理中…') : t('立即清理')}
            </button>
            {tempCleanResult && (
              <span
                style={{
                  fontSize: 12,
                  color: tempCleanResult.includes('已清理') ? 'var(--success)' : 'var(--error)',
                }}
              >
                {t(tempCleanResult)}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {t('清理下载的音频缓存和临时文件，释放磁盘空间')}
          </div>
        </div>

        <div className="settings-field">
          <div className="settings-field-label">{t('软件更新')}</div>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={form.auto_update_check !== false}
              onChange={e => update('auto_update_check', e.target.checked)}
            />
            {t('自动检查更新')}
          </label>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 8px 24px' }}>
            {t('有更新时左下角版本号会高亮显示，点击版本号查看')}
          </div>
          <label className="settings-checkbox">
            <input
              type="checkbox"
              checked={!!form.auto_update_download}
              onChange={e => update('auto_update_download', e.target.checked)}
            />
            {t('发现更新后自动下载')}
          </label>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0 24px' }}>
            {t('开启后在后台自动下载，下载完成后提示重启')}
          </div>
        </div>
      </div>
    </div>
  )
}
