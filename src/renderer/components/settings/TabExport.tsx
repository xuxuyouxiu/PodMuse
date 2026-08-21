import { useEffect, useState } from 'react'
import { PodcastConfig } from '@shared/types'
import { TabHeader, DirField, Field } from './FieldComponents'
import { useI18n } from '../../i18n'
import { BookOpen } from 'lucide-react'
import GuideCarousel from '../GuideCarousel'
import NotionOAuthCard from './NotionOAuthCard'
import { useClipboardFill } from '../../hooks/useClipboardFill'
import {
  extractFieldValue,
  NOTION_DB_ID_PATTERN,
  NOTION_TOKEN_PATTERN,
} from '../../data/clipboard-field-patterns'

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
  const [guideKey, setGuideKey] = useState<string | null>(null)
  const [notionAdvancedOpen, setNotionAdvancedOpen] = useState(false)
  // Token 明文不回显（主进程加密存储），配置状态经 notion:exportStatus IPC 读取
  const [notionTokenConfigured, setNotionTokenConfigured] = useState(false)
  // 手动模式：列出当前 Token 可访问的数据库（下拉选择，免手动找 id）
  const [dbLoading, setDbLoading] = useState(false)
  const [dbList, setDbList] = useState<{ id: string; title: string }[]>([])
  const [dbError, setDbError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.electronAPI
      .getNotionExportStatus()
      .then(s => {
        if (!cancelled) setNotionTokenConfigured(s.configured)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

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

  async function handleListDatabases() {
    setDbLoading(true)
    setDbError(null)
    try {
      const res = await window.electronAPI.notionListManualDatabases()
      if (res.success) {
        setDbList(res.databases || [])
        if ((res.databases || []).length === 0) setDbError(t('当前 Token 可访问的数据库列表为空（请先在 Notion 中创建数据库并授权连接）'))
      } else {
        setDbError(res.error || t('获取数据库列表失败'))
      }
    } catch {
      setDbError(t('获取数据库列表失败'))
    } finally {
      setDbLoading(false)
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

  // Notion 高级模式：剪贴板无感填充（secret_ → token，32 位 hex → database ID）。
  // 只填仍为空的字段，已填内容不覆盖（替换请用「粘贴」按钮）；未展开高级模式不轮询。
  useClipboardFill({
    active: notionAdvancedOpen && !notion.token.trim(),
    patterns: [NOTION_TOKEN_PATTERN],
    onFill: value => updateNotionField('token', value),
  })

  useClipboardFill({
    active: notionAdvancedOpen && !notion.database_id.trim(),
    patterns: [NOTION_DB_ID_PATTERN],
    onFill: value => updateNotionField('database_id', value),
  })

  // 「粘贴」兜底：读剪贴板填入指定字段（可识别值优先提取，否则原样填入）
  async function pasteNotionField(field: 'token' | 'database_id') {
    try {
      const text = await window.electronAPI.readClipboardText()
      const trimmed = text.trim()
      if (!trimmed) return
      let value = trimmed
      if (field === 'token') value = extractFieldValue(trimmed, 'notion-token') ?? trimmed
      if (field === 'database_id')
        value = extractFieldValue(trimmed, 'notion-database-id') ?? trimmed
      updateNotionField(field, value)
    } catch (e) {
      console.warn('[clipfill] paste failed:', (e as Error)?.message) // 绝不记录剪贴板内容
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
        <div
          className="settings-dir-row"
          style={{ justifyContent: 'space-between', marginBottom: 8 }}
        >
          <div className="settings-section-title">{t('Notion 集成')}</div>
          <button className="settings-link-button" onClick={() => setGuideKey('notion')}>
            <BookOpen size={11} />
            {t('三步图文')}
          </button>
        </div>
        <NotionOAuthCard />

        <details
          open={notionAdvancedOpen}
          onToggle={e => setNotionAdvancedOpen(e.currentTarget.open)}
          style={{ marginTop: 8 }}
        >
          <summary
            className="settings-link-button"
            style={{ display: 'inline-block', cursor: 'pointer' }}
          >
            {t('高级模式（手动 Token）')}
          </summary>
          <div className="settings-grid" style={{ marginTop: 10 }}>
            <Field
              label="Integration Token"
              value={notion.token}
              onChange={v => updateNotionField('token', v)}
              secret
              placeholder="secret_xxx 或 ntn_xxx（新版连接令牌）"
              onPaste={() => void pasteNotionField('token')}
              pasteTitle="在 Notion 复制对应值后点粘贴"
            />
            {notionTokenConfigured && (
              <div className="settings-hint" style={{ marginTop: 6 }}>
                {t(
                  '✓ 已配置 Notion Token（出于安全不回显；输入新 Token 可替换，留空保存保留原值）',
                )}
              </div>
            )}
            <Field
              label="Database ID"
              value={notion.database_id}
              onChange={v => updateNotionField('database_id', v)}
              placeholder={`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx ${t('或')} database URL`}
              onPaste={() => void pasteNotionField('database_id')}
              pasteTitle="在 Notion 复制对应值后点粘贴"
            />
            <div className="settings-dir-row" style={{ gap: 8, marginTop: 6 }}>
              <button
                className="settings-browse-button"
                onClick={handleListDatabases}
                disabled={dbLoading || !notion.token.trim()}
              >
                {dbLoading ? t('加载中...') : t('刷新数据库列表')}
              </button>
              {dbList.length > 0 && (
                <select
                  className="settings-select"
                  value={notion.database_id}
                  onChange={e => updateNotionField('database_id', e.target.value)}
                  style={{ maxWidth: 260 }}
                >
                  <option value="">{t('选择数据库…')}</option>
                  {dbList.map(db => (
                    <option key={db.id} value={db.id}>
                      {db.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {dbError && (
              <div className="settings-test-result--error" style={{ marginTop: 6, fontSize: 12 }}>
                {dbError}
              </div>
            )}
          </div>
          <div className="settings-hint" style={{ marginTop: 8 }}>
            {t('在 Notion 复制对应值后点粘贴')}；
            {t('复制 token（secret_）或 database ID 后会自动识别填入')}
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
        </details>
      </div>

      {guideKey && <GuideCarousel guideKey={guideKey} onClose={() => setGuideKey(null)} />}
    </div>
  )
}
