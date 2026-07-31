import { useState, useEffect, useCallback, useRef } from 'react'
import { StepInfo, PodcastConfig, FeishuStatus, RecentTaskState, BatchInput, BatchQueueSnapshot, BatchCompletionSummary, BatchTask } from '@shared/types'
import { Zap, Clock } from 'lucide-react'
import Header from './components/Header'
import UrlInput from './components/UrlInput'
import FileDropArea from './components/FileDropArea'
import StepPanel from './components/StepPanel'
import ControlBar from './components/ControlBar'
import ActiveTasksPanel from './components/ActiveTasksPanel'
import RecentTasksPanel from './components/RecentTasksPanel'
import SettingsDialog from './components/SettingsDialog'
import ConfirmDialog from './components/ConfirmDialog'
import AboutDialog from './components/AboutDialog'
import WorkspaceSidebar from './components/WorkspaceSidebar'
import type { SidebarView } from './components/WorkspaceSidebar'
import BacklinkPanel from './components/BacklinkPanel'
import SearchPanel from './components/SearchPanel'
import BatchConfirmPanel from './components/BatchConfirmPanel'
import BatchQueuePanel from './components/BatchQueuePanel'
import CommandPalette, { useAppCommands } from './components/CommandPalette'
import './styles/globals.css'

type ThemeMode = 'dark' | 'light'

const STEP_DEFS = [
  { title: '解析页面', subtitle: '提取音频' },
  { title: '下载音频', subtitle: '获取文件' },
  { title: '语音转文字', subtitle: 'Whisper' },
  { title: '修正专有名词', subtitle: 'DeepSeek' },
  { title: 'AI 提炼笔记', subtitle: 'DeepSeek' },
]

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('podcast-theme')
    return saved === 'light' ? 'light' : 'dark'
  })
  const [config, setConfig] = useState<PodcastConfig | null>(null)
  const [feishuStatus, setFeishuStatus] = useState<FeishuStatus>({ connected: false, monitoring: false, chatId: '' })
  const [steps, setSteps] = useState<StepInfo[]>(STEP_DEFS.map((s, i) => ({ ...s, step: i + 1, status: 'pending' as const })))
  const [processing, setProcessing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [lastUrl, setLastUrl] = useState<string | null>(null)
  const [activeTasks, setActiveTasks] = useState<RecentTaskState[]>([])
  const [recentTasks, setRecentTasks] = useState<RecentTaskState[]>([])
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [rpTab, setRpTab] = useState<'active' | 'recent'>('active')

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [activeView, setActiveView] = useState<SidebarView>('workspace')
  const [batchConfirmItems, setBatchConfirmItems] = useState<BatchInput[] | null>(null)
  const [batchQueueState, setBatchQueueState] = useState<BatchQueueSnapshot | null>(null)
  const [batchCompletion, setBatchCompletion] = useState<BatchCompletionSummary | null>(null)
  const [recoveryInfo, setRecoveryInfo] = useState<{ pending: number; failed: number; total: number; allFailed: boolean } | null>(null)
  const cancelFlag = useRef(false)

  const paused = !processing && steps.every(s => s.status === 'stopped')
  const isBatchActive = batchQueueState && (batchQueueState.status === 'running' || batchQueueState.status === 'paused')
  const workflowStateLabel = isBatchActive
    ? (batchQueueState!.status === 'paused' ? '批量已暂停' : '批量处理中')
    : processing ? '处理中' : cancelling ? '停止中' : paused ? '已暂停' : '待命中'

  const step1 = steps[0]
  const PLACEHOLDER_TITLES = new Set(['提取音频链接', '提取音频'])
  const currentTitle = (step1 && step1.status !== 'pending' && step1.subtitle && !PLACEHOLDER_TITLES.has(step1.subtitle))
    ? step1.subtitle
    : null

  useEffect(() => {
    window.electronAPI.getConfig().then(setConfig).catch((e) => {
      console.error('加载配置失败:', e)
      showToast('加载配置失败', 'error')
    })
    window.electronAPI.getTasks().then(({ activeTasks: aTasks, recentTasks: rTasks }) => {
      setActiveTasks(aTasks)
      setRecentTasks(rTasks)
      const latestPending = aTasks.find(task => task.status !== 'completed')
      setLastUrl(latestPending?.url || aTasks[0]?.url || null)
    }).catch((e) => {
      console.error('加载任务列表失败:', e)
      showToast('加载任务列表失败', 'error')
    })

    const cleanups: (() => void)[] = []
    cleanups.push(window.electronAPI.onStepUpdate((step: StepInfo) => {
      setSteps(prev => prev.map(s => s.step === step.step ? { ...s, ...step } : s))
    }))
    cleanups.push(window.electronAPI.onFeishuStatus((status: FeishuStatus) => {
      setFeishuStatus(status)
    }))
    cleanups.push(window.electronAPI.onProcessingChange((p: boolean, url?: string) => {
      setProcessing(p)
      if (p && url) setLastUrl(url)
      if (!p && cancelFlag.current) {
        cancelFlag.current = false
        setCancelling(false)
      }
    }))
    cleanups.push(window.electronAPI.onTasksChanged(() => {
      window.electronAPI.getTasks().then(({ activeTasks: aTasks, recentTasks: rTasks }) => {
        setActiveTasks(aTasks)
        setRecentTasks(rTasks)
        if (aTasks.length === 0 && !processing) {
          setLastUrl(null)
        }
      }).catch(() => {})
    }))
    cleanups.push(window.electronAPI.onToast((t) => {
      showToast(t.message, t.type)
    }))

    // Batch queue events
    cleanups.push(window.electronAPI.onBatchQueueState((state: BatchQueueSnapshot) => {
      setBatchQueueState(state)
    }))
    cleanups.push(window.electronAPI.onBatchTaskUpdate((index: number, task: BatchTask) => {
      setBatchQueueState(prev => {
        if (!prev) return prev
        const tasks = [...prev.tasks]
        if (index >= 0 && index < tasks.length) {
          tasks[index] = task
        }
        return { ...prev, tasks }
      })
    }))
    cleanups.push(window.electronAPI.onBatchQueueComplete((summary: BatchCompletionSummary) => {
      setBatchCompletion(summary)
    }))

    // Load initial batch state
    window.electronAPI.batchGetState().then((state: BatchQueueSnapshot) => {
      if (state.tasks.length > 0) setBatchQueueState(state)
    }).catch(() => {})

    // Check for recoverable batch queue from previous session
    window.electronAPI.batchCheckRecovery().then((info) => {
      if (info) setRecoveryInfo(info)
    }).catch(() => {})

    return () => { cleanups.forEach(fn => fn?.()) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    window.electronAPI.startFeishu()
      .then(s => s && setFeishuStatus(s))
      .catch(() => {})
  }, [])

  useEffect(() => {
    document.body.dataset.theme = theme
  }, [theme])

  // Ctrl+Shift+P 全局打开命令面板
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault()
        setPaletteOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleProcessWithMode = useCallback(async (url: string, force: boolean, taskId?: string) => {
    cancelFlag.current = false
    setProcessing(true)
    setLastUrl(url)
    setSteps(STEP_DEFS.map((s, i) => ({ ...s, step: i + 1, status: 'pending' as const })))
    const result = await window.electronAPI.processPodcast(url, force, taskId, false)
    setProcessing(false)
    const { activeTasks: aTasks, recentTasks: rTasks } = await window.electronAPI.getTasks()
    setActiveTasks(aTasks)
    setRecentTasks(rTasks)
    const latestPending = aTasks.find((task: RecentTaskState) => task.status !== 'completed')
    setLastUrl(latestPending?.url || aTasks[0]?.url || url)
    if (cancelFlag.current) {
      cancelFlag.current = false
      setCancelling(false)
    }
    return result
  }, [])

  const handleProcess = useCallback(async (url: string) => {
    // Pre-check: has this URL been processed before?
    const wasProcessed = await window.electronAPI.checkProcessed(url).catch(() => false)
    if (wasProcessed) {
      showToast('该播客已处理过，如需重新处理请从历史记录点击"重新处理"', 'error')
      return { success: false, error: '该播客已处理过' }
    }
    return handleProcessWithMode(url, false)
  }, [handleProcessWithMode])

  const handleProcessFile = useCallback(async (filePath: string) => {
    cancelFlag.current = false
    setProcessing(true)
    setLastUrl(filePath)
    setSteps(STEP_DEFS.map((s, i) => ({ ...s, step: i + 1, status: 'pending' as const })))
    const result = await window.electronAPI.processPodcast(filePath, false, undefined, true)
    setProcessing(false)
    const { activeTasks: aTasks, recentTasks: rTasks } = await window.electronAPI.getTasks()
    setActiveTasks(aTasks)
    setRecentTasks(rTasks)
    const latestPending = aTasks.find((task: RecentTaskState) => task.status !== 'completed')
    setLastUrl(latestPending?.url || aTasks[0]?.url || filePath)
    if (cancelFlag.current) {
      cancelFlag.current = false
      setCancelling(false)
    }
    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCancel = useCallback(async () => {
    cancelFlag.current = true
    setCancelling(true)
    const result = await window.electronAPI.cancelProcessing()
    const { activeTasks: aTasks, recentTasks: rTasks } = await window.electronAPI.getTasks()
    setActiveTasks(aTasks)
    setRecentTasks(rTasks)
    if (!result && aTasks.length === 0 && !processing) {
      setCancelling(false)
      cancelFlag.current = false
    }
  }, [processing])

  const handleResume = useCallback(() => {
    if (lastUrl) handleProcess(lastUrl)
  }, [lastUrl, handleProcess])

  const handleReprocess = useCallback((task: RecentTaskState) => {
    cancelFlag.current = false
    setCancelling(false)
    setLastUrl(task.url)
    handleProcessWithMode(task.url, true, task.id)
  }, [handleProcessWithMode])

  // 显示删除确认对话框
  const handleTaskDelete = useCallback((taskId: string) => {
    setDeleteConfirmId(taskId)
  }, [])

  // 执行删除操作
  const confirmDeleteTask = useCallback(async () => {
    if (!deleteConfirmId) return
    
    const { activeTasks: aTasks, recentTasks: rTasks } = await window.electronAPI.removeRecentTask(deleteConfirmId)
    setActiveTasks(aTasks)
    setRecentTasks(rTasks)
    const latestPending = aTasks.find((task: RecentTaskState) => task.status !== 'completed')
    setLastUrl(latestPending?.url || aTasks[0]?.url || null)
    setDeleteConfirmId(null)
  }, [deleteConfirmId])

  const handleSaveConfig = useCallback(async (c: PodcastConfig) => {
    await window.electronAPI.saveConfig(c)
    setConfig(c)
    showToast('保存成功')
    // 保存后自动重启飞书监听器，使用新凭据重新连接
    if (c.feishu_app_id && c.feishu_app_secret) {
      window.electronAPI.startFeishu()
        .then(s => {
          if (s) {
            setFeishuStatus(s)
            if (s.connected) {
              showToast('飞书连接成功', 'success')
            } else {
              showToast('飞书连接失败，请检查 App ID 和 App Secret', 'error')
            }
          }
        })
        .catch(() => {
          showToast('飞书连接异常，请检查配置', 'error')
        })
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const nextTheme = current === 'dark' ? 'light' : 'dark'
      localStorage.setItem('podcast-theme', nextTheme)
      return nextTheme
    })
  }, [])

  // ---- Batch handlers ----

  const handleBatchFiles = useCallback((filePaths: string[]) => {
    const items: BatchInput[] = filePaths.map(p => ({ source: p, type: 'file' as const }))
    setBatchConfirmItems(items)
  }, [])

  const handleBatchUrls = useCallback((urls: string[]) => {
    const items: BatchInput[] = urls.map(u => ({ source: u, type: 'url' as const }))
    setBatchConfirmItems(items)
  }, [])

  const handleBatchConfirm = useCallback(async () => {
    if (!batchConfirmItems) return
    const items = batchConfirmItems
    setBatchConfirmItems(null)
    setBatchCompletion(null)
    await window.electronAPI.batchAdd(items)
    await window.electronAPI.batchStart()
  }, [batchConfirmItems])

  const handleBatchCancel = useCallback(() => {
    setBatchConfirmItems(null)
  }, [])

  const handleBatchRemoveItem = useCallback((index: number) => {
    setBatchConfirmItems(prev => prev ? prev.filter((_, i) => i !== index) : null)
  }, [])

  const handleBatchReorder = useCallback((from: number, to: number) => {
    setBatchConfirmItems(prev => {
      if (!prev) return prev
      const items = [...prev]
      const [moved] = items.splice(from, 1)
      items.splice(to, 0, moved)
      return items
    })
  }, [])

  const handleBatchPause = useCallback(() => {
    window.electronAPI.batchPause()
  }, [])

  const handleBatchResume = useCallback(() => {
    window.electronAPI.batchResume()
  }, [])

  const handleBatchSkip = useCallback((index: number) => {
    window.electronAPI.batchSkip(index)
  }, [])

  const handleBatchClear = useCallback(() => {
    window.electronAPI.batchClear()
    setBatchCompletion(null)
  }, [])

  const handleBatchRetry = useCallback((index: number) => {
    window.electronAPI.batchRetry(index)
  }, [])

  const handleBatchRetryAllFailed = useCallback(async () => {
    if (!batchQueueState) return
    const failedIndices = batchQueueState.tasks
      .map((t, i) => t.status === 'failed' ? i : -1)
      .filter(i => i >= 0)
    for (const i of failedIndices) {
      await window.electronAPI.batchRetry(i)
    }
    await window.electronAPI.batchStart()
    setBatchCompletion(null)
  }, [batchQueueState])

  const handleBatchDismiss = useCallback(() => {
    setBatchQueueState(null)
    setBatchCompletion(null)
    window.electronAPI.batchClear()
  }, [])

  // ---- Batch recovery dialog handlers ----
  const handleRecoveryContinue = useCallback(async () => {
    setRecoveryInfo(null)
    // Load current state and start the queue
    const state = await window.electronAPI.batchGetState()
    setBatchQueueState(state)
    if (state.tasks.some((t: BatchTask) => t.status === 'pending')) {
      await window.electronAPI.batchStart()
    }
  }, [])

  const handleRecoveryDiscard = useCallback(() => {
    setRecoveryInfo(null)
    window.electronAPI.batchClear()
  }, [])

  const commands = useAppCommands({
    theme,
    onToggleTheme: toggleTheme,
    onOpenSettings: () => setSettingsOpen(true),
    onOpenAbout: () => setAboutOpen(true),
    processing,
    onResumeLast: handleResume,
    onCancel: handleCancel,
  })

  if (!config) {
    return (
      <div className="app-skeleton">
        <div className="app-skeleton__sidebar">
          <div className="skeleton" style={{ width: 120, height: 20 }} />
          <div className="skeleton skeleton--text" />
          <div className="skeleton skeleton--text" style={{ width: '80%' }} />
          <div style={{ flex: 1 }} />
          <div className="skeleton skeleton--text" style={{ width: '60%' }} />
          <div className="skeleton skeleton--text" style={{ width: '60%' }} />
        </div>
        <div className="app-skeleton__main">
          <div className="skeleton app-skeleton__topbar" />
          <div className="skeleton app-skeleton__hero">
            <div className="skeleton skeleton--text-sm" style={{ width: '25%' }} />
            <div className="skeleton skeleton--title" />
            <div className="skeleton skeleton--text" style={{ width: '70%' }} />
          </div>
          <div className="skeleton app-skeleton__card">
            <div className="skeleton skeleton--text-sm" style={{ width: '20%' }} />
            <div className="skeleton skeleton--text" />
            <div className="skeleton skeleton--text" style={{ width: '80%' }} />
          </div>
          <div className="skeleton app-skeleton__card">
            <div className="skeleton skeleton--title" style={{ width: '30%' }} />
            <div className="skeleton skeleton--text" />
            <div className="skeleton skeleton--text" style={{ width: '60%' }} />
            <div className="skeleton skeleton--text" style={{ width: '90%' }} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="workspace-shell">
        <WorkspaceSidebar
          activeView={activeView}
          onViewChange={setActiveView}
          onSettings={() => setSettingsOpen(true)}
          onAbout={() => setAboutOpen(true)}
          activeTasks={activeTasks}
          recentTasks={recentTasks}
        />
        <div className="workspace-main">
          <Header theme={theme} onToggleTheme={toggleTheme} status={feishuStatus} />
          {activeView === 'workspace' && (
          <div className="workspace-body">
            <div className="workspace-main-column">
              <div className="workspace-content">
                <section className="workspace-hero">
                  <div className="workspace-hero__eyebrow">AI 播客工作区</div>
                  <div className="workspace-hero__header">
                    <div>
                      <h1 className="workspace-hero__title">欢迎回来</h1>
                      <p className="workspace-hero__description">
                        粘贴播客、视频或音频链接，应用会依次完成提取、下载、转写、校对和笔记整理。
                      </p>
                    </div>
                    <div className="workspace-hero__badge">{workflowStateLabel}</div>
                  </div>
                  <div className="workspace-hero__footer">
                    {currentTitle && (
                      <div className="workspace-hero__meta">
                        <span className="workspace-hero__meta-label">当前节目</span>
                        <span className="workspace-hero__meta-value">{currentTitle}</span>
                      </div>
                    )}
                  </div>
                </section>
                <section className="workspace-input-card" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <UrlInput
                    onProcess={handleProcess}
                    onBatchUrls={handleBatchUrls}
                    disabled={processing || cancelling || !!isBatchActive}
                  />
                  <FileDropArea
                    onProcessFile={handleProcessFile}
                    onBatchFiles={handleBatchFiles}
                    disabled={processing || cancelling || !!isBatchActive}
                  />
                </section>
                {batchConfirmItems && (
                  <BatchConfirmPanel
                    items={batchConfirmItems}
                    onConfirm={handleBatchConfirm}
                    onCancel={handleBatchCancel}
                    onRemoveItem={handleBatchRemoveItem}
                    onReorder={handleBatchReorder}
                  />
                )}
                {batchQueueState && batchQueueState.tasks.length > 0 && (
                  <BatchQueuePanel
                    queueState={batchQueueState}
                    completionSummary={batchCompletion}
                    obsidianDir={config?.obsidian_dir}
                    onPause={handleBatchPause}
                    onResume={handleBatchResume}
                    onSkip={handleBatchSkip}
                    onClear={handleBatchClear}
                    onRetry={handleBatchRetry}
                    onRetryAllFailed={handleBatchRetryAllFailed}
                    onDismiss={handleBatchDismiss}
                  />
                )}
                <section className="workspace-process-card">
                  <StepPanel steps={steps} processing={processing} />
                  <ControlBar
                    processing={processing}
                    cancelling={cancelling}
                    paused={paused}
                    onCancel={handleCancel}
                    onResume={handleResume}
                  />
                </section>
              </div>
            </div>
            <aside className="workspace-aside">
              <div className="rp-tabs">
                <div className="rp-tabs__bar">
                  <button
                    className={`rp-tabs__tab ${rpTab === 'active' ? 'is-active' : ''}`}
                    onClick={() => setRpTab('active')}
                  >
                    <Zap size={13} />
                    活跃任务
                    <span className="rp-tabs__count">{activeTasks.length + (batchQueueState?.tasks.length || 0)}</span>
                  </button>
                  <button
                    className={`rp-tabs__tab ${rpTab === 'recent' ? 'is-active' : ''}`}
                    onClick={() => setRpTab('recent')}
                  >
                    <Clock size={13} />
                    历史记录
                    <span className="rp-tabs__count">{recentTasks.length}</span>
                  </button>
                </div>
                <div className="rp-tabs__content">
                  {rpTab === 'active' && (
                    <ActiveTasksPanel tasks={activeTasks} processing={processing} onResume={handleReprocess} onDelete={handleTaskDelete} batchTasks={batchQueueState?.tasks} batchStatus={batchQueueState?.status} onCancel={async (taskId: string) => {
                      if (taskId) {
                        const result = await window.electronAPI.cancelProcessing()
                        const { activeTasks: aTasks, recentTasks: rTasks } = await window.electronAPI.getTasks()
                        setActiveTasks(aTasks)
                        setRecentTasks(rTasks)
                        if (!result) {
                          cancelFlag.current = false
                          setCancelling(false)
                        }
                      }
                    }} />
                  )}
                  {rpTab === 'recent' && (
                    <RecentTasksPanel
                      tasks={recentTasks}
                      processing={processing || cancelling}
                      onResume={handleReprocess}
                      onReplay={handleReprocess}
                      onDelete={handleTaskDelete}
                      logseqDir={config?.export?.logseq_dir || ''}
                      notionConfigured={!!(config?.export?.notion?.token?.trim() && config?.export?.notion?.database_id?.trim())}
                      onToast={showToast}
                    />
                  )}
                </div>
              </div>
            </aside>
          </div>
          )}
          {activeView === 'backlinks' && (
            <div className="workspace-body">
              <div className="workspace-main-column">
                <div className="workspace-content">
                  <BacklinkPanel />
                </div>
              </div>
            </div>
          )}
          {activeView === 'search' && (
            <div className="workspace-body">
              <div className="workspace-main-column">
                <div className="workspace-content">
                  <SearchPanel />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {settingsOpen && config && (
        <SettingsDialog
          config={config}
          onSave={handleSaveConfig}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {aboutOpen && (
        <AboutDialog onClose={() => setAboutOpen(false)} />
      )}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)',
          border: `1px solid ${toast.type === 'error' ? 'var(--error)' : 'var(--success)'}`,
          color: toast.type === 'error' ? 'var(--error)' : 'var(--success)',
          padding: '10px 24px', borderRadius: 'var(--radius-md)',
          fontSize: 13, fontWeight: 600, zIndex: 2000,
          animation: 'toastIn 0.3s ease',
          maxWidth: 'calc(100vw - 80px)',
          wordBreak: 'break-word',
        }}>
          {toast.type === 'error' ? '✗ ' : '✓ '}{toast.message}
        </div>
      )}
      {deleteConfirmId && (
        <ConfirmDialog
          title="删除任务记录"
          message="确定要删除这条任务记录吗？此操作不可撤销。"
          confirmText="删除"
          cancelText="取消"
          danger={true}
          onConfirm={confirmDeleteTask}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}
      {recoveryInfo && (
        <ConfirmDialog
          title={recoveryInfo.allFailed ? '上次批量处理全部失败' : '有未完成的批量任务'}
          message={
            recoveryInfo.allFailed
              ? `上次 ${recoveryInfo.failed} 个任务全部失败，是否查看并重试？`
              : `上次有 ${recoveryInfo.pending} 个任务未完成${recoveryInfo.failed > 0 ? `，${recoveryInfo.failed} 个失败` : ''}，是否继续处理？`
          }
          confirmText={recoveryInfo.allFailed ? '查看' : '继续'}
          cancelText="放弃"
          onConfirm={handleRecoveryContinue}
          onCancel={handleRecoveryDiscard}
        />
      )}
      <CommandPalette
        commands={commands}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
      <style>{`
        @keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
      `}</style>
    </>
  )
}
