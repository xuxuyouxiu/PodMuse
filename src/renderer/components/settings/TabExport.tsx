import { useState } from 'react'
import { PodcastConfig } from '@shared/types'
import { TabHeader, DirField, Field } from './FieldComponents'

interface Props {
  form: PodcastConfig
  update: (key: keyof PodcastConfig, value: PodcastConfig[keyof PodcastConfig]) => void
}

const DEFAULT_EXPORT = {
  logseq_dir: '',
  notion: { token: '', database_id: '' },
}

export default function TabExport({ form, update }: Props) {
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
        setTestResult({ success: true, message: `已连接（database: ${result.databaseTitle}）` })
      } else {
        setTestResult({ success: false, message: result.error || '测试失败' })
      }
    } catch (e) {
      setTestResult({ success: false, message: `测试失败: ${(e as Error).message}` })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div>
      <TabHeader title="导出" subtitle="配置笔记导出到其他平台（Markdown / Logseq / Notion）" />

      {/* Logseq */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
          Logseq 目录
        </div>
        <DirField
          label="Logseq graph 目录"
          value={exportConfig.logseq_dir}
          placeholder="未设置"
          onBrowse={handleBrowseLogseq}
        />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
          配置后，完成笔记的任务卡片「导出」按钮可直接复制到该目录。Logseq 兼容 Obsidian 的 wiki-link 语法，无需转换。
        </div>
      </div>

      {/* Notion */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
          Notion 集成
        </div>
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
          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx 或 database URL"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <button
            onClick={handleTestConnection}
            disabled={testing || !notion.token.trim() || !notion.database_id.trim()}
            className="tailbar-button"
            style={{
              padding: '6px 12px',
              fontSize: 12,
              opacity: testing || !notion.token.trim() || !notion.database_id.trim() ? 0.6 : 1,
            }}
          >
            {testing ? '测试中…' : '测试连接'}
          </button>
          {testResult && (
            <span style={{
              fontSize: 11,
              color: testResult.success ? 'var(--success)' : 'var(--error)',
            }}>
              {testResult.success ? '✓ ' : '✗ '}{testResult.message}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
          在 Notion 中创建 integration（<a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>https://www.notion.so/my-integrations</a>），将目标 database 分享给该 integration，复制 token 和 database ID 填入上方。Database 需包含 title 列，可选列：show/episode/host/guest/platform（rich_text）、date（date）、category/platform（select）、tags（multi_select）。
        </div>
      </div>
    </div>
  )
}
