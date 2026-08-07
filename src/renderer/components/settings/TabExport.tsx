import { useState } from 'react'
import { PodcastConfig } from '@shared/types'
import { TabHeader, DirField, Field } from './FieldComponents'
import { useI18n } from '../../i18n'

interface Props {
  form: PodcastConfig
  update: (key: keyof PodcastConfig, value: PodcastConfig[keyof PodcastConfig]) => void
}

const DEFAULT_EXPORT = {
  logseq_dir: '',
  notion: { token: '', database_id: '' },
}

export default function TabExport({ form, update }: Props) {
  const { t } = useI18n()
  // 向后兼容旧 config（无 export 字段）
  const exportConfig = form.export || DEFAULT_EXPORT
  const notion = exportConfig.notion || { token: '', database_id: '' }

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  function updateLogseqDir(dir: string) {
    update('export', { ...exportConfig, logseq_dir: dir })
  }

  function updateNotionField(field: 'token' | 'database_id', value: string) {
    update('export', {
      ...exportConfig,
      notion: { ...notion, [field]: value },
    })
  }

  async function handleBrowseLogseq() {
    const dir = await window.electronAPI.selectDir()
    if (dir) {
      updateLogseqDir(dir)
      // 重置 Notion 测试结果（不相关但保持状态一致）
    }
  }

  async function handleTestConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await window.electronAPI.testNotionConnection({
        token: notion.token,
        databaseId: notion.database_id,
      })
      if (result.success) {
        setTestResult({ success: true, message: t('已连接') + ` (database: ${result.databaseTitle})` })
      } else {
        setTestResult({ success: false, message: result.error || t('测试失败') })
      }
    } catch (e) {
      setTestResult({ success: false, message: t('测试失败') + ': ' + (e as Error).message })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div>
      <TabHeader title={t('导出')} subtitle={t('配置笔记导出到其他平台（Markdown / Logseq / Notion）')} />

      {/* Logseq */}
      <div style={{ marginBottom: 28 }}>
        <div className="settings-section-title" style={{ marginBottom: 8 }}>
          {t('Logseq 目录')}
        </div>
        <DirField
          label={t('Logseq graph 目录')}
          value={exportConfig.logseq_dir}
          placeholder={t('未设置')}
          onBrowse={handleBrowseLogseq}
        />
        <div className="settings-hint" style={{ marginTop: 6 }}>
          {t('配置后，完成笔记的任务卡片「导出」按钮可直接复制到该目录。Logseq 兼容 Obsidian 的 wiki-link 语法，无需转换。')}
        </div>
      </div>

      {/* Notion */}
      <div>
        <div className="settings-section-title" style={{ marginBottom: 8 }}>
          {t('Notion 集成')}
        </div>
        <div className="settings-grid">
          <Field
            label="Integration Token"
            value={notion.token}
            onChange={v => updateNotionField('token', v)}
            secret
            placeholder="secret_xxxxxxxxxxxxxxxxxxx"
          />
          <Field
            label="Database ID"
            value={notion.database_id}
            onChange={v => updateNotionField('database_id', v)}
            placeholder={`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx ${t('或')} database URL`}
          />
        </div>
        <div className="settings-test-row">
          <button
            onClick={handleTestConnection}
            disabled={testing || !notion.token.trim() || !notion.database_id.trim()}
            className="settings-browse-button"
            style={{
              opacity: testing || !notion.token.trim() || !notion.database_id.trim() ? 0.6 : 1,
            }}
          >
            {testing ? t('测试中…') : t('测试连接')}
          </button>
          {testResult && (
            <span
              className={
                testResult.success
                  ? 'settings-test-result--success'
                  : 'settings-test-result--error'
              }
            >
              {testResult.success ? '✓ ' : '✗ '}
              {t(testResult.message)}
            </span>
          )}
        </div>
        <div className="settings-hint" style={{ marginTop: 8 }}>
          {t('在 Notion 中创建 integration（')}
          <span
            onClick={() => window.electronAPI.openExternal('https://www.notion.so/my-integrations')}
            className="settings-link-button"
            style={{ display: 'inline' }}
          >
            https://www.notion.so/my-integrations
          </span>
          {t('），将目标 database 分享给该 integration，复制 token 和 database ID 填入上方。Database 需包含 title 列，可选列：show/episode/host/guest/platform（rich_text）、date（date）、category/platform（select）、tags（multi_select）。')}
        </div>
      </div>
    </div>
  )
}
