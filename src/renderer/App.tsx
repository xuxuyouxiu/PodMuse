import { useState, useEffect, useCallback, useRef } from 'react'
import { StepInfo, PodcastConfig, FeishuStatus, RecentTaskState } from '@shared/types'
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
  const [toast, setToast] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const cancelFlag = useRef(false)

  const paused = !processing && steps.every(s => s.status === 'stopped')
  const workflowStateLabel = processing ? '处理中' : cancelling ? '停止中' : paused ? '已暂停' : '待命中'

  const step1 = steps[0]
  const PLACEHOLDER_TITLES = new Set(['提取音频链接', '提取音频'])
  const currentTitle = (step1 && step1.status !== 'pending' && step1.subtitle && !PLACEHOLDER_TITLES.has(step1.subtitle))
    ? step1.subtitle
    : null

  useEffect(() => {
    window.electronAPI.getConfig().then(setConfig)
    window.electronAPI.getTasks().then(({ activeTasks: aTasks, recentTasks: rTasks }) => {
      setActiveTasks(aTasks)
      setRecentTasks(rTasks)
      const latestPending = aTasks.find(task => task.status !== 'completed')
      setLastUrl(latestPending?.url || aTasks[0]?.url || null)
    })
    window.electronAPI.onStepUpdate((step: StepInfo) => {
      setSteps(prev => prev.map(s => s.step === step.step ? { ...s, ...step } : s))
    })
    window.electronAPI.onFeishuStatus((status: FeishuStatus) => {
      setFeishuStatus(status)
    })
    window.electronAPI.onProcessingChange((p: boolean, url?: string) => {
      setProcessing(p)
      if (p && url) setLastUrl(url)
      if (!p && cancelFlag.current) {
        cancelFlag.current = false
        setCancelling(false)
      }
    })
    window.electronAPI.onTasksChanged(() => {
      window.electronAPI.getTasks().then(({ activeTasks: aTasks, recentTasks: rTasks }) => {
        setActiveTasks(aTasks)
        setRecentTasks(rTasks)
        if (aTasks.length === 0 && !processing) {
          setLastUrl(null)
        }
      })
    })
  }, [])

  useEffect(() => {
    window.electronAPI.startFeishu().then(s => s && setFeishuStatus(s))
  }, [])

  useEffect(() => {
    document.body.dataset.theme = theme
  }, [theme])

  const handleProcessWithMode = useCallback(async (url: string, force: boolean, taskId?: string) => {
    cancelFlag.current = false
    setProcessing(true)
    setLastUrl(url)
    setSteps(STEP_DEFS.map((s, i) => ({ ...s, step: i + 1, status: 'pending' as const })))
    const result = await window.electronAPI.processPodcast(url, force, taskId)
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

  const handleTaskResume = useCallback((task: RecentTaskState) => {
    cancelFlag.current = false
    setCancelling(false)
    setLastUrl(task.url)
    handleProcessWithMode(task.url, true, task.id)
  }, [handleProcessWithMode])

  const handleTaskReplay = useCallback((task: RecentTaskState) => {
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
    setToast('保存成功')
    setTimeout(() => setToast(null), 2000)
  }, [])

  const handleCleanTemp = useCallback(async () => {
    await window.electronAPI.cleanTemp()
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const nextTheme = current === 'dark' ? 'light' : 'dark'
      localStorage.setItem('podcast-theme', nextTheme)
      return nextTheme
    })
  }, [])

  return (
    <>
      <div className="workspace-shell">
        <WorkspaceSidebar 
          onSettings={() => setSettingsOpen(true)}
          onAbout={() => setAboutOpen(true)}
        />
        <div className="workspace-main">
          <Header theme={theme} onToggleTheme={toggleTheme} status={feishuStatus} />
          <div className="workspace-body">
            <div className="workspace-main-column">
              <div className="workspace-content">
                <section className="workspace-hero">
                  <div className="workspace-hero__eyebrow">AI 播客工作区</div>
                  <div className="workspace-hero__header">
                    <div>
                      <h1 className="workspace-hero__title">欢迎回来</h1>
                      <p className="workspace-hero__description">
                        粘贴小宇宙链接后，应用会依次完成提取、下载、转写、校对和笔记整理。
                      </p>
                    </div>
                    <div className="workspace-hero__badge">{workflowStateLabel}</div>
                  </div>
                  {currentTitle && (
                    <div className="workspace-hero__meta">
                      <span className="workspace-hero__meta-label">当前节目</span>
                      <span className="workspace-hero__meta-value">{currentTitle}</span>
                    </div>
                  )}
                </section>
                <section className="workspace-input-card" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <UrlInput onProcess={handleProcess} disabled={processing || cancelling} />
                  <FileDropArea onProcessFile={handleProcessFile} disabled={processing || cancelling} />
                </section>
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
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
                <ActiveTasksPanel tasks={activeTasks} processing={processing} onCancel={async (taskId: string) => {
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
                <RecentTasksPanel tasks={recentTasks} processing={processing || cancelling} onResume={handleTaskResume} onReplay={handleTaskReplay} onDelete={handleTaskDelete} />
              </div>
            </aside>
          </div>
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
          background: 'var(--bg-elevated)', border: '1px solid var(--success)',
          color: 'var(--success)', padding: '10px 24px', borderRadius: 'var(--radius-md)',
          fontSize: 13, fontWeight: 600, zIndex: 2000,
          animation: 'toastIn 0.3s ease',
        }}>
          ✓ {toast}
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
      <style>{`
        @keyframes toastIn { from { opacity:0; transform:translateX(-50%) translateY(10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
      `}</style>
    </>
  )
}
