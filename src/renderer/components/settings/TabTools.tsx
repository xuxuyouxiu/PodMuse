import { TabHeader } from './FieldComponents'

export default function TabTools({ cleaningTemp, tempCleanResult, onCleanTemp }: {
  cleaningTemp: boolean
  tempCleanResult: string | null
  onCleanTemp: () => void
}) {
  return (
    <div>
      <TabHeader title="工具与维护" subtitle="清理临时文件释放磁盘空间" />
      <div className="settings-grid">
        <div className="settings-field">
          <div className="settings-field-label">清理临时文件</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={onCleanTemp}
              disabled={cleaningTemp}
              className="settings-browse-button"
              style={{ whiteSpace: 'nowrap' }}
            >
              {cleaningTemp ? '清理中…' : '立即清理'}
            </button>
            {tempCleanResult && (
              <span style={{
                fontSize: 12,
                color: tempCleanResult.includes('已清理') ? '#4caf50' : 'var(--error)'
              }}>
                {tempCleanResult}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            清理下载的音频缓存和临时文件，释放磁盘空间
          </div>
        </div>
      </div>
    </div>
  )
}
